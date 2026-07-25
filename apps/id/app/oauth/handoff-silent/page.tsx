'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { EyeIcon, ViewOffIcon } from 'hugeicons-react';
import { toast } from 'sonner';
import { deriveKEK, decryptMasterKey, initSodium } from '@/lib/crypto/keys';
import { type HandoffMode } from '@/lib/master-key-handoff';
import { confirmSession, performClientHandoff } from '@/lib/perform-handoff';
import { sealMasterKeyForSubject, loadSealedMasterKeyForSubject } from '@relay/core';
import AuthLoadingScreen from '@/components/auth-loading-screen';
import styles from '../../(auth)/auth.module.css';

type HandoffRequest = {
  clientId: string;
  origin: string;
  nonce: string;
  publicKey: string;
  mode: HandoffMode;
};

type RedeemState =
  | { status: 'loading' }
  | { status: 'redeemed'; handoff: HandoffRequest }
  | { status: 'error'; message: string };

function HandoffSilentContent() {
  const searchParams = useSearchParams();
  const [redeemState, setRedeemState] = useState<RedeemState>({ status: 'loading' });
  const [status, setStatus] = useState<'loading' | 'password' | 'done'>('loading');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const returnTo = searchParams.get('returnTo') || '/';
  const ticket = searchParams.get('ticket');

  useEffect(() => {
    void initSodium();
  }, []);

  useEffect(() => {
    if (!ticket) {
      setRedeemState({ status: 'error', message: 'This connection link is invalid or has expired.' });
      return;
    }

    let cancelled = false;

    async function redeemTicket() {
      try {
        const response = await fetch('/api/relay/handoff/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({ ticket }),
        });

        if (cancelled) return;

        if (!response.ok) {
          const data = (await response.json()) as { error?: string };
          setRedeemState({
            status: 'error',
            message: data.error === 'already_redeemed' || data.error === 'expired'
              ? 'This connection link has already been used or has expired. Please try connecting again from Relay Auth.'
              : 'This connection link is invalid. Please try connecting again from Relay Auth.',
          });
          return;
        }

        const data = (await response.json()) as {
          ok: boolean;
          handoff: HandoffRequest;
        };

        if (!cancelled) {
          setRedeemState({ status: 'redeemed', handoff: data.handoff });
        }
      } catch {
        if (!cancelled) {
          setRedeemState({
            status: 'error',
            message: 'Failed to verify connection. Please try again.',
          });
        }
      }
    }

    void redeemTicket();
    return () => { cancelled = true; };
  }, [ticket]);

  useEffect(() => {
    if (redeemState.status !== 'redeemed') return;

    const handoff = redeemState.handoff;
    let cancelled = false;

    async function trySilentUnlock() {
      const session = await confirmSession();
      if (!session || cancelled) {
        if (!cancelled) setStatus('password');
        return;
      }

      try {
        const masterKeyHex = await loadSealedMasterKeyForSubject(session.sub);
        if (cancelled) return;

        if (masterKeyHex) {
          await performClientHandoff(masterKeyHex, handoff, session.sub);
          if (!cancelled) {
            setStatus('done');
            window.location.assign(returnTo);
          }
          return;
        }
      } catch {
        // vault unlock failed, fall through to password prompt
      }

      if (!cancelled) {
        setStatus('password');
      }
    }

    void trySilentUnlock();
    return () => { cancelled = true; };
  }, [redeemState, returnTo]);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (redeemState.status !== 'redeemed') return;

    const handoff = redeemState.handoff;
    setError('');
    setLoading(true);

    try {
      const session = await confirmSession();
      if (!session) {
        throw new Error('Session expired. Please sign in again.');
      }

      const encryptedKeyResult = await fetch('/api/relay/encrypted-master-key', {
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!encryptedKeyResult.ok) {
        throw new Error('Failed to fetch encrypted master key');
      }

      const { encryptedMasterKey, iv, kekSalt } = (await encryptedKeyResult.json()) as {
        encryptedMasterKey: string;
        iv: string;
        kekSalt: string;
      };

      const sodium = await initSodium();
      const kek = await deriveKEK(password, sodium.from_base64(kekSalt));
      const masterKey = await decryptMasterKey(encryptedMasterKey, iv, kek);

      try {
        const masterKeyHex = Array.from(masterKey)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        await sealMasterKeyForSubject(session.sub, masterKeyHex);
        await performClientHandoff(masterKeyHex, handoff, session.sub);
        setStatus('done');
        window.location.assign(returnTo);
      } finally {
        masterKey.fill(0);
        kek.fill(0);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlock.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (redeemState.status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>{redeemState.message}</p>
        </div>
      </div>
    );
  }

  if (redeemState.status === 'loading' || status === 'loading' || status === 'done') {
    return <AuthLoadingScreen />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
        </div>

        <h1 className={styles.title}>Confirm your password</h1>
        <p className={styles.subtitle}>
          Enter your password to finish connecting Relay Auth on this device.
        </p>

        <form onSubmit={handlePasswordSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <ViewOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading && <Spinner size={18} color="var(--accent-text)" />}
            {loading ? 'Unlocking...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function HandoffSilentPage() {
  return (
    <Suspense>
      <HandoffSilentContent />
    </Suspense>
  );
}
