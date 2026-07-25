import { v } from 'convex/values';
import { mutation } from './_generated/server';

const TICKET_TTL_MS = 120_000;

export const create = mutation({
  args: {
    ticketHash: v.string(),
    userId: v.id('users'),
    mode: v.union(v.literal('popup'), v.literal('redirect')),
    nonce: v.string(),
    publicKey: v.string(),
    origin: v.string(),
    clientId: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + TICKET_TTL_MS;

    await ctx.db.insert('handoff_tickets', {
      ticket_hash: args.ticketHash,
      user_id: args.userId,
      mode: args.mode,
      nonce: args.nonce,
      public_key: args.publicKey,
      origin: args.origin,
      client_id: args.clientId,
      expires_at: expiresAt,
      created_at: now
    });
  }
});

export const redeem = mutation({
  args: {
    ticketHash: v.string(),
    userId: v.id('users')
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db
      .query('handoff_tickets')
      .withIndex('by_ticket_hash', (q) => q.eq('ticket_hash', args.ticketHash))
      .first();

    if (!ticket) {
      return { success: false, reason: 'not_found' as const };
    }

    const now = Date.now();

    if (ticket.redeemed_at) {
      return { success: false, reason: 'already_redeemed' as const };
    }

    if (now > ticket.expires_at) {
      return { success: false, reason: 'expired' as const };
    }

    if (ticket.user_id !== args.userId) {
      return { success: false, reason: 'user_mismatch' as const };
    }

    await ctx.db.patch(ticket._id, {
      redeemed_at: now
    });

    return {
      success: true,
      handoff: {
        mode: ticket.mode,
        nonce: ticket.nonce,
        publicKey: ticket.public_key,
        origin: ticket.origin,
        clientId: ticket.client_id
      }
    };
  }
});

export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query('handoff_tickets')
      .filter((q) => q.lt(q.field('expires_at'), now))
      .collect();

    for (const ticket of expired) {
      await ctx.db.delete(ticket._id);
    }

    return { deleted: expired.length };
  }
});
