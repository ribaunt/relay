# Relay Auth RP (auth.relay.re)

This app is the relying party for first-party auth using `id.relay.re` as the only identity provider.

## Environment

Copy `.env.example` to `.env.local` for local development, then configure:

- `RELAY_AUTH_BASE_URL`: public URL of this app (`https://auth.relay.re`)
- `RELAY_OIDC_ISSUER`: IdP issuer (`https://id.relay.re`)
- `RELAY_OIDC_CLIENT_ID`: OIDC client id registered at the IdP (`auth.relay.re`)
- `RELAY_OIDC_CLIENT_SECRET`: optional secret if client is confidential
- `RELAY_OIDC_SCOPES`: must include `relay.bootstrap` and should only contain IdP-supported base scopes
- `RELAY_MASTERKEY_SCOPE`: optional handoff scope requested only during interactive key handoff (`relay.masterkey_handoff` by default)
- `RELAY_SESSION_SECRET`: high-entropy secret for signed cookies

## Auth routes

### `/oauth/start`

- Generates `state`, `nonce`, and PKCE `code_verifier`/`code_challenge` (`S256`)
- Persists transaction values in a short-lived, signed, httpOnly transaction cookie
- Redirects to IdP authorize endpoint
- Supports silent restore via `mode=silent`, which sets `prompt=none`

### `/oauth/callback`

- Validates transaction cookie and `state`
- Exchanges authorization code server-side at IdP token endpoint
- Verifies `id_token` against IdP JWKS/discovery and validates `nonce`
- Calls IdP `/api/oidc/userinfo` and `/api/relay/bootstrap` server-side with access token
- Creates signed local app session cookie for `auth.relay.re`
- Handles known failures:
	- missing/expired state
	- code exchange failures
	- silent `prompt=none` with `login_required`/`interaction_required`/`consent_required` (auto-falls back to interactive)
	- expired/revoked token during profile/bootstrap fetch
	- missing bootstrap scope (`insufficient_scope`)

### `/oauth/logout`

- Always clears local `auth.relay.re` app session
- Supports local logout (`/oauth/logout`) and global logout (`/oauth/logout?global=1`)
- Local logout redirects to an explicit signed-out state so the app does not instantly recreate the session via silent SSO
- Global mode redirects the browser through IdP `/api/oidc/logout-all` so the shared `.relay.re` SSO cookie is actually cleared by `id.relay.re`

## Local session contents

The signed local session cookie stores only what the app needs:

- `sub`, `name`, `picture`, `emailVerified`
- encrypted bootstrap payload (`encryptedMasterKey`, `iv`, `kekSalt`, KDF parameters, encrypted email fields)

The local app session is independent from the shared `.relay.re` SSO cookie and must exist for app auth.

## Bootstrap and key handling

- Encrypted bootstrap data is fetched server-side, then passed to browser through the local authenticated session response/render path
- No plaintext email is requested or persisted
- The app never asks the IdP for decrypted keys
- Client-side helper code derives a KEK with Argon2id using `kekSalt`, `kdfMemLimit`, and `kdfOpsLimit`, then decrypts `encryptedMasterKey` with libsodium `crypto_secretbox` in-browser only

## Session APIs and guard behavior

- Home route (`/`) is guarded: if local app session is missing, it starts silent auth first (`prompt=none`)
- If silent auth cannot restore (`login_required` etc), callback automatically retries interactive login
- `/api/session` returns authenticated user + encrypted bootstrap payload and rotates local session expiry
