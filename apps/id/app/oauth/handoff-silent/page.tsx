'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { EyeIcon, ViewOffIcon } from 'hugeicons-react';
import { toast } from 'sonner';
import { deriveKEK, decryptMasterKey, initSodium } from '@/lib/crypto/keys';
import { HANDOFF_QUERY_KEYS, type HandoffMode } from '@/lib/master-key-handoff';
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

function parseHandoffRequest(searchParams: URLSearchParams): HandoffRequest | null {
  const mode = searchParams.get(HANDOFF_QUERY_KEYS.mode);
  const nonce = searchParams.get(HANDOFF_QUERY_KEYS.nonce);
  const publicKey = searchParams.get(HANDOFF_QUERY_KEYS.publicKey);
  const origin = searchParams.get(HANDOFF_QUERY_KEYS.origin);
  const clientId = searchParams.get(HANDOFF_QUERY_KEYS.clientId);

  if (
    (mode !== 'popup' && mode !== 'redirect') ||
    !nonce || !publicKey || !origin || !clientId
  ) {
    return null;
  }

  return { mode, nonce, publicKey, origin, clientId };
}

function HandoffSilentContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'password' | 'done'>('loading');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const returnTo = searchParams.get('returnTo') || '/';
  const handoff = parseHandoffRequest(searchParams);

  useEffect(() => {
    void initSodium();
  }, []);

  useEffect(() => {
    if (!handoff) return;
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
          await performClientHandoff(masterKeyHex, handoff!, session.sub);
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
  }, [handoff, returnTo]);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!handoff) return;

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

  if (!handoff) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <p>Invalid handoff parameters.</p>
        </div>
      </div>
    );
  }

  if (status === 'loading' || status === 'done') {
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
