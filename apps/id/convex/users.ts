import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ─── createUser ───────────────────────────────────────────────────────────────
// Inserts user + encrypted_keys in a single logical operation.
// All encryption is performed client-side before calling this mutation.

export const createUser = mutation({
  args: {
    email_hash: v.string(),
    email_encrypted: v.string(),
    email_iv: v.string(),
    display_name: v.optional(v.string()),
    srp_salt: v.string(),
    srp_verifier: v.string(),
    recovery_srp_salt: v.string(),
    recovery_srp_verifier: v.string(),
    encrypted_master_key: v.string(),
    iv: v.string(),
    kek_salt: v.string(),
    kdf_mem_limit: v.number(),
    kdf_ops_limit: v.number(),
    recovery_encrypted_master_key: v.string(),
    recovery_iv: v.string(),
    recovery_kek_salt: v.string()
  },
  handler: async (ctx, args) => {
    // Guard against duplicate registrations
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email_hash', (q) => q.eq('email_hash', args.email_hash))
      .unique();

    if (existing !== null) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }

    const now = Date.now();

    const userId = await ctx.db.insert('users', {
      email_hash: args.email_hash,
      email_encrypted: args.email_encrypted,
      email_iv: args.email_iv,
      email_verified: false,
      display_name: args.display_name,
      srp_salt: args.srp_salt,
      srp_verifier: args.srp_verifier,
      recovery_srp_salt: args.recovery_srp_salt,
      recovery_srp_verifier: args.recovery_srp_verifier,
      created_at: now,
      updated_at: now
    });

    await ctx.db.insert('encrypted_keys', {
      user_id: userId,
      encrypted_master_key: args.encrypted_master_key,
      iv: args.iv,
      kek_salt: args.kek_salt,
      kdf_mem_limit: args.kdf_mem_limit,
      kdf_ops_limit: args.kdf_ops_limit,
      recovery_encrypted_master_key: args.recovery_encrypted_master_key,
      recovery_iv: args.recovery_iv,
      recovery_kek_salt: args.recovery_kek_salt,
      updated_at: now
    });

    await ctx.db.insert('audit_log', {
      user_id: userId,
      event_type: 'register' as const,
      created_at: now
    });

    return userId;
  }
});

// ─── getUserByEmailHash ───────────────────────────────────────────────────────
// Never returns srp_verifier to the client.

export const getUserByEmailHash = query({
  args: {
    email_hash: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email_hash', (q) => q.eq('email_hash', args.email_hash))
      .unique();

    if (user === null) return null;

    // Strip the verifier — it must never be returned to clients
    const { srp_verifier: _stripped, ...safeUser } = user;
    return safeUser;
  }
});

// ─── getUserByEmailHashInternal ───────────────────────────────────────────────
// Used internally by SRP server routes only — includes verifier.

export const getUserByEmailHashInternal = query({
  args: {
    email_hash: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_email_hash', (q) => q.eq('email_hash', args.email_hash))
      .unique();
  }
});

// ─── getUserProfileById ───────────────────────────────────────────────────────
// Returns only safe profile fields for authenticated UI rendering.

export const getUserProfileById = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) return null;

    let avatarUrl: string | undefined = user.avatar_url;
    if (user.avatar_storage_id !== undefined) {
      const storageUrl = await ctx.storage.getUrl(user.avatar_storage_id);
      if (storageUrl !== null) {
        avatarUrl = storageUrl;
      }
    }

    return {
      _id: user._id,
      display_name: user.display_name,
      avatar_url: avatarUrl,
      email_verified: user.email_verified
    };
  }
});

// ─── getUserSecurityContextById ──────────────────────────────────────────────
// Returns encrypted-at-rest material needed for authenticated client-side
// password and email updates.

export const getUserSecurityContextById = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) return null;

    const keyRecord = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (keyRecord === null) return null;

    return {
      email_encrypted: user.email_encrypted,
      email_iv: user.email_iv,
      encrypted_master_key: keyRecord.encrypted_master_key,
      iv: keyRecord.iv,
      kek_salt: keyRecord.kek_salt,
      kdf_mem_limit: keyRecord.kdf_mem_limit,
      kdf_ops_limit: keyRecord.kdf_ops_limit
    };
  }
});

// ─── updateProfile ────────────────────────────────────────────────────────────

export const updateProfile = mutation({
  args: {
    user_id: v.id('users'),
    display_name: v.optional(v.string()),
    avatar_url: v.optional(v.string()),
    avatar_storage_id: v.optional(v.id('_storage'))
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const now = Date.now();
    const updates: {
      updated_at: number;
      display_name?: string;
      avatar_url?: string;
      avatar_storage_id?: typeof args.avatar_storage_id;
    } = { updated_at: now };

    if (args.display_name !== undefined)
      updates.display_name = args.display_name;
    if (args.avatar_url !== undefined) updates.avatar_url = args.avatar_url;
    if (args.avatar_storage_id !== undefined) {
      updates.avatar_storage_id = args.avatar_storage_id;
      updates.avatar_url = undefined;
    }

    await ctx.db.patch(args.user_id, updates);

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'profile_updated' as const,
      created_at: now
    });
  }
});

// ─── createAvatarUploadUrl ───────────────────────────────────────────────────

export const createAvatarUploadUrl = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    return await ctx.storage.generateUploadUrl();
  }
});

// ─── commitAvatarUpload ──────────────────────────────────────────────────────

export const commitAvatarUpload = mutation({
  args: {
    user_id: v.id('users'),
    avatar_storage_id: v.id('_storage')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const now = Date.now();
    const previousStorageId = user.avatar_storage_id;

    await ctx.db.patch(args.user_id, {
      avatar_storage_id: args.avatar_storage_id,
      avatar_url: undefined,
      updated_at: now
    });

    if (
      previousStorageId !== undefined &&
      previousStorageId !== args.avatar_storage_id
    ) {
      await ctx.storage.delete(previousStorageId);
    }

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'profile_updated' as const,
      created_at: now
    });
  }
});

// ─── stageEmailChange ────────────────────────────────────────────────────────

export const stageEmailChange = mutation({
  args: {
    user_id: v.id('users'),
    pending_email_hash: v.string(),
    pending_email_encrypted: v.string(),
    pending_email_iv: v.string(),
    pending_srp_salt: v.string(),
    pending_srp_verifier: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const existing = await ctx.db
      .query('users')
      .withIndex('by_email_hash', (q) =>
        q.eq('email_hash', args.pending_email_hash)
      )
      .unique();

    if (existing !== null && existing._id !== args.user_id) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }

    await ctx.db.patch(args.user_id, {
      pending_email_hash: args.pending_email_hash,
      pending_email_encrypted: args.pending_email_encrypted,
      pending_email_iv: args.pending_email_iv,
      pending_srp_salt: args.pending_srp_salt,
      pending_srp_verifier: args.pending_srp_verifier,
      updated_at: Date.now()
    });
  }
});

// ─── getPendingEmailChangeById ───────────────────────────────────────────────

export const getPendingEmailChangeById = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) return null;

    if (
      user.pending_email_hash === undefined ||
      user.pending_email_encrypted === undefined ||
      user.pending_email_iv === undefined ||
      user.pending_srp_salt === undefined ||
      user.pending_srp_verifier === undefined
    ) {
      return null;
    }

    return {
      pending_email_hash: user.pending_email_hash,
      pending_email_encrypted: user.pending_email_encrypted,
      pending_email_iv: user.pending_email_iv,
      pending_srp_salt: user.pending_srp_salt,
      pending_srp_verifier: user.pending_srp_verifier
    };
  }
});

// ─── commitStagedEmailChange ─────────────────────────────────────────────────

export const commitStagedEmailChange = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    if (
      user.pending_email_hash === undefined ||
      user.pending_email_encrypted === undefined ||
      user.pending_email_iv === undefined ||
      user.pending_srp_salt === undefined ||
      user.pending_srp_verifier === undefined
    ) {
      throw new Error('NO_PENDING_EMAIL_CHANGE');
    }

    const existing = await ctx.db
      .query('users')
      .withIndex('by_email_hash', (q) =>
        q.eq('email_hash', user.pending_email_hash as string)
      )
      .unique();

    if (existing !== null && existing._id !== args.user_id) {
      throw new Error('EMAIL_ALREADY_REGISTERED');
    }

    const now = Date.now();

    await ctx.db.patch(args.user_id, {
      email_hash: user.pending_email_hash,
      email_encrypted: user.pending_email_encrypted,
      email_iv: user.pending_email_iv,
      email_verified: true,
      srp_salt: user.pending_srp_salt,
      srp_verifier: user.pending_srp_verifier,
      pending_email_hash: undefined,
      pending_email_encrypted: undefined,
      pending_email_iv: undefined,
      pending_srp_salt: undefined,
      pending_srp_verifier: undefined,
      updated_at: now
    });

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'email_verified' as const,
      created_at: now
    });
  }
});

// ─── updateSRPCredentials ─────────────────────────────────────────────────────
// Called after password change — updates SRP verifier and re-encrypted master key.
// The recovery-encrypted master key is NOT changed here (recovery key stays valid).

export const updateSRPCredentials = mutation({
  args: {
    user_id: v.id('users'),
    srp_salt: v.string(),
    srp_verifier: v.string(),
    encrypted_master_key: v.string(),
    iv: v.string(),
    kek_salt: v.string(),
    kdf_mem_limit: v.number(),
    kdf_ops_limit: v.number()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const now = Date.now();

    await ctx.db.patch(args.user_id, {
      srp_salt: args.srp_salt,
      srp_verifier: args.srp_verifier,
      updated_at: now
    });

    const keyRecord = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (keyRecord === null) throw new Error('KEY_RECORD_NOT_FOUND');

    await ctx.db.patch(keyRecord._id, {
      encrypted_master_key: args.encrypted_master_key,
      iv: args.iv,
      kek_salt: args.kek_salt,
      kdf_mem_limit: args.kdf_mem_limit,
      kdf_ops_limit: args.kdf_ops_limit,
      updated_at: now
    });

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'password_changed' as const,
      created_at: now
    });
  }
});

// ─── updateRecoveryResetCredentials ───────────────────────────────────────────
// Called after successful email+recovery phrase verification.

export const updateRecoveryResetCredentials = mutation({
  args: {
    user_id: v.id('users'),
    srp_salt: v.string(),
    srp_verifier: v.string(),
    recovery_srp_salt: v.string(),
    recovery_srp_verifier: v.string(),
    encrypted_master_key: v.string(),
    iv: v.string(),
    kek_salt: v.string(),
    kdf_mem_limit: v.number(),
    kdf_ops_limit: v.number(),
    recovery_encrypted_master_key: v.string(),
    recovery_iv: v.string(),
    recovery_kek_salt: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const now = Date.now();

    await ctx.db.patch(args.user_id, {
      srp_salt: args.srp_salt,
      srp_verifier: args.srp_verifier,
      recovery_srp_salt: args.recovery_srp_salt,
      recovery_srp_verifier: args.recovery_srp_verifier,
      updated_at: now
    });

    const keyRecord = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (keyRecord === null) throw new Error('KEY_RECORD_NOT_FOUND');

    await ctx.db.patch(keyRecord._id, {
      encrypted_master_key: args.encrypted_master_key,
      iv: args.iv,
      kek_salt: args.kek_salt,
      kdf_mem_limit: args.kdf_mem_limit,
      kdf_ops_limit: args.kdf_ops_limit,
      recovery_encrypted_master_key: args.recovery_encrypted_master_key,
      recovery_iv: args.recovery_iv,
      recovery_kek_salt: args.recovery_kek_salt,
      updated_at: now
    });

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'recovery_completed' as const,
      created_at: now
    });
  }
});

// ─── markEmailVerified ────────────────────────────────────────────────────────

export const markEmailVerified = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const now = Date.now();

    await ctx.db.patch(args.user_id, {
      email_verified: true,
      updated_at: now
    });

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'email_verified' as const,
      created_at: now
    });
  }
});

// ─── getEncryptedMasterKeyById ────────────────────────────────────────────────
// Fetch encrypted master key for master key handoff protocol.
// Called server-side during OAuth token exchange.

export const getEncryptedMasterKeyById = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const encryptedKey = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (encryptedKey === null) {
      return null;
    }

    return {
      encrypted_master_key: encryptedKey.encrypted_master_key,
      iv: encryptedKey.iv,
      kek_salt: encryptedKey.kek_salt
    };
  }
});

// ─── rotateMasterKey ──────────────────────────────────────────────────────────
// Called during explicit security reset. Replaces the user's encrypted master key
// bundles. The client generates a new master key, re-encrypts all vault data
// client-side, then sends the new encrypted bundles here.
// Requires that the user authenticates and provides both password and recovery
// encrypted bundles to ensure they don't get locked out.

export const rotateMasterKey = mutation({
  args: {
    user_id: v.id('users'),
    encrypted_master_key: v.string(),
    iv: v.string(),
    kek_salt: v.string(),
    kdf_mem_limit: v.number(),
    kdf_ops_limit: v.number(),
    recovery_encrypted_master_key: v.string(),
    recovery_iv: v.string(),
    recovery_kek_salt: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.user_id);
    if (user === null) throw new Error('USER_NOT_FOUND');

    const keyRecord = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (keyRecord === null) throw new Error('KEY_RECORD_NOT_FOUND');

    const now = Date.now();

    await ctx.db.patch(keyRecord._id, {
      encrypted_master_key: args.encrypted_master_key,
      iv: args.iv,
      kek_salt: args.kek_salt,
      kdf_mem_limit: args.kdf_mem_limit,
      kdf_ops_limit: args.kdf_ops_limit,
      recovery_encrypted_master_key: args.recovery_encrypted_master_key,
      recovery_iv: args.recovery_iv,
      recovery_kek_salt: args.recovery_kek_salt,
      updated_at: now
    });

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'key_rotated' as const,
      created_at: now
    });
  }
});
