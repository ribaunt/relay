import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

const RECOVERY_CODE_TTL_MS = 15 * 60 * 1000;
const RECOVERY_SESSION_TTL_MS = 15 * 60 * 1000;

export const createRecoveryVerification = mutation({
  args: {
    user_id: v.id('users'),
    code_hash: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('recovery_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert('recovery_verifications', {
      user_id: args.user_id,
      code_hash: args.code_hash,
      attempts: 0,
      expires_at: now + RECOVERY_CODE_TTL_MS,
      created_at: now
    });
  }
});

export const getRecoveryVerification = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('recovery_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (record === null) return null;
    if (record.expires_at < Date.now()) return null;
    return record;
  }
});

export const incrementRecoveryVerificationAttempts = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('recovery_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (record === null) return null;
    const attempts = record.attempts + 1;
    await ctx.db.patch(record._id, { attempts });
    return attempts;
  }
});

export const deleteRecoveryVerification = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query('recovery_verifications')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (record !== null) {
      await ctx.db.delete(record._id);
    }
  }
});

export const createRecoverySession = mutation({
  args: {
    user_id: v.id('users'),
    token_hash: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('recovery_sessions')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    await Promise.all(existing.map((session) => ctx.db.delete(session._id)));

    return await ctx.db.insert('recovery_sessions', {
      user_id: args.user_id,
      token_hash: args.token_hash,
      email_verified: true,
      phrase_verified: false,
      expires_at: now + RECOVERY_SESSION_TTL_MS,
      created_at: now
    });
  }
});

export const getRecoverySessionByTokenHash = query({
  args: {
    token_hash: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('recovery_sessions')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.token_hash))
      .unique();

    if (session === null) return null;
    if (session.expires_at < Date.now()) return null;
    return session;
  }
});

export const createRecoveryHandshake = mutation({
  args: {
    token_hash: v.string(),
    server_ephemeral_secret: v.string(),
    expires_at: v.number()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('recovery_sessions')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.token_hash))
      .unique();

    if (session === null) throw new Error('RECOVERY_SESSION_NOT_FOUND');

    await ctx.db.patch(session._id, {
      server_ephemeral_secret: args.server_ephemeral_secret,
      handshake_expires_at: args.expires_at
    });
  }
});

export const consumeRecoveryHandshake = mutation({
  args: {
    token_hash: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('recovery_sessions')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.token_hash))
      .unique();

    if (session === null) return null;

    const state = {
      server_ephemeral_secret: session.server_ephemeral_secret,
      handshake_expires_at: session.handshake_expires_at
    };

    await ctx.db.patch(session._id, {
      server_ephemeral_secret: undefined,
      handshake_expires_at: undefined
    });

    return state;
  }
});

export const markRecoveryPhraseVerified = mutation({
  args: {
    token_hash: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('recovery_sessions')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.token_hash))
      .unique();

    if (session === null) throw new Error('RECOVERY_SESSION_NOT_FOUND');

    await ctx.db.patch(session._id, {
      phrase_verified: true,
      expires_at: Date.now() + RECOVERY_SESSION_TTL_MS
    });

    return session.user_id;
  }
});

export const deleteRecoverySessionByTokenHash = mutation({
  args: {
    token_hash: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('recovery_sessions')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.token_hash))
      .unique();

    if (session !== null) {
      await ctx.db.delete(session._id);
    }
  }
});

export const revokeAllUserSessions = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    await Promise.all(sessions.map((session) => ctx.db.delete(session._id)));
    return sessions.length;
  }
});
