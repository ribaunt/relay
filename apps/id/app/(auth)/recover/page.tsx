'use client';

import {
  useState,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { EyeIcon, ViewOffIcon } from 'hugeicons-react';
import { toast } from 'sonner';
import { generateSRPRegistration } from '@/lib/crypto/srp';
import {
  generateKEKSalt,
  deriveKEK,
  encryptMasterKey,
  KDF_PARAMS,
  initSodium
} from '@/lib/crypto/keys';
import {
  decryptMasterKeyWithRecovery,
  encryptMasterKeyWithRecovery,
  generateRecoveryKey,
  normalizeRecoveryKey
} from '@/lib/crypto/recovery';
import styles from '../auth.module.css';

const CODE_LENGTH = 6;

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

type Step = 'email' | 'code' | 'phrase' | 'done';

export default function RecoverPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newRecoveryPhrase, setNewRecoveryPhrase] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const showErrorToast = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join('');

  const focusIndex = useCallback((i: number) => {
    inputRefs.current[i]?.focus();
  }, []);

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < CODE_LENGTH - 1) {
      focusIndex(index + 1);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        focusIndex(index - 1);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      focusIndex(index - 1);
      e.preventDefault();
    }

    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      focusIndex(index + 1);
      e.preventDefault();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, CODE_LENGTH);

    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < CODE_LENGTH; i++) {
      next[i] = pasted[i] ?? '';
    }
    setDigits(next);

    const lastFilled = Math.min(pasted.length, CODE_LENGTH) - 1;
    focusIndex(lastFilled < CODE_LENGTH - 1 ? lastFilled + 1 : lastFilled);
  }

  async function requestRecoveryCode(e: FormEvent) {
    e.preventDefault();
    setError('');

    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) {
      showErrorToast('Please enter your email.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      showErrorToast('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to request recovery code');
      }

      setEmail(normalizedEmail);
      setStep('code');
    } catch (err) {
      showErrorToast(
        err instanceof Error ? err.message : 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyRecoveryCode(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/recovery/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Invalid recovery code');
      }

      setRecoveryToken(data.recoveryToken as string);
      setStep('phrase');
    } catch (err) {
      showErrorToast(
        err instanceof Error ? err.message : 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function completeRecovery(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!recoveryPhrase.trim()) {
      showErrorToast('Please enter your recovery phrase.');
      return;
    }

    if (newPassword.length < 10) {
      showErrorToast('New password must be at least 10 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showErrorToast('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const normalizedPhrase = normalizeRecoveryKey(recoveryPhrase);

      const keysRes = await fetch('/api/auth/recovery/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryToken, email })
      });

      const keysData = await keysRes.json().catch(() => ({}));
      if (!keysRes.ok) {
        throw new Error(keysData.error ?? 'Failed to load recovery key bundle');
      }

      const masterKey = await decryptMasterKeyWithRecovery(
        keysData.recoveryEncryptedMasterKey as string,
        keysData.recoveryIv as string,
        keysData.recoveryKekSalt as string,
        normalizedPhrase
      );

      const {
        SRPClientSession,
        SRPRoutines,
        SRPParameters,
        bigIntToArrayBuffer,
        arrayBufferToBigInt
      } = await import('tssrp6a');

      const routines = new SRPRoutines(new SRPParameters());
      const client = new SRPClientSession(routines);
      const step1 = await client.step1(`${email}#recovery`, normalizedPhrase);

      const initiateRes = await fetch('/api/recovery-srp/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryToken,
          email,
          clientPublicEphemeral: 'pending'
        })
      });

      const initiateData = await initiateRes.json().catch(() => ({}));
      if (!initiateRes.ok) {
        throw new Error(initiateData.error ?? 'Failed to initiate recovery');
      }

      const base64ToArrayBuffer = (b64: string): ArrayBuffer => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
      };
      const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (const byte of bytes) {
          binary += String.fromCharCode(byte);
        }
        return btoa(binary);
      };

      const saltBigInt = arrayBufferToBigInt(
        base64ToArrayBuffer(initiateData.srpSalt as string)
      );
      const serverBBigInt = arrayBufferToBigInt(
        base64ToArrayBuffer(initiateData.serverPublicEphemeral as string)
      );

      const step2 = await step1.step2(saltBigInt, serverBBigInt);
      const recoveryClientPublicEphemeral = arrayBufferToBase64(
        bigIntToArrayBuffer(step2.A)
      );
      const recoveryClientProof = arrayBufferToBase64(
        bigIntToArrayBuffer(step2.M1)
      );

      const completeRes = await fetch('/api/recovery-srp/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryToken,
          email,
          clientPublicEphemeral: recoveryClientPublicEphemeral,
          clientProof: recoveryClientProof
        })
      });

      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        throw new Error(
          completeData.error ?? 'Recovery phrase verification failed'
        );
      }

      const kekSalt = await generateKEKSalt();
      const kek = await deriveKEK(newPassword, kekSalt);
      const { encrypted: encryptedMasterKey, iv } = await encryptMasterKey(
        masterKey,
        kek
      );

      const { srpSalt, srpVerifier } = await generateSRPRegistration(
        email,
        newPassword
      );

      const rotatedRecoveryPhrase = generateRecoveryKey();
      const normalizedRotatedPhrase = normalizeRecoveryKey(
        rotatedRecoveryPhrase
      );
      const recoveryBlob = await encryptMasterKeyWithRecovery(
        masterKey,
        normalizedRotatedPhrase
      );

      const { srpSalt: recoverySrpSalt, srpVerifier: recoverySrpVerifier } =
        await generateSRPRegistration(
          `${email}#recovery`,
          normalizedRotatedPhrase
        );

      const sodium = await initSodium();

      const resetRes = await fetch('/api/auth/recovery/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryToken,
          email,
          srp_salt: srpSalt,
          srp_verifier: srpVerifier,
          recovery_srp_salt: recoverySrpSalt,
          recovery_srp_verifier: recoverySrpVerifier,
          encrypted_master_key: encryptedMasterKey,
          iv,
          kek_salt: sodium.to_base64(kekSalt),
          kdf_mem_limit: KDF_PARAMS.MEM_LIMIT,
          kdf_ops_limit: KDF_PARAMS.OPS_LIMIT,
          recovery_encrypted_master_key: recoveryBlob.encrypted,
          recovery_iv: recoveryBlob.iv,
          recovery_kek_salt: recoveryBlob.kekSalt
        })
      });

      const resetData = await resetRes.json().catch(() => ({}));
      if (!resetRes.ok) {
        throw new Error(resetData.error ?? 'Failed to complete recovery');
      }

      setNewRecoveryPhrase(rotatedRecoveryPhrase);
      setStep('done');
    } catch (err) {
      showErrorToast(
        err instanceof Error ? err.message : 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }

  function copyRecoveryPhrase() {
    navigator.clipboard.writeText(newRecoveryPhrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
        </div>

        {step === 'email' && (
          <>
            <h1 className={styles.title}>Recover your account</h1>
            <p className={styles.subtitle}>
              Enter your email to receive a recovery verification code.
            </p>

            <form
              onSubmit={requestRecoveryCode}
              className={styles.form}
              noValidate
            >
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className={styles.button}
                disabled={loading}
              >
                {loading && <Spinner size={18} color="var(--accent-text)" />}
                {loading ? 'Sending code...' : 'Send recovery code'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <h1 className={styles.title}>Enter recovery code</h1>
            <p className={styles.subtitle}>
              Enter the 6-digit code sent to {email}.
            </p>

            <form onSubmit={verifyRecoveryCode} className={styles.form} noValidate>
              <div className={styles.codeGroup}>
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className={styles.codeBox}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    autoFocus={i === 0}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <button
                type="submit"
                className={styles.button}
                disabled={loading || code.length !== CODE_LENGTH}
              >
                {loading && <Spinner size={18} color="var(--accent-text)" />}
                {loading ? 'Verifying...' : 'Verify code'}
              </button>
            </form>
          </>
        )}

        {step === 'phrase' && (
          <>
            <h1 className={styles.title}>Verify phrase and reset password</h1>
            <p className={styles.subtitle}>
              Enter your current recovery phrase and choose a new password.
            </p>

            <form onSubmit={completeRecovery} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="recoveryPhrase" className={styles.label}>
                  Recovery phrase
                </label>
                <input
                  id="recoveryPhrase"
                  type="text"
                  className={styles.input}
                  placeholder="word1 word2 ... word12"
                  value={recoveryPhrase}
                  onChange={(e) => setRecoveryPhrase(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="newPassword" className={styles.label}>
                  New password
                </label>
                <div className={styles.passwordWrapper}>
                  <input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    className={`${styles.input} ${styles.passwordInput}`}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={10}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? <ViewOffIcon size={18} /> : <EyeIcon size={18} />}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword" className={styles.label}>
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={`${styles.input} ${styles.passwordInput}`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                className={styles.button}
                disabled={loading}
              >
                {loading && <Spinner size={18} color="var(--accent-text)" />}
                {loading ? 'Recovering...' : 'Recover account'}
              </button>
            </form>
          </>
        )}

        {step === 'done' && (
          <>
            <h1 className={styles.title}>Recovery complete</h1>
            <p className={styles.subtitle}>
              Your password was reset and your recovery phrase was rotated. Save
              this new phrase now.
            </p>

            <div className={styles.recoveryBox}>
              <div className={styles.recoveryTitle}>New recovery phrase</div>
              <div className={styles.recoveryWarning}>
                This phrase replaces your old one and will not be shown again.
              </div>
              <div className={styles.recoveryWords}>{newRecoveryPhrase}</div>
              <div className={styles.recoveryActions}>
                <button
                  type="button"
                  className={styles.buttonSecondary}
                  onClick={copyRecoveryPhrase}
                >
                  {copied ? 'Copied' : 'Copy to clipboard'}
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                router.push('/');
              }}
              className={styles.form}
              style={{ marginTop: 20 }}
            >
              <button type="submit" className={styles.button}>
                I saved my new recovery phrase
              </button>
            </form>
          </>
        )}

        {step !== 'done' && (
          <p className={styles.footer}>
            Remembered your password?{' '}
            <Link href="/login" className={styles.link}>
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
