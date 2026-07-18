'use client';

import {
  Suspense,
  useState,
  useRef,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
  type ClipboardEvent
} from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import styles from '../auth.module.css';

import { Loading03Icon } from 'hugeicons-react';
const CODE_LENGTH = 6;

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = searchParams.get('userId') ?? '';
  const returnTo = getSafeReturnTo(searchParams.get('returnTo'));

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const showErrorToast = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const continueAfterVerify = () => {
    if (returnTo !== '/') {
      window.location.assign(returnTo);
      return;
    }

    router.replace('/');
  };

  const code = digits.join('');

  const focusIndex = useCallback((i: number) => {
    inputRefs.current[i]?.focus();
  }, []);

  function handleDigitChange(index: number, value: string) {
    // Only accept single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    // Auto-advance to next box
    if (digit && index < CODE_LENGTH - 1) {
      focusIndex(index + 1);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Empty box — move back and clear previous
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        focusIndex(index - 1);
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusIndex(index - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
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

    // Focus the last filled box or the next empty one
    const lastFilled = Math.min(pasted.length, CODE_LENGTH) - 1;
    focusIndex(lastFilled < CODE_LENGTH - 1 ? lastFilled + 1 : lastFilled);
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!userId) {
      const message = 'Missing user ID. Please register first.';
      showErrorToast(message);
      return;
    }

    if (code.length !== CODE_LENGTH) {
      const message = 'Please enter all 6 digits.';
      showErrorToast(message);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? 'Verification failed');
      }

      continueAfterVerify();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className={styles.title}>Verify your email</h1>
      <p className={styles.subtitle}>
        Enter the 6-digit code we sent to your email address.
      </p>

      <form onSubmit={handleVerify} className={styles.form} noValidate>
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
          {loading && <Loading03Icon className={styles.spinner} size={18} />}
          {loading ? 'Verifying...' : 'Verify email'}
        </button>
      </form>

      {!userId && (
        <p className={styles.footer}>
          Need an account?{' '}
          <Link href="/register" className={styles.link}>
            Register
          </Link>
        </p>
      )}
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
        </div>

        <Suspense>
          <VerifyEmailForm />
        </Suspense>
      </div>
    </div>
  );
}

function getSafeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/')) {
    return '/';
  }

  return value;
}
