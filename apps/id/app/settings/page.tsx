'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EyeIcon,
  Loading03Icon,
  Upload02Icon,
  ViewOffIcon
} from 'hugeicons-react';
import { toast } from 'sonner';
import { generateSRPRegistration } from '@/lib/crypto/srp';
import {
  decryptMasterKey,
  decryptWithMasterKey,
  deriveKEK,
  encryptMasterKey,
  encryptWithMasterKey,
  generateKEKSalt,
  initSodium,
  KDF_PARAMS
} from '@/lib/crypto/keys';
import { sha256 } from '@/lib/hash';
import styles from './page.module.css';

type SessionMeResponse = {
  authenticated: boolean;
  user?: {
    id: string;
    name: string | null;
    emailVerified: boolean;
    avatarUrl: string | null;
  };
};

type SecurityContextResponse = {
  encryptedMasterKey: string;
  iv: string;
  kekSalt: string;
  kdfMemLimit: number;
  kdfOpsLimit: number;
  emailEncrypted: string;
  emailIv: string;
  hasPendingEmailChange: boolean;
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const SUPPORTED_AVATAR_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
];

const isValidEmail = (value: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const getPasswordStrength = (value: string): number => {
  let score = 0;
  if (value.length >= 10) score += 1;
  if (/[a-z]/.test(value)) score += 1;
  if (/[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  return score;
};

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('Relay User');
  const [displayNameDraft, setDisplayNameDraft] = useState('Relay User');
  const [emailVerified, setEmailVerified] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [emailDraft, setEmailDraft] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailPendingVerification, setEmailPendingVerification] = useState(false);
  const [savingEmailRequest, setSavingEmailRequest] = useState(false);
  const [savingEmailConfirm, setSavingEmailConfirm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordStrength = useMemo(
    () => getPasswordStrength(newPassword),
    [newPassword]
  );

  const refreshSession = async (): Promise<SessionMeResponse['user']> => {
    const res = await fetch('/api/session/me', {
      method: 'GET',
      credentials: 'include'
    });

    if (!res.ok) {
      throw new Error('Session check failed.');
    }

    const data = (await res.json()) as SessionMeResponse;
    if (!data.authenticated || !data.user) {
      throw new Error('Authentication required.');
    }

    setDisplayName(data.user.name ?? 'Relay User');
    setDisplayNameDraft(data.user.name ?? 'Relay User');
    setEmailVerified(data.user.emailVerified);
    setAvatarUrl(data.user.avatarUrl);

    return data.user;
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        await refreshSession();

        const contextRes = await fetch('/api/settings/security/context', {
          method: 'GET',
          credentials: 'include'
        });

        if (contextRes.ok) {
          const context = (await contextRes.json()) as SecurityContextResponse;
          setEmailPendingVerification(context.hasPendingEmailChange);
        }

        setLoading(false);
      } catch {
        router.replace('/login');
      }
    };

    void checkSession();
  }, [router]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loading03Icon className={styles.loadingIcon} size={40} />
      </div>
    );
  }

  const setErrorStatus = (message: string) => {
    toast.error(message);
  };

  const setSuccessStatus = (message: string) => {
    toast.success(message);
  };

  const fetchSecurityContext = async (): Promise<SecurityContextResponse> => {
    const contextRes = await fetch('/api/settings/security/context', {
      method: 'GET',
      credentials: 'include'
    });

    const contextData = (await contextRes.json().catch(() => ({}))) as
      | SecurityContextResponse
      | { error?: string };

    if (!contextRes.ok) {
      throw new Error(
        (contextData as { error?: string }).error ??
          'Unable to load security context.'
      );
    }

    return contextData as SecurityContextResponse;
  };

  const updateDisplayName = async () => {
    const normalized = displayNameDraft.trim();
    if (normalized.length === 0) {
      setErrorStatus('Display name is required.');
      return;
    }

    setSavingName(true);

    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName: normalized })
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update display name.');
      }

      setDisplayName(normalized);
      setDisplayNameDraft(normalized);
      setSuccessStatus('Display name updated.');
    } catch (err) {
      setErrorStatus(
        err instanceof Error ? err.message : 'Failed to update display name.'
      );
    } finally {
      setSavingName(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!SUPPORTED_AVATAR_TYPES.includes(file.type)) {
      setErrorStatus('Unsupported image format. Use JPG, PNG, WEBP, or GIF.');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setErrorStatus('Image is too large. Maximum size is 5MB.');
      return;
    }

    setUploadingAvatar(true);

    try {
      const uploadUrlRes = await fetch('/api/settings/avatar/upload-url', {
        method: 'POST',
        credentials: 'include'
      });

      const uploadUrlData = (await uploadUrlRes
        .json()
        .catch(() => ({}))) as { uploadUrl?: string; error?: string };

      if (!uploadUrlRes.ok || !uploadUrlData.uploadUrl) {
        throw new Error(uploadUrlData.error ?? 'Failed to initialize upload.');
      }

      const uploadRes = await fetch(uploadUrlData.uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });

      const uploaded = (await uploadRes.json().catch(() => ({}))) as {
        storageId?: string;
      };

      if (!uploadRes.ok || !uploaded.storageId) {
        throw new Error('Avatar upload failed.');
      }

      const commitRes = await fetch('/api/settings/avatar/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ storageId: uploaded.storageId })
      });

      const commitData = (await commitRes.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!commitRes.ok) {
        throw new Error(commitData.error ?? 'Failed to save avatar.');
      }

      await refreshSession();
      setSuccessStatus('Profile picture updated.');
    } catch (err) {
      setErrorStatus(
        err instanceof Error ? err.message : 'Failed to update profile picture.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const requestEmailChange = async () => {
    const normalizedEmail = emailDraft.toLowerCase().trim();
    if (!isValidEmail(normalizedEmail)) {
      setErrorStatus('Please enter a valid email address.');
      return;
    }

    if (!emailPassword.trim()) {
      setErrorStatus('Enter your current password to continue.');
      return;
    }

    setSavingEmailRequest(true);

    try {
      const security = await fetchSecurityContext();
      const sodium = await initSodium();

      const kek = await deriveKEK(
        emailPassword,
        sodium.from_base64(security.kekSalt)
      );

      const masterKey = await decryptMasterKey(
        security.encryptedMasterKey,
        security.iv,
        kek
      );

      const { encrypted, iv } = await encryptWithMasterKey(
        normalizedEmail,
        masterKey
      );
      const emailHash = await sha256(normalizedEmail);

      const { srpSalt, srpVerifier } = await generateSRPRegistration(
        normalizedEmail,
        emailPassword
      );

      const res = await fetch('/api/settings/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plainEmail: normalizedEmail,
          email_hash: emailHash,
          email_encrypted: encrypted,
          email_iv: iv,
          srp_salt: srpSalt,
          srp_verifier: srpVerifier
        })
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to send verification code.');
      }

      setEmailPendingVerification(true);
      setSuccessStatus('Verification code sent to your new email address.');
    } catch (err) {
      setErrorStatus(
        err instanceof Error ? err.message : 'Failed to request email change.'
      );
    } finally {
      setSavingEmailRequest(false);
    }
  };

  const confirmEmailChange = async () => {
    if (!/^\d{6}$/.test(emailCode.trim())) {
      setErrorStatus('Enter the 6-digit verification code.');
      return;
    }

    setSavingEmailConfirm(true);

    try {
      const res = await fetch('/api/settings/email/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: emailCode.trim() })
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to verify code.');
      }

      setEmailPendingVerification(false);
      setEmailCode('');
      setEmailDraft('');
      setEmailPassword('');
      await refreshSession();
      setSuccessStatus('Email updated and verified.');
    } catch (err) {
      setErrorStatus(
        err instanceof Error ? err.message : 'Failed to confirm email change.'
      );
    } finally {
      setSavingEmailConfirm(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword.trim()) {
      setErrorStatus('Enter your current password.');
      return;
    }

    if (getPasswordStrength(newPassword) < 4) {
      setErrorStatus(
        'Use a stronger password (10+ chars with upper/lowercase, number, and symbol).'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorStatus('New passwords do not match.');
      return;
    }

    setSavingPassword(true);

    try {
      const security = await fetchSecurityContext();
      const sodium = await initSodium();

      const oldKek = await deriveKEK(
        currentPassword,
        sodium.from_base64(security.kekSalt)
      );

      const masterKey = await decryptMasterKey(
        security.encryptedMasterKey,
        security.iv,
        oldKek
      );

      const currentEmail = await decryptWithMasterKey(
        security.emailEncrypted,
        security.emailIv,
        masterKey
      );

      const { srpSalt, srpVerifier } = await generateSRPRegistration(
        currentEmail,
        newPassword
      );

      const nextKekSalt = await generateKEKSalt();
      const nextKek = await deriveKEK(newPassword, nextKekSalt);
      const { encrypted: encryptedMasterKey, iv } = await encryptMasterKey(
        masterKey,
        nextKek
      );

      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          srp_salt: srpSalt,
          srp_verifier: srpVerifier,
          encrypted_master_key: encryptedMasterKey,
          iv,
          kek_salt: sodium.to_base64(nextKekSalt),
          kdf_mem_limit: KDF_PARAMS.MEM_LIMIT,
          kdf_ops_limit: KDF_PARAMS.OPS_LIMIT
        })
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to update password.');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessStatus(
        'Password updated. Other active sessions were revoked for security.'
      );
    } catch (err) {
      setErrorStatus(
        err instanceof Error ? err.message : 'Failed to update password.'
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const avatarLetter = displayName[0]?.toUpperCase() ?? 'R';
  const passwordStrengthPercent = Math.max(0, Math.min(100, passwordStrength * 20));
  const passwordStrengthLabel =
    passwordStrength <= 1
      ? 'Weak'
      : passwordStrength <= 3
        ? 'Moderate'
        : passwordStrength === 4
          ? 'Strong'
          : 'Excellent';

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Account center</p>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>
              Manage profile, email, and password with secure workflows designed
              for every device.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => router.push('/')}
            >
              Back to dashboard
            </button>
          </div>
        </header>

        <div className={styles.contentGrid}>
          <div className={styles.column}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Profile</h2>
              <p className={styles.sectionHint}>Customize your public identity.</p>

              <div className={styles.avatarCard}>
                <div className={styles.avatarRow}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className={styles.avatarImage} />
                  ) : (
                    <div className={styles.avatarFallback}>{avatarLetter}</div>
                  )}

                  <div className={styles.avatarMeta}>
                    <p className={styles.avatarName}>{displayName}</p>
                    <p className={styles.avatarHint}>JPG, PNG, WEBP, GIF · Up to 5MB</p>
                  </div>
                </div>

                <label className={styles.fileButton}>
                  <Upload02Icon size={16} />
                  {uploadingAvatar ? 'Uploading...' : 'Upload new photo'}
                  <input
                    type="file"
                    className={styles.fileInput}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploadingAvatar}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadAvatar(file);
                      }
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>

              <div className={styles.field}>
                <label htmlFor="displayName" className={styles.label}>
                  Display name
                </label>
                <input
                  id="displayName"
                  type="text"
                  className={styles.input}
                  value={displayNameDraft}
                  onChange={(event) => setDisplayNameDraft(event.target.value)}
                  maxLength={80}
                />
              </div>

              <button
                type="button"
                className={styles.button}
                disabled={savingName}
                onClick={() => void updateDisplayName()}
              >
                {savingName && <Loading03Icon className={styles.spinner} size={16} />}
                {savingName ? 'Saving...' : 'Save name'}
              </button>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Email</h2>
              <p className={styles.sectionHint}>
                You can securely move your account to a new email address.
              </p>

              <div className={styles.field}>
                <label htmlFor="newEmail" className={styles.label}>
                  New email
                </label>
                <input
                  id="newEmail"
                  type="email"
                  className={styles.input}
                  value={emailDraft}
                  onChange={(event) => setEmailDraft(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="emailPassword" className={styles.label}>
                  Current password
                </label>
                <input
                  id="emailPassword"
                  type="password"
                  className={styles.input}
                  value={emailPassword}
                  onChange={(event) => setEmailPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <button
                type="button"
                className={styles.button}
                disabled={savingEmailRequest}
                onClick={() => void requestEmailChange()}
              >
                {savingEmailRequest && (
                  <Loading03Icon className={styles.spinner} size={16} />
                )}
                {savingEmailRequest ? 'Sending code...' : 'Send verification code'}
              </button>

              {emailPendingVerification && (
                <div className={styles.inlineBlock}>
                  <div className={styles.field}>
                    <label htmlFor="emailCode" className={styles.label}>
                      Verification code
                    </label>
                    <input
                      id="emailCode"
                      type="text"
                      className={styles.input}
                      value={emailCode}
                      onChange={(event) =>
                        setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                    />
                  </div>

                  <button
                    type="button"
                    className={styles.button}
                    disabled={savingEmailConfirm}
                    onClick={() => void confirmEmailChange()}
                  >
                    {savingEmailConfirm && (
                      <Loading03Icon className={styles.spinner} size={16} />
                    )}
                    {savingEmailConfirm ? 'Verifying...' : 'Verify and update email'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={styles.column}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Password & security</h2>
              <p className={styles.sectionHint}>
                Change your password and refresh encrypted key protection.
              </p>

              <div className={styles.field}>
                <label htmlFor="currentPassword" className={styles.label}>
                  Current password
                </label>
                <div className={styles.passwordWrapper}>
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    className={`${styles.input} ${styles.passwordInput}`}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                  >
                    {showCurrentPassword ? (
                      <ViewOffIcon size={16} />
                    ) : (
                      <EyeIcon size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="newPassword" className={styles.label}>
                  New password
                </label>
                <div className={styles.passwordWrapper}>
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    className={`${styles.input} ${styles.passwordInput}`}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? (
                      <ViewOffIcon size={16} />
                    ) : (
                      <EyeIcon size={16} />
                    )}
                  </button>
                </div>
              </div>

              <div className={styles.strengthMeterWrap}>
                <div className={styles.strengthRow}>
                  <span className={styles.strengthLabel}>Strength</span>
                  <span className={styles.strengthValue}>
                    {passwordStrengthLabel} ({passwordStrength}/5)
                  </span>
                </div>
                <div className={styles.strengthMeter}>
                  <div
                    className={styles.strengthFill}
                    style={{ width: `${passwordStrengthPercent}%` }}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword" className={styles.label}>
                  Confirm new password
                </label>
                <div className={styles.passwordWrapper}>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className={`${styles.input} ${styles.passwordInput}`}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? (
                      <ViewOffIcon size={16} />
                    ) : (
                      <EyeIcon size={16} />
                    )}
                  </button>
                </div>
                <p className={styles.passwordHint}>
                  Use at least 10 characters including uppercase, lowercase,
                  number, and symbol.
                </p>
              </div>

              <button
                type="button"
                className={`${styles.button} ${styles.buttonWide}`}
                disabled={savingPassword}
                onClick={() => void changePassword()}
              >
                {savingPassword && <Loading03Icon className={styles.spinner} size={16} />}
                {savingPassword ? 'Updating...' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
