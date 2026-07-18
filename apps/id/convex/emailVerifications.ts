import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ─── createVerification ───────────────────────────────────────────────────────
// Stores SHA-256 hash of the verification code. TTL: 24 hours.
// Any previous pending verification for the user is replaced.

export const createVerification = mutation({
  args: {
    user_id: v.id('users'),
    code_hash: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Remove any existing verification for this user
    const existing = await ctx.db
      .query('email_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert('email_verifications', {
      user_id: args.user_id,
      code_hash: args.code_hash,
      expires_at: now + 24 * 60 * 60 * 1000, // 24 hours
      created_at: now
    });
  }
});

// ─── getVerification ─────────────────────────────────────────────────────────
// Fetches the pending verification for a user. Returns null if expired.

export const getVerification = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('email_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (record === null) return null;
    if (record.expires_at < Date.now()) return null;

    return record;
  }
});

// ─── deleteVerification ───────────────────────────────────────────────────────
// Consumes the verification record after successful verification.

export const deleteVerification = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('email_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (record !== null) {
      await ctx.db.delete(record._id);
    }
  }
});
