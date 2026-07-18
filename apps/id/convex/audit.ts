import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ─── logEvent ─────────────────────────────────────────────────────────────────
// Inserts an audit log entry.
// ip_hash and user_agent_hash must be SHA-256 hashes — never raw values.
// metadata is JSON-stringified before storage.

export const logEvent = mutation({
  args: {
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
    ip_hash: v.optional(v.string()),
    user_agent_hash: v.optional(v.string()),
    metadata: v.optional(v.string()) // JSON-stringified
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: args.event_type,
      ip_hash: args.ip_hash,
      user_agent_hash: args.user_agent_hash,
      metadata: args.metadata,
      created_at: Date.now()
    });
  }
});

// ─── getUserAuditLog ──────────────────────────────────────────────────────────
// Returns the last 50 audit events for a user, newest first.

export const getUserAuditLog = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('audit_log')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .order('desc')
      .take(50);

    return events;
  }
});
