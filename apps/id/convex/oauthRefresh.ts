import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const INACTIVE_TTL_MS = 72 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const issue = mutation({
  args: {
    tokenHash: v.string(),
    tokenFamilyId: v.string(),
    parentTokenHash: v.optional(v.string()),
    clientId: v.string(),
    userId: v.id('users'),
    scope: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + ABSOLUTE_TTL_MS;
    const inactiveExpiresAt = now + INACTIVE_TTL_MS;

    await ctx.db.insert('oauth_refresh_tokens', {
      token_hash: args.tokenHash,
      token_family_id: args.tokenFamilyId,
      parent_token_hash: args.parentTokenHash,
      client_id: args.clientId,
      user_id: args.userId,
      scope: args.scope,
      issued_at: now,
      last_used_at: now,
      expires_at: expiresAt,
      inactive_expires_at: inactiveExpiresAt
    });
  }
});

export const lookup = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.tokenHash))
      .first();

    if (!token) {
      return { found: false, reason: 'not_found' };
    }

    const now = Date.now();

    if (token.revoked_at) {
      return { found: true, valid: false, reason: 'revoked', token };
    }

    if (token.rotated_to_hash) {
      return {
        found: true,
        valid: false,
        reason: 'replay_detected' as const,
        token
      };
    }

    if (now > token.expires_at) {
      return { found: true, valid: false, reason: 'absolute_expired' as const, token };
    }

    if (now > token.inactive_expires_at) {
      return { found: true, valid: false, reason: 'inactive_expired' as const, token };
    }

    return { found: true, valid: true, token };
  }
});

export const rotate = mutation({
  args: {
    oldTokenHash: v.string(),
    newTokenHash: v.string(),
    clientId: v.string(),
    scope: v.string()
  },
  handler: async (ctx, args) => {
    const oldToken = await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.oldTokenHash))
      .first();

    if (!oldToken) {
      return { success: false, reason: 'not_found' };
    }

    const now = Date.now();

    if (oldToken.revoked_at) {
      return { success: false, reason: 'revoked' };
    }

    if (oldToken.rotated_to_hash) {
      const familyTokens = await ctx.db
        .query('oauth_refresh_tokens')
        .withIndex('by_family', (q) => q.eq('token_family_id', oldToken.token_family_id))
        .collect();

      const now = Date.now();
      for (const token of familyTokens) {
        await ctx.db.patch(token._id, {
          revoked_at: now,
          revoke_reason: 'replay'
        });
      }

      return { success: false, reason: 'replay_detected' as const, familyId: oldToken.token_family_id };
    }

    if (now > oldToken.expires_at) {
      return { success: false, reason: 'absolute_expired' };
    }

    if (now > oldToken.inactive_expires_at) {
      return { success: false, reason: 'inactive_expired' };
    }

    const newExpiresAt = now + ABSOLUTE_TTL_MS;
    const newInactiveExpiresAt = now + INACTIVE_TTL_MS;

    const newTokenId = await ctx.db.insert('oauth_refresh_tokens', {
      token_hash: args.newTokenHash,
      token_family_id: oldToken.token_family_id,
      parent_token_hash: oldToken.token_hash,
      client_id: args.clientId,
      user_id: oldToken.user_id,
      scope: args.scope,
      issued_at: now,
      last_used_at: now,
      expires_at: newExpiresAt,
      inactive_expires_at: newInactiveExpiresAt
    });

    await ctx.db.patch(oldToken._id, {
      rotated_to_hash: args.newTokenHash,
      last_used_at: now
    });

    return {
      success: true,
      oldToken: {
        user_id: oldToken.user_id,
        token_family_id: oldToken.token_family_id
      }
    };
  }
});

export const revoke = mutation({
  args: { tokenHash: v.string(), reason: v.union(v.literal('logout'), v.literal('global_logout'), v.literal('replay'), v.literal('admin')) },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_token_hash', (q) => q.eq('token_hash', args.tokenHash))
      .first();

    if (!token) {
      return { success: true, reason: 'already_revoked' };
    }

    await ctx.db.patch(token._id, {
      revoked_at: Date.now(),
      revoke_reason: args.reason
    });

    return { success: true };
  }
});

export const revokeFamily = mutation({
  args: { familyId: v.string(), reason: v.union(v.literal('logout'), v.literal('global_logout'), v.literal('replay'), v.literal('admin')) },
  handler: async (ctx, args) => {
    const familyTokens = await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_family', (q) => q.eq('token_family_id', args.familyId))
      .collect();

    const now = Date.now();
    for (const token of familyTokens) {
      await ctx.db.patch(token._id, {
        revoked_at: now,
        revoke_reason: args.reason
      });
    }

    return { revoked: familyTokens.length };
  }
});

export const revokeAllForUser = mutation({
  args: { userId: v.id('users'), reason: v.union(v.literal('logout'), v.literal('global_logout'), v.literal('admin')) },
  handler: async (ctx, args) => {
    const userTokens = await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .collect();

    const now = Date.now();
    const familyIds = new Set<string>();

    for (const token of userTokens) {
      familyIds.add(token.token_family_id);
      await ctx.db.patch(token._id, {
        revoked_at: now,
        revoke_reason: args.reason
      });
    }

    return { revoked: userTokens.length, families: familyIds.size };
  }
});

export const getByFamily = query({
  args: { familyId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_family', (q) => q.eq('token_family_id', args.familyId))
      .collect();
  }
});

export const getByUser = query({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_user', (q) => q.eq('user_id', args.userId))
      .collect();
  }
});

export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredTokens = await ctx.db
      .query('oauth_refresh_tokens')
      .filter((q) => q.lt(q.field('expires_at'), now))
      .collect();

    for (const token of expiredTokens) {
      await ctx.db.delete(token._id);
    }

    return { deleted: expiredTokens.length };
  }
});
