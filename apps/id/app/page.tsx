'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key01Icon, Loading03Icon, Logout02Icon, Settings01Icon } from 'hugeicons-react';
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

export default function Home() {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionMeResponse['user']>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/session/me', {
          method: 'GET',
          credentials: 'include'
        });

        if (!res.ok) {
          router.push('/login');
          return;
        }

        const data = (await res.json()) as SessionMeResponse;
        if (!data.authenticated || !data.user) {
          router.push('/login');
          return;
        }

        setUser(data.user);
        setLoading(false);
      } catch {
        router.push('/login');
      }
    };

    void checkSession();
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  if (loading || !user) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <Loading03Icon className={styles.loadingIcon} size={44} />
        </div>
      </div>
    );
  }

  if (logoutPending) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <Loading03Icon className={styles.loadingIcon} size={44} />
          <span className={styles.loadingText}>Logging you out...</span>
        </div>
      </div>
    );
  }

  const displayName = user.name ?? 'Relay User';
  const avatarLetter = displayName[0]?.toUpperCase() ?? 'R';

  const handleRelayAuthClick = () => {
    window.location.href = '/api/relay-auth/redirect';
  };

  const handleSettingsClick = () => {
    setMenuOpen(false);
    router.push('/settings');
  };

  const handleLogoutClick = async () => {
    if (logoutPending) return;

    setLogoutPending(true);
    setMenuOpen(false);

    try {
      const res = await fetch('/api/oidc/logout-all', {
        method: 'POST',
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error('Logout failed');
      }
    } catch {
      // Continue with local cleanup even if server logout fails.
    }

    try {
      window.localStorage.clear();
      window.sessionStorage.clear();

      if (window.caches) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((k) => window.caches.delete(k)));
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }

      if (window.indexedDB) {
        const databases = await window.indexedDB.databases();
        await Promise.all(
          databases
            .filter((db) => db.name)
            .map((db) => window.indexedDB.deleteDatabase(db.name!))
        );
      }
    } catch {
      // Ignore storage cleanup failures.
    }

    router.replace('/login');
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.dashboardCard}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <img src="/relay.svg" alt="Relay logo" className={styles.logoMark} />
          </div>

          <div className={styles.userMenuWrapper} ref={menuRef}>
            <button
              type="button"
              className={`${styles.userMenuButton} ${menuOpen ? styles.userMenuButtonOpen : ''}`}
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Open profile menu"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt="Profile"
                  className={styles.userAvatarImage}
                />
              ) : (
                <div className={styles.userAvatar}>{avatarLetter}</div>
              )}
            </button>

            {menuOpen && (
              <div className={styles.userMenu} role="menu" aria-label="Account actions">
                <div className={styles.userMenuHeader}>
                  <div className={styles.userMenuHeaderTitle}>{displayName}</div>
                  <div className={styles.userMenuHeaderSub}>Manage your account</div>
                </div>

                <button
                  type="button"
                  className={styles.userMenuItem}
                  onClick={handleSettingsClick}
                  role="menuitem"
                >
                  <span className={styles.userMenuItemIcon} aria-hidden="true">
                    <Settings01Icon size={18} />
                  </span>
                  <span>Settings</span>
                </button>
                <div className={styles.userMenuDivider} aria-hidden="true" />
                <button
                  type="button"
                  className={`${styles.userMenuItem} ${styles.userMenuDanger}`}
                  onClick={handleLogoutClick}
                  role="menuitem"
                  disabled={logoutPending}
                >
                  <span className={styles.userMenuItemIcon} aria-hidden="true">
                    <Logout02Icon size={18} />
                  </span>
                  <span>{logoutPending ? 'Logging out…' : 'Log out'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <section className={styles.hero}>
          <h1 className={styles.title}>Welcome back, {displayName}</h1>
          <p className={styles.subtitle}>
            Manage your identity and continue securely across Relay products.
          </p>
        </section>

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Available services</h2>
          <div className={styles.sectionHint}>Choose where to continue</div>
        </div>

        <div className={styles.servicesGrid}>
          <button
            className={`${styles.serviceCard} ${styles.serviceEnabled}`}
            onClick={handleRelayAuthClick}
          >
            <div className={styles.serviceIcon}>
              <Key01Icon size={22} />
            </div>
            <div className={styles.serviceContent}>
              <div className={styles.serviceName}>Relay Auth</div>
              <div className={styles.serviceDescription}>
                A safe house for your 2FA keys
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
