import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// ─── createHandshake ─────────────────────────────────────────────────────────
// Stores the SRP server session state for the duration of the handshake.
// server_ephemeral_secret holds the full JSON-serialized SRPServerSessionStep1
// state (via toJSON()), enabling stateless reconstruction in the /complete step.
// TTL is enforced at 60 seconds. Any existing handshake for the user is replaced.

export const createHandshake = mutation({
  args: {
    user_id: v.id('users'),
    server_ephemeral_secret: v.string(),
    client_public_ephemeral: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Delete any existing handshake for this user (enforce single in-flight SRP)
    const existing = await ctx.db
      .query('srp_handshakes')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }

    return await ctx.db.insert('srp_handshakes', {
      user_id: args.user_id,
      server_ephemeral_secret: args.server_ephemeral_secret,
      client_public_ephemeral: args.client_public_ephemeral,
      expires_at: now + 60_000, // 60-second TTL
      created_at: now
    });
  }
});

// ─── getHandshake ─────────────────────────────────────────────────────────────
// Fetches the handshake for a user. Returns null if not found or expired.

export const getHandshake = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const handshake = await ctx.db
      .query('srp_handshakes')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (handshake === null) return null;

    // Expired handshakes are treated as non-existent
    if (handshake.expires_at < Date.now()) return null;

    return handshake;
  }
});

// ─── deleteHandshake ─────────────────────────────────────────────────────────
// Cleans up the handshake after login completes or on explicit expiry.

export const deleteHandshake = mutation({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const handshake = await ctx.db
      .query('srp_handshakes')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .unique();

    if (handshake !== null) {
      await ctx.db.delete(handshake._id);
    }
  }
});
