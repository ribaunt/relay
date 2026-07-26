import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    // identity
    email: v.optional(v.string()),
    email_hash: v.string(), // SHA-256 of lowercased email, for lookup
    email_verified: v.boolean(),

    // profile
    display_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    avatar_storage_id: v.optional(v.id('_storage')),

    // pending email change (staged until verification)
    pending_email: v.optional(v.string()),
    pending_email_hash: v.optional(v.string()),
    pending_srp_salt: v.optional(v.string()),
    pending_srp_verifier: v.optional(v.string()),

    // SRP credentials
    srp_salt: v.string(), // base64
    srp_verifier: v.string(), // base64, never log this
    recovery_srp_salt: v.optional(v.string()), // base64
    recovery_srp_verifier: v.optional(v.string()), // base64, never log this

    // metadata
    created_at: v.number(),
    updated_at: v.number()
  }).index('by_email_hash', ['email_hash']),

  encrypted_keys: defineTable({
    user_id: v.id('users'),

    // password-based encryption of master key
    encrypted_master_key: v.string(), // base64
    iv: v.string(), // base64
    kek_salt: v.string(), // base64, Argon2id salt
    kdf_mem_limit: v.number(), // Argon2id memLimit
    kdf_ops_limit: v.number(), // Argon2id opsLimit

    // recovery key encryption of master key
    recovery_encrypted_master_key: v.string(), // base64
    recovery_iv: v.string(), // base64
    recovery_kek_salt: v.string(), // base64, different salt from kek_salt

    updated_at: v.number()
  }).index('by_user', ['user_id']),

  sessions: defineTable({
    user_id: v.id('users'),
    token_hash: v.string(), // SHA-256 of raw session token
    device_name: v.optional(v.string()),
    device_fingerprint: v.optional(v.string()),
    expires_at: v.number(),
    created_at: v.number()
  })
    .index('by_token_hash', ['token_hash'])
    .index('by_user', ['user_id']),

  email_verifications: defineTable({
    user_id: v.id('users'),
    code_hash: v.string(), // SHA-256 of verification code
    expires_at: v.number(),
    created_at: v.number()
  }).index('by_user', ['user_id']),

  recovery_verifications: defineTable({
    user_id: v.id('users'),
    code_hash: v.string(), // SHA-256 of verification code
    attempts: v.number(),
    expires_at: v.number(),
    created_at: v.number()
  }).index('by_user', ['user_id']),

  recovery_sessions: defineTable({
    user_id: v.id('users'),
    token_hash: v.string(), // SHA-256 of raw recovery token
    email_verified: v.boolean(),
    phrase_verified: v.boolean(),
    server_ephemeral_secret: v.optional(v.string()),
    handshake_expires_at: v.optional(v.number()),
    expires_at: v.number(),
    created_at: v.number()
  })
    .index('by_user', ['user_id'])
    .index('by_token_hash', ['token_hash']),

  srp_handshakes: defineTable({
    user_id: v.id('users'),
    server_ephemeral_secret: v.string(), // base64, short-lived
    client_public_ephemeral: v.string(), // base64
    expires_at: v.number(), // 60 second TTL
    created_at: v.number()
  }).index('by_user', ['user_id']),

  devices: defineTable({
    user_id: v.id('users'),
    device_id: v.string(),
    name: v.string(),
    platform: v.optional(v.string()),
    os: v.optional(v.string()),
    app_version: v.optional(v.string()),
    device_public_key: v.optional(v.string()),
    signing_public_key: v.optional(v.string()),
    push_token: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('revoked')),
    last_seen: v.number(),
    created_at: v.number()
  })
    .index('by_user', ['user_id'])
    .index('by_device_id', ['device_id']),

  audit_log: defineTable({
    user_id: v.id('users'),
    event_type: v.union(
      v.literal('register'),
      v.literal('login'),
      v.literal('logout'),
      v.literal('login_failed'),
      v.literal('password_changed'),
      v.literal('key_rotated'),
      v.literal('recovery_key_regenerated'),
      v.literal('email_verified'),
      v.literal('profile_updated'),
      v.literal('session_revoked'),
      v.literal('recovery_requested'),
      v.literal('recovery_email_verified'),
      v.literal('recovery_phrase_verified'),
      v.literal('recovery_completed')
    ),
    ip_hash: v.optional(v.string()), // SHA-256 of IP, never raw
    user_agent_hash: v.optional(v.string()),
    metadata: v.optional(v.string()), // JSON-stringified metadata
    created_at: v.number()
  }).index('by_user', ['user_id']),

  oauth_clients: defineTable({
    client_id: v.string(),
    client_name: v.string(),
    client_type: v.union(v.literal('confidential'), v.literal('public')),
    client_secret_hash: v.optional(v.string()),
    is_first_party: v.optional(v.boolean()),
    redirect_uris: v.array(v.string()),
    post_logout_redirect_uris: v.array(v.string()),
    allowed_origins: v.array(v.string()),
    allowed_scopes: v.array(v.string()),
    enforce_pkce: v.boolean(),
    status: v.union(v.literal('active'), v.literal('disabled')),
    created_at: v.number(),
    updated_at: v.number()
  }).index('by_client_id', ['client_id']),

  oauth_authorization_codes: defineTable({
    code_hash: v.string(),
    client_id: v.string(),
    user_id: v.id('users'),
    redirect_uri: v.string(),
    scope: v.string(),
    code_challenge: v.string(),
    code_challenge_method: v.literal('S256'),
    nonce: v.optional(v.string()),
    expires_at: v.number(),
    consumed_at: v.optional(v.number()),
    created_at: v.number(),
    // Master key handoff fields (optional, only present if relay_handoff_* params were in authorize request)
    handoff_mode: v.optional(v.union(v.literal('popup'), v.literal('redirect'))),
    handoff_nonce: v.optional(v.string()),
    handoff_public_key: v.optional(v.string()),
    handoff_origin: v.optional(v.string()),
    handoff_client_id: v.optional(v.string())
  })
    .index('by_code_hash', ['code_hash'])
    .index('by_user', ['user_id']),

  oauth_refresh_tokens: defineTable({
    token_hash: v.string(),
    token_family_id: v.string(),
    parent_token_hash: v.optional(v.string()),
    client_id: v.string(),
    user_id: v.id('users'),
    scope: v.string(),
    issued_at: v.number(),
    last_used_at: v.number(),
    expires_at: v.number(),
    inactive_expires_at: v.number(),
    rotated_to_hash: v.optional(v.string()),
    revoked_at: v.optional(v.number()),
    revoke_reason: v.optional(
      v.union(
        v.literal('logout'),
        v.literal('global_logout'),
        v.literal('replay'),
        v.literal('admin')
      )
    )
  })
    .index('by_token_hash', ['token_hash'])
    .index('by_family', ['token_family_id'])
    .index('by_user', ['user_id']),

  oauth_signing_keys: defineTable({
    kid: v.string(),
    use: v.literal('sig'),
    alg: v.literal('RS256'),
    public_jwk_json: v.string(),
    status: v.union(v.literal('active'), v.literal('previous'), v.literal('retired')),
    activated_at: v.number(),
    retire_at: v.optional(v.number()),
    created_at: v.number()
  })
    .index('by_kid', ['kid'])
    .index('by_status', ['status']),

  oauth_revocations: defineTable({
    user_id: v.id('users'),
    global_revoked_after: v.number(),
    updated_at: v.number()
  }).index('by_user', ['user_id']),

  handoff_tickets: defineTable({
    ticket_hash: v.string(),
    user_id: v.id('users'),
    mode: v.union(v.literal('popup'), v.literal('redirect')),
    nonce: v.string(),
    public_key: v.string(),
    origin: v.string(),
    client_id: v.string(),
    redeemed_at: v.optional(v.number()),
    expires_at: v.number(),
    created_at: v.number()
  })
    .index('by_ticket_hash', ['ticket_hash'])
    .index('by_user', ['user_id'])
});
