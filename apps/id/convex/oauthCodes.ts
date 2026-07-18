import { v } from 'convex/values';
import { query, mutation } from './_generated/server';

const CODE_TTL_MS = 10 * 60 * 1000;

export const create = mutation({
  args: {
    codeHash: v.string(),
    clientId: v.string(),
    userId: v.id('users'),
    redirectUri: v.string(),
    scope: v.string(),
    codeChallenge: v.string(),
    nonce: v.optional(v.string()),
    handoffMode: v.optional(v.union(v.literal('popup'), v.literal('redirect'))),
    handoffNonce: v.optional(v.string()),
    handoffPublicKey: v.optional(v.string()),
    handoffOrigin: v.optional(v.string()),
    handoffClientId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + CODE_TTL_MS;

    await ctx.db.insert('oauth_authorization_codes', {
      code_hash: args.codeHash,
      client_id: args.clientId,
      user_id: args.userId,
      redirect_uri: args.redirectUri,
      scope: args.scope,
      code_challenge: args.codeChallenge,
      code_challenge_method: 'S256',
      nonce: args.nonce,
      expires_at: expiresAt,
      created_at: now,
      handoff_mode: args.handoffMode,
      handoff_nonce: args.handoffNonce,
      handoff_public_key: args.handoffPublicKey,
      handoff_origin: args.handoffOrigin,
      handoff_client_id: args.handoffClientId
    });
  }
});

export const lookup = query({
  args: { codeHash: v.string() },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query('oauth_authorization_codes')
      .withIndex('by_code_hash', (q) => q.eq('code_hash', args.codeHash))
      .first();

    if (!code) {
      return null;
    }

    const now = Date.now();

    if (code.consumed_at) {
      return { ...code, valid: false, reason: 'already_consumed' as const };
    }

    if (now > code.expires_at) {
      return { ...code, valid: false, reason: 'expired' as const };
    }

    return { ...code, valid: true };
  }
});

export const consume = mutation({
  args: { codeHash: v.string() },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query('oauth_authorization_codes')
      .withIndex('by_code_hash', (q) => q.eq('code_hash', args.codeHash))
      .first();

    if (!code) {
      return { success: false, reason: 'not_found' };
    }

    const now = Date.now();

    if (code.consumed_at) {
      return { success: false, reason: 'already_consumed' };
    }

    if (now > code.expires_at) {
      return { success: false, reason: 'expired' };
    }

    await ctx.db.patch(code._id, {
      consumed_at: now
    });

    return {
      success: true,
      code: {
        client_id: code.client_id,
        user_id: code.user_id,
        redirect_uri: code.redirect_uri,
        scope: code.scope,
        code_challenge: code.code_challenge,
        nonce: code.nonce,
        created_at: code.created_at
      }
    };
  }
});

export const cleanupExpired = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredCodes = await ctx.db
      .query('oauth_authorization_codes')
      .filter((q) => q.lt(q.field('expires_at'), now))
      .collect();

    for (const code of expiredCodes) {
      await ctx.db.delete(code._id);
    }

    return { deleted: expiredCodes.length };
  }
});
