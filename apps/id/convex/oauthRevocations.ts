import { v } from 'convex/values';
import { query, mutation } from './_generated/server';

export const getGlobalCutoff = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const revocation = await ctx.db
      .query('oauth_revocations')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .first();

    if (!revocation) {
      return 0;
    }

    return revocation.global_revoked_after;
  }
});

export const setGlobalCutoff = mutation({
  args: { userId: v.id('users'), cutoff: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('oauth_revocations')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        global_revoked_after: Math.max(existing.global_revoked_after, args.cutoff),
        updated_at: now
      });
    } else {
      await ctx.db.insert('oauth_revocations', {
        user_id: args.userId,
        global_revoked_after: args.cutoff,
        updated_at: now
      });
    }

    return { success: true, cutoff: args.cutoff };
  }
});

export const setGlobalCutoffNow = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('oauth_revocations')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        global_revoked_after: Math.max(existing.global_revoked_after, now),
        updated_at: now
      });
    } else {
      await ctx.db.insert('oauth_revocations', {
        user_id: args.userId,
        global_revoked_after: now,
        updated_at: now
      });
    }

    return { success: true, cutoff: now };
  }
});

export const deleteForUser = mutation({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('oauth_revocations')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return { success: true };
  }
});
