"use client"

import { useEffect, useMemo, useState } from "react"

import { useMasterKey } from "@/components/master-key-provider"
import { decryptMasterKeyWithPassword } from "@/lib/auth/browser-crypto"
import { persistDecryptedMasterKeyForSubject } from "@/lib/auth/master-key-vault"
import { sealMasterKeyForSubject } from "@/lib/auth/master-key-vault"
import type { PublicSession } from "@/lib/auth/types"

type AuthSessionPanelProps = {
  session?: PublicSession
  authError?: string
  loggedOut?: string
}

export default function AuthSessionPanel({ session, authError, loggedOut }: AuthSessionPanelProps) {
  const {
    masterKeyHex,
    handoffError,
    handoffStatus,
    clientSession,
    setClientSession,
    setMasterKeyHex,
    lockMasterKey,
    clearDeviceVault,
  } = useMasterKey()
  const [password, setPassword] = useState("")
  const [decryptResult, setDecryptResult] = useState<string | null>(null)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decrypting, setDecrypting] = useState(false)
  const [vaultMessage, setVaultMessage] = useState<string | null>(null)
  const [vaultBusy, setVaultBusy] = useState(false)
  const resolvedSession = session ?? clientSession

  useEffect(() => {
    if (session) {
      setClientSession(session)
    }
  }, [session, setClientSession])

  const bootstrapSummary = useMemo(() => {
    if (!resolvedSession) {
      return null
    }

    return {
      sub: resolvedSession.bootstrap.sub,
      hasPendingEmailChange: resolvedSession.bootstrap.hasPendingEmailChange,
      encryptedMasterKey: resolvedSession.bootstrap.encryptedMasterKey,
      iv: resolvedSession.bootstrap.iv,
      kekSalt: resolvedSession.bootstrap.kekSalt,
      kdfMemLimit: resolvedSession.bootstrap.kdfMemLimit,
      kdfOpsLimit: resolvedSession.bootstrap.kdfOpsLimit,
      emailEncrypted: resolvedSession.bootstrap.emailEncrypted,
      emailIv: resolvedSession.bootstrap.emailIv,
    }
  }, [resolvedSession])

  async function handleDecryptClick() {
    if (!resolvedSession) {
      return
    }

    setDecrypting(true)
    setDecryptError(null)
    setDecryptResult(null)

    try {
      const result = await decryptMasterKeyWithPassword(resolvedSession.bootstrap, password)
      setDecryptResult(result)
      setMasterKeyHex(result)
      persistDecryptedMasterKeyForSubject(resolvedSession.sub, result)
      try {
        await sealMasterKeyForSubject(resolvedSession.sub, result)
        setVaultMessage("Master key decrypted and stored in secure device vault.")
      } catch {
        setVaultMessage("Master key decrypted in memory, but secure vault storage failed.")
      }
    } catch {
      setDecryptError(
        "Could not decrypt with the provided password and ciphertext format. The encrypted payload is still available for your app-specific decryption pipeline.",
      )
    } finally {
      setDecrypting(false)
    }
  }

  async function handleClearVaultClick() {
    setVaultBusy(true)
    const cleared = await clearDeviceVault()
    setVaultBusy(false)
    setVaultMessage(cleared ? "Device key vault cleared." : "Could not clear device key vault.")
  }

  function handleLockClick() {
    lockMasterKey()
    setVaultMessage("Master key locked in memory.")
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Relay Auth Session</h1>
      {authError ? <p className="rounded border border-destructive p-3 text-sm">authError: {authError}</p> : null}
      {loggedOut ? <p className="rounded border p-3 text-sm">Logout mode: {loggedOut}</p> : null}

      {!resolvedSession ? (
        <section className="rounded border p-4">
          <h2 className="text-lg font-medium">No local app session</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This relying party does not trust the shared `.relay.re` cookie directly. Start an
            OIDC round-trip to create a local `auth.relay.re` session.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/oauth/start?mode=silent&returnTo=/" className="rounded border px-3 py-2 text-sm">
              Try silent restore
            </a>
            <a href="/oauth/launch?returnTo=/" className="rounded border px-3 py-2 text-sm">
              Start interactive login
            </a>
          </div>
        </section>
      ) : null}

      {resolvedSession ? (
        <>
          <section className="rounded border p-4">
            <h2 className="text-lg font-medium">Current user</h2>
            <p className="text-sm">sub: {resolvedSession.sub}</p>
            {resolvedSession.name ? <p className="text-sm">name: {resolvedSession.name}</p> : null}
            {resolvedSession.picture ? <p className="text-sm">picture: {resolvedSession.picture}</p> : null}
            <p className="text-sm">emailVerified: {String(resolvedSession.emailVerified)}</p>
            <p className="text-sm">handoffStatus: {handoffStatus}</p>
            {handoffError ? <p className="text-sm text-destructive">handoffError: {handoffError}</p> : null}
            <p className="mt-2 text-sm font-medium">decryptedMasterKey:</p>
            {masterKeyHex ? (
              <p className="mt-1 break-all rounded bg-muted p-2 text-xs">{masterKeyHex}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Not available in memory yet. It will appear automatically after handoff or vault restore.
              </p>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="text-lg font-medium">Encrypted bootstrap handoff</h2>
            <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(bootstrapSummary, null, 2)}
            </pre>
          </section>

          <section className="rounded border p-4">
            <h2 className="text-lg font-medium">Client-side key workflow</h2>
            <p className="text-sm text-muted-foreground">
              Decryption runs in the browser only with libsodium Argon2id and
              `crypto_secretbox`, using the bootstrap KDF and nonce values. No server-side key
              decryption is performed.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <input
                className="rounded border bg-background px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password to derive KEK"
              />
              <button
                type="button"
                className="w-fit rounded border px-3 py-2 text-sm"
                onClick={handleDecryptClick}
                disabled={decrypting || password.length === 0}
              >
                {decrypting ? "Decrypting..." : "Attempt local master-key decrypt"}
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  onClick={handleLockClick}
                  disabled={!masterKeyHex || vaultBusy}
                >
                  Lock key
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm"
                  onClick={handleClearVaultClick}
                  disabled={vaultBusy}
                >
                  {vaultBusy ? "Clearing vault..." : "Clear device key vault"}
                </button>
              </div>
            </div>
            {decryptError ? <p className="mt-2 text-sm text-destructive">{decryptError}</p> : null}
            {vaultMessage ? <p className="mt-2 text-sm text-muted-foreground">{vaultMessage}</p> : null}
            {decryptResult ? (
              <p className="mt-2 break-all rounded bg-muted p-2 text-xs">
                masterKeyHex: {decryptResult}
              </p>
            ) : null}
          </section>

          <section className="flex flex-wrap gap-3">
            <a
              href="/oauth/launch?returnTo=/"
              className="rounded border px-3 py-2 text-sm"
            >
              Re-authenticate
            </a>
            <a href="/oauth/logout?returnTo=/" className="rounded border px-3 py-2 text-sm">
              Local logout
            </a>
            <a href="/oauth/logout?global=1&returnTo=/" className="rounded border px-3 py-2 text-sm">
              Global Relay logout
            </a>
          </section>
        </>
      ) : null}
    </main>
  )
}
