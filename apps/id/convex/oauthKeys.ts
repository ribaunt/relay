import { v } from 'convex/values';
import { query, mutation } from './_generated/server';

export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const key = await ctx.db
      .query('oauth_signing_keys')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .first();

    if (!key) {
      return null;
    }

    return {
      kid: key.kid,
      publicJwk: JSON.parse(key.public_jwk_json) as Record<string, unknown>
    };
  }
});

export const getByKid = query({
  args: { kid: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('oauth_signing_keys')
      .withIndex('by_kid', (q) => q.eq('kid', args.kid))
      .first();

    if (!key) {
      return null;
    }

    return {
      kid: key.kid,
      publicJwk: JSON.parse(key.public_jwk_json) as Record<string, unknown>,
      status: key.status,
      activatedAt: key.activated_at,
      retireAt: key.retire_at
    };
  }
});

export const getActiveAndPrevious = query({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db
      .query('oauth_signing_keys')
      .withIndex('by_status')
      .collect();

    const result = keys
      .filter((k) => k.status === 'active' || k.status === 'previous')
      .map((k) => ({
        kid: k.kid,
        publicJwk: JSON.parse(k.public_jwk_json) as Record<string, unknown>,
        status: k.status
      }));

    return result;
  }
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.db.query('oauth_signing_keys').collect();

    return keys.map((k) => ({
      kid: k.kid,
      status: k.status,
      activatedAt: k.activated_at,
      retireAt: k.retire_at,
      createdAt: k.created_at
    }));
  }
});

export const create = mutation({
  args: {
    kid: v.string(),
    publicJwk: v.string(),
    activatedAt: v.optional(v.number()),
    retireAt: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.insert('oauth_signing_keys', {
      kid: args.kid,
      use: 'sig',
      alg: 'RS256',
      public_jwk_json: args.publicJwk,
      status: 'active',
      activated_at: args.activatedAt ?? now,
      retire_at: args.retireAt,
      created_at: now
    });
  }
});

export const rotate = mutation({
  args: { newKid: v.string(), newPublicJwk: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    const currentActive = await ctx.db
      .query('oauth_signing_keys')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .first();

    if (currentActive) {
      await ctx.db.patch(currentActive._id, {
        status: 'previous',
        retire_at: now + 7 * 24 * 60 * 60 * 1000
      });
    }

    const previousActive = await ctx.db
      .query('oauth_signing_keys')
      .withIndex('by_status', (q) => q.eq('status', 'previous'))
      .collect();

    for (const prev of previousActive) {
      await ctx.db.patch(prev._id, {
        status: 'retired',
        retire_at: now
      });
    }

    await ctx.db.insert('oauth_signing_keys', {
      kid: args.newKid,
      use: 'sig',
      alg: 'RS256',
      public_jwk_json: args.newPublicJwk,
      status: 'active',
      activated_at: now,
      created_at: now
    });

    return { success: true, previousKeyId: currentActive?.kid };
  }
});

export const markRetired = mutation({
  args: { kid: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query('oauth_signing_keys')
      .withIndex('by_kid', (q) => q.eq('kid', args.kid))
      .first();

    if (!key) {
      return { success: false, reason: 'not_found' };
    }

    await ctx.db.patch(key._id, {
      status: 'retired',
      retire_at: Date.now()
    });

    return { success: true };
  }
});
