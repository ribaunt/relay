# AGENTS.md — Relay

Guidance for AI coding agents working in this repository.

## What this project is

Relay is a **zero-knowledge identity and crypto monorepo**. The server never sees plaintext passwords or master keys.

| Surface | Role | Local |
|---------|------|-------|
| `apps/id` (`@relay/id`) | OIDC identity provider (`id.relay.re`) | `:3001` |
| `apps/auth` (`@relay/auth`) | First-party OIDC relying party (`auth.relay.re`) | `:3000` |
| `packages/@relay/*` | Shared SDK, crypto, types, UI | workspace packages |

**Stack:** pnpm workspaces · Node ≥20 · TypeScript 5.9 · Next.js 16 · Convex · Better Auth · libsodium · SRP-6a · PostHog · Redis

## Monorepo map

```
apps/
  auth/          # OIDC RP — session cookies, PKCE, master-key handoff UI
  id/            # OIDC IdP — SRP auth, Convex schema, recovery, devices
packages/@relay/
  core/          # Relay SDK: lock/unlock, keys, storage/search/sync interfaces
  crypto/        # Argon2id, secretbox, recovery, handoff crypto
  types/         # Shared domain types (OIDC, bootstrap, SRP, devices)
  id-client/     # Portable client: SRP, OIDC tokens, bootstrap, devices
  services/      # Service origins + OAuth client IDs from env
  env/           # Env helpers (getRequired, parsers)
  ui/            # Shared React primitives
scripts/
  generate-keys.mjs   # Local .env + RSA JWKS bootstrap (runs on `pnpm dev`)
```

## Non-negotiable security rules

These are product requirements, not style preferences.

1. **Never send plaintext passwords or master keys to the server.** Auth uses SRP-6a; master keys are client-generated and only stored as Argon2id-wrapped blobs.
2. **Decrypt master keys only in the browser** (or native client). Server paths may store/return `encryptedMasterKey`, `iv`, `kekSalt`, KDF limits — never the raw key.
3. **Emails at rest:** store hash for lookup + encrypted form for display. Do not persist plaintext email.
4. **Audit / logs:** hash IPs and user agents; never log SRP verifiers, session tokens, refresh tokens, or key material.
5. **OIDC:** PKCE S256 required; validate `state`/`nonce`; use refresh-token families with replay revocation; prefer existing helpers in `apps/id` and `@relay/crypto` handoff utilities.
6. **Handoff:** master-key transfer between IdP and RP uses encrypted handoff payloads (popup/redirect). Do not put plaintext keys in URLs, logs, or server session cookies.

Threat-model notes live in `packages/@relay/crypto/src/master-key.ts` (RLY-010 / RLY-011).

## Crypto model (quick)

```
Password → Argon2id → KEK → decrypt(encryptedMasterKey) → Master Key (memory only)
                                                              ↓
                                              deriveSubkey(context) → feature keys
```

- Encryption: XSalsa20-Poly1305 (`crypto_secretbox` via libsodium)
- Recovery: separate recovery SRP + recovery-encrypted master key
- Shared crypto API: `@relay/crypto` — prefer it over reimplementing KDF/encrypt/handoff

## Auth architecture

Two session layers:

1. **IdP / SSO session** — owned by `id.relay.re` (shared identity)
2. **App session** — signed cookie on `auth.relay.re` with profile + **encrypted** bootstrap only

Typical OIDC path (auth app):

- `/oauth/start` → PKCE + transaction cookie → IdP authorize
- `/oauth/callback` → code exchange, ID token verify, bootstrap fetch, local session
- `/oauth/logout` → local clear; `?global=1` hits IdP logout-all
- Silent restore uses `prompt=none`; falls back to interactive on `login_required` etc.

Direct SRP path exists via `@relay/id-client` and `AuthIdentityProvider` for non-OIDC clients — do not conflate the two flows when changing either.

## Convex (IdP backend)

Schema: `apps/id/convex/schema.ts`

Important tables: `users`, `encrypted_keys`, `sessions`, `devices`, `srp_handshakes`, OIDC (`oauth_clients`, codes, refresh tokens, signing keys, revocations), audit log.

- Prefer Convex mutations/queries for persistence; keep route handlers thin.
- Generated code under `convex/_generated/` and `convex/betterAuth/_generated/` is gitignored — do not hand-edit.
- Auth is moving through `@convex-dev/better-auth`; `apps/id/lib/auth.ts` is a legacy re-export — prefer `auth-server` / `auth-client`.

## Working conventions

### Commands

```bash
pnpm dev              # generate keys + auth:3000 + id:3001
pnpm dev:auth         # auth only
pnpm dev:id           # id only
pnpm build            # recursive build
pnpm typecheck        # recursive tsc
pnpm lint
pnpm format
```

Filter packages: `pnpm --filter @relay/auth <script>`, etc.

### Dependencies

- Workspace packages: `"@relay/foo": "workspace:*"`
- Do not add OpenAI/Anthropic/etc. without an explicit product need; this repo is identity/crypto-first.
- Prefer existing packages (`jose`, `tssrp6a`, `libsodium-wrappers-sumo`, `zod`) over new crypto/auth libraries.

### Code style

- TypeScript strict; match surrounding file style (quotes, semicolons vary slightly by package — follow the file you edit).
- Apps use Next.js App Router (`app/`).
- Shared types go in `@relay/types`, not duplicated ad hoc.
- Service URLs/client IDs: use `@relay/services` (`getServices()`), not hard-coded production hosts in new code.
- Env access: prefer `@relay/env` helpers where applicable.

### What not to do

- Do not commit secrets, PEMs, or `.env*` (except `.env.example` if present).
- Do not weaken PKCE, skip nonce/state checks, or store raw tokens unhashed.
- Do not expand scope into full product features (storage backends, search indexes) unless asked — `@relay/core` storage/search/sync are pluggable interfaces; many are still framework-level.
- Do not rewrite the IdP as a greenfield better-auth app; extend the existing Convex + OIDC surface.

## Where to look first

| Task | Start here |
|------|------------|
| RP OIDC session / cookies | `apps/auth/lib/auth/` |
| RP routes | `apps/auth/app/oauth/`, `apps/auth/app/api/` |
| IdP OIDC endpoints | `apps/id/app/api/oidc/` |
| IdP SRP | `apps/id/app/api/srp/`, `apps/id/lib/crypto/srp.ts` |
| IdP data model | `apps/id/convex/schema.ts` + matching `convex/*.ts` |
| Master key / KDF / handoff | `packages/@relay/crypto/` |
| Client SDK surface | `packages/@relay/core/src/relay.ts` |
| Portable IdP client | `packages/@relay/id-client/` |
| Local env bootstrap | `scripts/generate-keys.mjs` |

## PR / change checklist

- [ ] No plaintext secrets or keys in code, logs, or cookies
- [ ] Crypto/auth changes go through `@relay/crypto` / existing SRP-OIDC paths
- [ ] Types updated in `@relay/types` when payloads change
- [ ] `pnpm typecheck` (and relevant package tests if you touch `core`/`crypto`)
- [ ] Env vars documented if newly required (and wired in `generate-keys.mjs` for local dev when needed)
