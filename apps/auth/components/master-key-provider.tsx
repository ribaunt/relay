"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  useCallback,
  type ReactNode,
} from "react";
import { Relay } from "@relay/core";
import type { RelaySession, KeyMaterial } from "@relay/core";
import type { BootstrapPayload } from "@relay/types";
import { AuthIdentityProvider } from "@/lib/auth/relay-identity-provider";
import {
  HANDOFF_MESSAGE_TYPE,
  clearBridgeCookie,
  clearPendingMasterKeyHandoff,
  decodePayloadFromCookie,
  loadPendingMasterKeyHandoff,
  readBridgeCookie,
  unwrapMasterKeyFromPayload,
  waitForAuthenticatedSession,
  type MasterKeyHandoffPayload,
  type PendingMasterKeyHandoff,
} from "@/lib/auth/master-key-handoff";
import {
  clearMasterKeyVault,
  loadSealedMasterKeyForSubject,
  sealMasterKeyForSubject,
} from "@relay/core";

const HANDOFF_COMPLETE_MESSAGE_TYPE = "relay.masterkey_handoff_complete";
const IDLE_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

type MasterKeyContextValue = {
  relay: Relay | null;
  handoffStatus: "idle" | "pending" | "ready" | "error";
  handoffError: string | null;
  markPending: () => void;
  consumeRedirectHandoff: () => Promise<boolean>;
  clearDeviceVault: () => Promise<boolean>;
  clientSession: RelaySession | null;
  setClientSession: (session: RelaySession | null) => void;
  isUnlocked: boolean;
};

const MasterKeyContext = createContext<MasterKeyContextValue | null>(null);

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid master key hex");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function consumePayload(
  state: PendingMasterKeyHandoff,
  payload: MasterKeyHandoffPayload,
): Promise<{ masterKeyHex: string; session: RelaySession; kekSalt: string; bootstrap: BootstrapPayload }> {
  if (payload.version !== 1) {
    throw new Error("Unsupported handoff payload version");
  }
  if (payload.audience !== state.clientId) {
    throw new Error("Handoff audience mismatch");
  }
  if (!payload.issuer.startsWith("https://") && !payload.issuer.startsWith("http://localhost")) {
    throw new Error("Invalid handoff issuer");
  }
  if (payload.nonce !== state.nonce) {
    throw new Error("Handoff nonce mismatch");
  }
  if (payload.expiresAt <= payload.createdAt) {
    throw new Error("Invalid handoff payload timing");
  }
  if (payload.createdAt > Date.now() + 30_000) {
    throw new Error("Handoff payload creation time is in the future");
  }
  if (Date.now() > payload.expiresAt) {
    throw new Error("Handoff payload expired");
  }

  const appSession = await waitForAuthenticatedSession(payload.sub);
  if (!appSession) {
    throw new Error(
      "Authenticated session not established before handoff timeout",
    );
  }

  const masterKeyHex = await unwrapMasterKeyFromPayload(payload, state);

  const bootstrap = appSession.bootstrap;

  const session: RelaySession = {
    sub: appSession.sub,
    name: appSession.name,
    picture: appSession.picture,
    email: bootstrap.email,
    emailVerified: appSession.emailVerified,
    expiresAt: 0,
  };

  return { masterKeyHex, session, kekSalt: bootstrap.kekSalt, bootstrap };
}

export function MasterKeyProvider({ children }: { children: ReactNode }) {
  const [relay, setRelay] = useState<Relay | null>(null);
  const [handoffStatus, setHandoffStatus] = useState<
    "idle" | "pending" | "ready" | "error"
  >("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [vaultRestoreLocked, setVaultRestoreLocked] = useState(false);
  const [clientSession, setClientSessionState] = useState<RelaySession | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const identityProviderRef = useRef<AuthIdentityProvider | null>(null);
  const pendingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const provider = new AuthIdentityProvider();
    identityProviderRef.current = provider;

    const init = async () => {
      const instance = await Relay.initialize({
        identityProvider: provider,
        maxRetries: 3,
        retryBaseDelayMs: 1000,
      });
      setRelay(instance);
    };

    void init();
  }, []);

  useEffect(() => {
    if (!relay) return;

    setClientSessionState(relay.session);
    setIsUnlocked(relay.isUnlocked);

    const unsubSession = relay.on<RelaySession | null>("session:changed", (session) => {
      setClientSessionState(session ?? null);
    });
    const unsubLock = relay.on("lock", () => setIsUnlocked(false));
    const unsubUnlock = relay.on("unlock", () => setIsUnlocked(true));

    return () => {
      unsubSession();
      unsubLock();
      unsubUnlock();
    };
  }, [relay]);

  const lockRelay = useCallback(() => {
    if (!relay) return;
    setVaultRestoreLocked(true);
    relay.lock();
  }, [relay]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (!isUnlocked) return;
    idleTimerRef.current = setTimeout(() => {
      lockRelay();
    }, IDLE_LOCK_TIMEOUT_MS);
  }, [isUnlocked, lockRelay]);

  useEffect(() => {
    const handler = () => resetIdleTimer();
    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ];
    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const event of events) {
        window.removeEventListener(event, handler);
      }
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    setVaultRestoreLocked(false);
  }, [clientSession]);

  useEffect(() => {
    function resetOnTimeout() {
      const state = loadPendingMasterKeyHandoff();
      if (!state) return;
      if (Date.now() - state.createdAt > 60_000) {
        clearPendingMasterKeyHandoff();
        setHandoffStatus("idle");
      }
    }
    resetOnTimeout();
  }, []);

  useEffect(() => {
    if (!clientSession || isUnlocked || vaultRestoreLocked) return;
    const sessionSub = clientSession.sub;
    let cancelled = false;

    async function restoreFromVault() {
      if (cancelled) return;

      try {
        const restored = await loadSealedMasterKeyForSubject(sessionSub);
        if (!cancelled && restored && relay) {
          await relay.unlock(hexToBytes(restored));
          return;
        }
      } catch (error) {
        console.warn("Vault: restoration failed.", error);
      }

      if (!cancelled) {
        console.info("Vault: no sealed master key found for subject", sessionSub);
      }
    }

    void restoreFromVault();
    return () => {
      cancelled = true;
    };
  }, [clientSession, relay, vaultRestoreLocked, isUnlocked]);

  useEffect(() => {
    if (isUnlocked && handoffStatus === "error") {
      setHandoffStatus("ready");
      setHandoffError(null);
    }
  }, [isUnlocked, handoffStatus]);

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      const state = loadPendingMasterKeyHandoff();
      if (!state || state.mode !== "popup" || pendingRef.current) return;

      const payload = event.data as {
        type?: string;
        payload?: MasterKeyHandoffPayload;
        hasPayload?: boolean;
      };

      if (
        payload?.type === HANDOFF_COMPLETE_MESSAGE_TYPE &&
        !payload.hasPayload
      ) {
        pendingRef.current = true;
        setHandoffStatus("pending");
        setHandoffError(null);

        try {
          const appSession = await waitForAuthenticatedSession();
          if (!appSession) {
            throw new Error(
              "Popup completed but authenticated session is not available",
            );
          }

          const session: RelaySession = {
            sub: appSession.sub,
            name: appSession.name,
            picture: appSession.picture,
            email: appSession.bootstrap?.email,
            emailVerified: appSession.emailVerified,
            expiresAt: 0,
          };

          identityProviderRef.current?.notifySessionChange(session);
          startTransition(() => {
            setHandoffStatus("ready");
          });
          clearPendingMasterKeyHandoff();
        } catch (error) {
          setHandoffStatus("error");
          setHandoffError(
            error instanceof Error
              ? error.message
              : "Failed to finalize popup completion",
          );
        } finally {
          pendingRef.current = false;
        }
        return;
      }

      if (payload?.type !== HANDOFF_MESSAGE_TYPE || !payload.payload) return;

      pendingRef.current = true;
      setHandoffStatus("pending");
      setHandoffError(null);

      try {
      const consumed = await consumePayload(state, payload.payload);
      try {
        await sealMasterKeyForSubject(
          consumed.session.sub,
          consumed.masterKeyHex,
        );
      } catch (vaultError) {
        console.error(
          "Failed to persist popup handoff key in secure vault:",
          vaultError,
        );
      }

      identityProviderRef.current?.notifySessionChange(consumed.session);

        if (consumed.bootstrap && identityProviderRef.current) {
          await identityProviderRef.current.saveKeyMaterial({
            encryptedMasterKey: consumed.bootstrap.encryptedMasterKey,
            iv: consumed.bootstrap.iv,
            kekSalt: consumed.bootstrap.kekSalt,
            kdfMemLimit: consumed.bootstrap.kdfMemLimit,
            kdfOpsLimit: consumed.bootstrap.kdfOpsLimit,
          });
        }

        if (relay) {
          await relay.unlock(hexToBytes(consumed.masterKeyHex));
        }

        startTransition(() => {
          setVaultRestoreLocked(false);
          setHandoffStatus("ready");
        });
        clearPendingMasterKeyHandoff();
      } catch (error) {
        setHandoffStatus("error");
        setHandoffError(
          error instanceof Error
            ? error.message
            : "Failed to process popup handoff",
        );
      } finally {
        pendingRef.current = false;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [relay]);

  const markPending = useCallback(() => {
    setHandoffStatus("pending");
    setHandoffError(null);
  }, []);

  const consumeRedirectHandoff = useCallback(async () => {
    const state = loadPendingMasterKeyHandoff();
    if (!state || state.mode !== "redirect") return false;

    const cookieValue = readBridgeCookie(state.cookieName);
    if (!cookieValue) {
      setHandoffStatus("error");
      setHandoffError("Encrypted bridge payload was not found");
      return false;
    }

    pendingRef.current = true;
    setHandoffStatus("pending");
    setHandoffError(null);

    try {
      const payload = decodePayloadFromCookie(cookieValue);
      const consumed = await consumePayload(state, payload);
      try {
        await sealMasterKeyForSubject(
          consumed.session.sub,
          consumed.masterKeyHex,
        );
      } catch (vaultError) {
        console.error(
          "Failed to persist redirect handoff key in secure vault:",
          vaultError,
        );
      }

      identityProviderRef.current?.notifySessionChange(consumed.session);

      if (consumed.bootstrap && identityProviderRef.current) {
        await identityProviderRef.current.saveKeyMaterial({
          encryptedMasterKey: consumed.bootstrap.encryptedMasterKey,
          iv: consumed.bootstrap.iv,
          kekSalt: consumed.bootstrap.kekSalt,
          kdfMemLimit: consumed.bootstrap.kdfMemLimit,
          kdfOpsLimit: consumed.bootstrap.kdfOpsLimit,
        });
      }

      if (relay) {
        await relay.unlock(hexToBytes(consumed.masterKeyHex));
      }

      startTransition(() => {
        setVaultRestoreLocked(false);
        setHandoffStatus("ready");
      });
      clearBridgeCookie(state.cookieName);
      clearPendingMasterKeyHandoff();
      return true;
    } catch (error) {
      setHandoffStatus("error");
      setHandoffError(
        error instanceof Error
          ? error.message
          : "Failed to process redirect handoff",
      );
      return false;
    } finally {
      pendingRef.current = false;
    }
  }, [relay]);

  const clearDeviceVault = useCallback(async () => {
    try {
      await clearMasterKeyVault();
      setVaultRestoreLocked(true);
      if (relay) {
        relay.lock();
      }
      return true;
    } catch {
      return false;
    }
  }, [relay]);

  const setClientSession = useCallback(
    (session: RelaySession | null) => {
      identityProviderRef.current?.notifySessionChange(session);
    },
    [],
  );

  const value = useMemo<MasterKeyContextValue>(
    () => ({
      relay,
      handoffStatus,
      handoffError,
      markPending,
      consumeRedirectHandoff,
      clearDeviceVault,
      clientSession,
      setClientSession,
      isUnlocked,
    }),
    [
      relay,
      handoffStatus,
      handoffError,
      markPending,
      consumeRedirectHandoff,
      clearDeviceVault,
      clientSession,
      setClientSession,
      isUnlocked,
    ],
  );

  return (
    <MasterKeyContext.Provider value={value}>
      {children}
    </MasterKeyContext.Provider>
  );
}

export function useMasterKey() {
  const context = useContext(MasterKeyContext);
  if (!context) {
    throw new Error("useMasterKey must be used within MasterKeyProvider");
  }
  return context;
}
