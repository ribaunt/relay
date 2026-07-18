import {
  mutationGeneric as mutation,
  queryGeneric as query
} from 'convex/server';
import { v } from 'convex/values';

// ─── createSession ────────────────────────────────────────────────────────────
// Stores the SHA-256 hash of the session token. Never stores the raw token.

export const createSession = mutation({
  args: {
    user_id: v.id('users'),
    token_hash: v.string(),
    device_name: v.optional(v.string()),
    device_fingerprint: v.optional(v.string()),
    expires_at: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert('sessions', {
      user_id: args.user_id,
      token_hash: args.token_hash,
      device_name: args.device_name,
      device_fingerprint: args.device_fingerprint,
      expires_at: args.expires_at,
      created_at: now
    });
  }
});

// ─── getSessionByTokenHash ────────────────────────────────────────────────────
// Validates a session. Returns null for missing or expired sessions.

export const getSessionByTokenHash = query({
  args: {
    token_hash: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.token_hash))
      .unique();

    if (session === null) return null;

    // Treat expired sessions as non-existent
    if (session.expires_at < Date.now()) return null;

    return session;
  }
});

// ─── getUserSessions ──────────────────────────────────────────────────────────
// Lists all active (non-expired) sessions for a user.

export const getUserSessions = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    // Filter expired sessions client-side — Convex doesn't support filter on index range
    return sessions.filter((s) => s.expires_at > now);
  }
});

// ─── revokeSession ────────────────────────────────────────────────────────────
// Deletes a single session by its document ID.

export const revokeSession = mutation({
  args: {
    session_id: v.id('sessions'),
    user_id: v.id('users'), // passed for ownership check + audit log
    ip_hash: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.session_id);

    // Ownership check — prevent users from revoking others' sessions
    if (session === null || session.user_id !== args.user_id) {
      throw new Error('SESSION_NOT_FOUND');
    }

    await ctx.db.delete(args.session_id);

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'session_revoked' as const,
      ip_hash: args.ip_hash,
      metadata: { session_id: args.session_id },
      created_at: Date.now()
    });
  }
});

// ─── revokeAllSessions ────────────────────────────────────────────────────────
// Deletes all sessions for a user except the current active one.
// Used after password change.

export const revokeAllSessions = mutation({
  args: {
    user_id: v.id('users'),
    current_session_id: v.id('sessions'),
    ip_hash: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    const toRevoke = sessions.filter((s) => s._id !== args.current_session_id);

    await Promise.all(toRevoke.map((s) => ctx.db.delete(s._id)));

    if (toRevoke.length > 0) {
      await ctx.db.insert('audit_log', {
        user_id: args.user_id,
        event_type: 'session_revoked' as const,
        ip_hash: args.ip_hash,
        metadata: { count: toRevoke.length, reason: 'password_changed' },
        created_at: Date.now()
      });
    }
  }
});
