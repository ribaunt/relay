'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';
import { EyeIcon, ViewOffIcon } from 'hugeicons-react';
import { toast } from 'sonner';
import { generateSRPRegistration } from '@/lib/crypto/srp';
import {
  generateMasterKey,
  generateKEKSalt,
  deriveKEK,
  decryptMasterKey,
  encryptMasterKey,
  initSodium,
  KDF_PARAMS
} from '@/lib/crypto/keys';
import {
  type HandoffMode,
  HANDOFF_QUERY_KEYS,
  createMasterKeyHandoff,
  postMasterKeyHandoff,
  writeMasterKeyBridgeCookie
} from '@/lib/master-key-handoff';
import {
  generateRecoveryKey,
  encryptMasterKeyWithRecovery,
  normalizeRecoveryKey
} from '@/lib/crypto/recovery';
import { sha256 } from '@/lib/hash';
import AuthLoadingScreen from '@/components/auth-loading-screen';
import styles from '../auth.module.css';

type Step = 'email' | 'login' | 'register' | 'recovery';
type HandoffRequest = {
  clientId: string;
  origin: string;
  nonce: string;
  publicKey: string;
  mode: HandoffMode;
};
type SRPCompleteResult = {
  sessionToken?: string;
  encryptedMasterKey: string;
  iv: string;
  kekSalt: string;
  kdfMemLimit: number;
  kdfOpsLimit: number;
};

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const nextFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Continue');
  const [error, setError] = useState('');
  const [showShimmer, setShowShimmer] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [userId, setUserId] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void import('tssrp6a');
    void initSodium();
  }, []);

  const returnTo = getSafeReturnTo(searchParams.get('returnTo'));
  const handoffRequest = getHandoffRequest(returnTo);

  const passwordStrength = getPasswordStrength(password);
  const passwordIsWeak = password.length > 0 && passwordStrength.score < 3;
  const confirmPasswordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const showErrorToast = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const continueAfterAuth = () => {
    if (returnTo !== '/') {
      window.location.assign(returnTo);
      return;
    }

    router.replace('/');
  };

  async function storeKekForTokenHandoff(
    kekHex: string,
    sessionToken?: string
  ): Promise<boolean> {
    // Retry a few times in case the session is not yet visible to Convex.
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const hres = await fetch('/api/relay/handoff-master-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            kekHex,
            ...(sessionToken ? { sessionToken } : {})
          })
        });
        if (hres.ok) {
          return true;
        }
        const body = await hres.text().catch(() => '');
        console.warn(
          `handoff-master-key POST returned ${hres.status} (attempt ${attempt + 1}/${maxAttempts})`,
          body
        );
        if (hres.status !== 401 && hres.status !== 503) {
          return false;
        }
      } catch (err) {
        console.warn(
          `handoff-master-key POST network error (attempt ${attempt + 1}/${maxAttempts}):`,
          err
        );
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    return false;
  }

  async function attemptMasterKeyHandoff(
    currentPassword: string,
    completeData: SRPCompleteResult
  ) {
    if (!handoffRequest) {
      return;
    }

    const validationRes = await fetch('/api/relay/handoff/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handoffOrigin: handoffRequest.origin,
        handoffClientId: handoffRequest.clientId,
        returnTo
      })
    });

    if (!validationRes.ok) {
      const vErr = await validationRes.json().catch(() => ({}));
      throw new Error(`Handoff validation failed (${validationRes.status}): ${JSON.stringify(vErr)}`);
    }

    const sodium = await initSodium();
    // Derive KEK from the password — never send the password or plaintext
    // master key to the server. The token endpoint will use this KEK to
    // decrypt the encrypted master-key blob and hand off the plaintext key.
    const kek = await deriveKEK(currentPassword, sodium.from_base64(completeData.kekSalt));

    const kekHex = Array.from(kek)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const stored = await storeKekForTokenHandoff(kekHex, completeData.sessionToken);
    if (!stored) {
      console.warn(
        'Failed to store KEK for token handoff; OAuth token exchange will not include plaintext master key'
      );
    }

    // Also attempt client-side handoff (popup postMessage / bridge cookie) for
    // flows that can receive the key without waiting on the token endpoint.
    const masterKey = await decryptMasterKey(
      completeData.encryptedMasterKey,
      completeData.iv,
      kek
    );

    try {
      const sessionRes = await fetch('/api/session/me', {
        credentials: 'same-origin',
        cache: 'no-store'
      });

      if (!sessionRes.ok) {
        throw new Error(`Session /me returned ${sessionRes.status}`);
      }

      const sessionData = (await sessionRes.json()) as {
        authenticated: boolean;
        user?: { id?: string };
      };

      const sub = sessionData.user?.id;
      if (!sessionData.authenticated || typeof sub !== 'string') {
        throw new Error(`Session /me invalid: authenticated=${sessionData.authenticated}, sub=${typeof sub}`);
      }

      const payload = await createMasterKeyHandoff({
        issuer: window.location.origin,
        audience: handoffRequest.clientId,
        sub,
        nonce: handoffRequest.nonce,
        receiverPublicKey: handoffRequest.publicKey,
        masterKey
      });

      if (handoffRequest.mode === 'redirect') {
        writeMasterKeyBridgeCookie(payload);
      } else {
        postMasterKeyHandoff(payload, handoffRequest.origin);
      }
    } finally {
      masterKey.fill(0);
      kek.fill(0);
    }
  }

  // Step 1: Check if email exists
  async function handleCheckEmail(e: FormEvent) {
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
    setLoadingText('Checking email...');
    await nextFrame();

    try {
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });

      if (!checkRes.ok) {
        const data = await checkRes.json().catch(() => ({}));
        if (checkRes.status === 429) {
          throw new Error('Too many attempts. Please try again later.');
        }
        throw new Error(data.error ?? 'Failed to check email');
      }

      const { exists } = await checkRes.json();

      if (exists) {
        setStep('login');
      } else {
        setStep('register');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      showErrorToast(message);
    } finally {
      setLoading(false);
      setLoadingText('Continue');
    }
  }

  // Step 2: Login with existing account
  async function handleLogin(e: FormEvent) {
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

    if (!password.trim()) {
      showErrorToast('Please enter your password.');
      return;
    }

    setLoading(true);
    setLoadingText('Signing in...');
    await nextFrame();

    try {
      // Import SRP library
      const {
        SRPClientSession,
        SRPRoutines,
        SRPParameters,
        bigIntToArrayBuffer,
        arrayBufferToBigInt
      } = await import('tssrp6a');

      const routines = new SRPRoutines(new SRPParameters());
      const client = new SRPClientSession(routines);
      const step1 = await client.step1(normalizedEmail, password);

      // SRP Step 1: Initiate handshake with server
      const initiateRes = await fetch('/api/srp/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          clientPublicEphemeral: 'pending'
        })
      });

      if (!initiateRes.ok) {
        const data = await initiateRes.json().catch(() => ({}));
        if (initiateRes.status === 429) {
          throw new Error('Too many attempts. Please try again later.');
        }
        throw new Error(data.error ?? 'Login failed');
      }

      const { srpSalt, serverPublicEphemeral } = await initiateRes.json();

      // SRP Step 2: Compute client proof using server's salt and public key
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

      const saltBigInt = arrayBufferToBigInt(base64ToArrayBuffer(srpSalt));
      const serverBBigInt = arrayBufferToBigInt(
        base64ToArrayBuffer(serverPublicEphemeral)
      );

      const step2 = await step1.step2(saltBigInt, serverBBigInt);

      const clientPublicEphemeral = arrayBufferToBase64(
        bigIntToArrayBuffer(step2.A)
      );
      const clientProof = arrayBufferToBase64(bigIntToArrayBuffer(step2.M1));

      // SRP Step 3: Complete handshake with server
      setLoadingText('Verifying credentials...');
      await nextFrame();
      const completeRes = await fetch('/api/srp/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          clientPublicEphemeral,
          clientProof
        })
      });

      if (!completeRes.ok) {
        if (completeRes.status === 429) {
          throw new Error('Too many attempts. Please try again later.');
        }
        throw new Error('Invalid email or password.');
      }

      const completeData = (await completeRes.json()) as SRPCompleteResult;
      const passwordForHandoff = password;

      setLoadingText('Decrypting keys...');
      await nextFrame();

      try {
        await attemptMasterKeyHandoff(passwordForHandoff, completeData);
      } catch (handoffError) {
        console.warn('Master-key handoff failed, falling back to encrypted bootstrap only.', handoffError);
      }

      setShowShimmer(true);
      await nextFrame();

      continueAfterAuth();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      showErrorToast(message);
    } finally {
      setLoading(false);
      setLoadingText('Sign in');
    }
  }

  // Step 3: Register new account
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      showErrorToast('Please enter a password.');
      return;
    }

    if (passwordIsWeak) {
      showErrorToast(
        'Password is too weak. Use at least 10 characters with upper and lower case letters, a number, and a symbol.'
      );
      return;
    }

    if (!confirmPassword.trim()) {
      showErrorToast('Please confirm your password.');
      return;
    }

    if (password !== confirmPassword) {
      showErrorToast('Passwords do not match.');
      return;
    }

    setLoading(true);
    setLoadingText('Generating encryption keys...');
    await nextFrame();

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // 1. Generate master key
      const masterKey = await generateMasterKey();

      // 2. Derive KEK from password and encrypt master key
      setLoadingText('Completing security checks...');
      const kekSalt = await generateKEKSalt();
      const kek = await deriveKEK(password, kekSalt);
      const { encrypted: encryptedMasterKey, iv } = await encryptMasterKey(
        masterKey,
        kek
      );

      // 3. Generate SRP verifier
      const { srpSalt, srpVerifier } = await generateSRPRegistration(
        normalizedEmail,
        password
      );

      // 4. Hash email
      const emailHash = await sha256(normalizedEmail);

      // 5. Generate recovery key and encrypt master key with it
      const recovery = generateRecoveryKey();
      const normalizedRecovery = normalizeRecoveryKey(recovery);
      const recoveryBlob = await encryptMasterKeyWithRecovery(
        masterKey,
        normalizedRecovery
      );

      const { srpSalt: recoverySrpSalt, srpVerifier: recoverySrpVerifier } =
        await generateSRPRegistration(
          `${normalizedEmail}#recovery`,
          normalizedRecovery
        );

      // 7. Get sodium for base64 conversion
      const sodium = await initSodium();

      // 6. Send to server
      setLoadingText('Almost there...');
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          email_hash: emailHash,
          display_name: displayName || undefined,
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Registration failed');
      }

      const data = await res.json();
      setUserId(data.userId);
      setRecoveryKey(recovery);
      setStep('recovery');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      showErrorToast(message);
    } finally {
      setLoading(false);
      setLoadingText('Create account');
    }
  }

  function handleCopyRecovery() {
    navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleContinueRecovery() {
    const params = new URLSearchParams({
      userId
    });

    if (returnTo !== '/') {
      params.set('returnTo', returnTo);
    }

    router.push(`/verify-email?${params.toString()}`);
  }

  function handleBackToEmail() {
    setStep('email');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setError('');
  }

  if (showShimmer) {
    return <AuthLoadingScreen />;
  }

  // Step 1: Email entry
  if (step === 'email') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
          </div>

          <h1 className={styles.title}>Welcome!</h1>
          <p className={styles.subtitle}>Sign in or create an account</p>

          <form onSubmit={handleCheckEmail} className={styles.form} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <button type="submit" className={styles.button} disabled={loading}>
              {loading && <Spinner size={18} color="var(--accent-text)" />}
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>

          <p className={styles.footer}>
            Forgot your password?{' '}
            <Link href="/recover" className={styles.link}>
              Recover account
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Step 2: Login
  if (step === 'login') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
          </div>

          <h1 className={styles.title}>Welcome back!</h1>
          <p className={styles.subtitle}>Sign in to your Relay account</p>

          <form onSubmit={handleLogin} className={styles.form} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                disabled
                autoComplete="email"
              />
            </div>

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
              {loading ? loadingText : 'Sign in'}
            </button>
          </form>

          <p className={styles.footer} style={{ marginTop: 12 }}>
            Forgot your password?{' '}
            <Link href="/recover" className={styles.link}>
              Recover account
            </Link>
          </p>

          <p className={styles.footer}>
            <button
              type="button"
              className={styles.link}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={handleBackToEmail}
            >
              Use a different email
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Step 3: Register
  if (step === 'register') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
          </div>

          <h1 className={styles.title}>Create an account</h1>
          <p className={styles.subtitle}>
            Create a Relay ID to securely access all products.
          </p>

          <form onSubmit={handleRegister} className={styles.form} noValidate>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                disabled
                autoComplete="email"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="displayName" className={styles.label}>
                Display name{' '}
                <span
                  style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}
                >
                  (optional)
                </span>
              </label>
              <input
                id="displayName"
                type="text"
                className={styles.input}
                placeholder="How should we call you?"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                autoFocus
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                Password
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`${styles.input} ${styles.passwordInput}`}
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <div
                className={`${styles.strengthContainer} ${
                  password.length > 0 ? styles.strengthContainerVisible : ''
                }`}
              >
                  <div className={styles.strengthBar}>
                    <div
                      className={styles.strengthFill}
                      style={{
                        width: `${passwordStrength.percent}%`,
                        backgroundColor: passwordStrength.color
                      }}
                    />
                  </div>
                  <div className={styles.strengthLabel}>
                    {passwordStrength.label}
                  </div>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword" className={styles.label}>
                Confirm password
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className={`${styles.input} ${styles.passwordInput} ${
                    confirmPassword.length > 0 && password !== confirmPassword
                      ? styles.inputError
                      : ''
                  }`}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={
                    showConfirmPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showConfirmPassword ? <ViewOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
              {confirmPasswordMismatch && (
                <div className={`${styles.fieldHint} ${styles.fieldHintError}`}>
                  Passwords do not match.
                </div>
              )}
            </div>

            <button type="submit" className={styles.button} disabled={loading}>
              {loading && <Spinner size={18} color="var(--accent-text)" />}
              {loading ? loadingText : 'Create account'}
            </button>
          </form>

          <p className={styles.footer}>
            <button
              type="button"
              className={styles.link}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={handleBackToEmail}
            >
              Use a different email
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Step 4: Recovery key
  if (step === 'recovery') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
          </div>

          <h1 className={styles.title}>Save your recovery key</h1>
          <p className={styles.subtitle}>
            This is the only way to recover your account if you forget your
            password. Write it down and store it somewhere safe.
          </p>

          <div className={styles.recoveryBox}>
            <div className={styles.recoveryTitle}>Recovery key</div>
            <div className={styles.recoveryWarning}>
              This will not be shown again. If you lose it, your data cannot be
              recovered.
            </div>
            <div className={styles.recoveryWords}>{recoveryKey}</div>
            <div className={styles.recoveryActions}>
              <button
                type="button"
                className={styles.buttonSecondary}
                onClick={handleCopyRecovery}
              >
                {copied ? 'Copied' : 'Copy to clipboard'}
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleContinueRecovery();
            }}
            className={styles.form}
            style={{ marginTop: 20 }}
          >
            <button type="submit" className={styles.button}>
              I saved my recovery key
            </button>
          </form>
        </div>
      </div>
    );
  }
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function getPasswordStrength(password: string): {
  score: number;
  percent: number;
  label: string;
  color: string;
} {
  if (password.length === 0)
    return { score: 0, percent: 0, label: '', color: 'transparent' };

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1)
    return { score, percent: 20, label: 'Weak', color: '#dc2626' };
  if (score === 2)
    return { score, percent: 40, label: 'Fair', color: '#f59e0b' };
  if (score === 3)
    return { score, percent: 60, label: 'Good', color: '#f59e0b' };
  if (score === 4)
    return { score, percent: 80, label: 'Strong', color: '#16a34a' };
  return { score, percent: 100, label: 'Very strong', color: '#16a34a' };
}

function getSafeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/')) {
    return '/';
  }

  return value;
}

function getHandoffRequest(returnTo: string): HandoffRequest | null {
  try {
    const parsed = new URL(returnTo, window.location.origin);
    const mode = parsed.searchParams.get(HANDOFF_QUERY_KEYS.mode);
    const nonce = parsed.searchParams.get(HANDOFF_QUERY_KEYS.nonce);
    const publicKey = parsed.searchParams.get(HANDOFF_QUERY_KEYS.publicKey);
    const origin = parsed.searchParams.get(HANDOFF_QUERY_KEYS.origin);
    const clientId = parsed.searchParams.get(HANDOFF_QUERY_KEYS.clientId);

    if (
      (mode !== 'popup' && mode !== 'redirect') ||
      !nonce ||
      !publicKey ||
      !origin ||
      !clientId
    ) {
      return null;
    }

    return {
      mode,
      nonce,
      publicKey,
      origin,
      clientId
    };
  } catch {
    return null;
  }
}
