import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ─── getEncryptedKeys ─────────────────────────────────────────────────────────
// Returns the encrypted key bundle for a user.
// Called during login (to return key data after SRP) and during recovery.
// Safe to expose — all values are ciphertext; the master key cannot be derived
// without the password or the recovery key.

export const getEncryptedKeys = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();
  }
});

// ─── getEncryptedKeysByEmailHash ──────────────────────────────────────────────
// Used during the recovery flow — client provides email hash, gets back the
// recovery-encrypted key bundle so they can decrypt with the recovery key.

export const getEncryptedKeysByEmailHash = query({
  args: {
    email_hash: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email_hash', (q) => q.eq('email_hash', args.email_hash))
      .unique();

    if (user === null) return null;

    const keys = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', user._id))
      .unique();

    if (keys === null) return null;

    // Return only recovery-related fields + user_id
    // Do NOT return the password-encrypted key data here
    return {
      user_id: user._id,
      recovery_encrypted_master_key: keys.recovery_encrypted_master_key,
      recovery_iv: keys.recovery_iv,
      recovery_kek_salt: keys.recovery_kek_salt
    };
  }
});

// ─── updateRecoveryKey ────────────────────────────────────────────────────────
// Regenerates the recovery-encrypted master key.
// Called when user requests a new recovery key.
// The password-encrypted key data is NOT changed here.

export const updateRecoveryKey = mutation({
  args: {
    user_id: v.id('users'),
    recovery_encrypted_master_key: v.string(),
    recovery_iv: v.string(),
    recovery_kek_salt: v.string()
  },
  handler: async (ctx, args) => {
    const keyRecord = await ctx.db
      .query('encrypted_keys')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (keyRecord === null) throw new Error('KEY_RECORD_NOT_FOUND');

    await ctx.db.patch(keyRecord._id, {
      recovery_encrypted_master_key: args.recovery_encrypted_master_key,
      recovery_iv: args.recovery_iv,
      recovery_kek_salt: args.recovery_kek_salt,
      updated_at: Date.now()
    });

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'recovery_key_regenerated' as const,
      created_at: Date.now()
    });
  }
});
