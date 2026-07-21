import {
  mutationGeneric as mutation,
  queryGeneric as query
} from 'convex/server';
import { v } from 'convex/values';

export const registerDevice = mutation({
  args: {
    user_id: v.id('users'),
    device_id: v.string(),
    name: v.string(),
    platform: v.optional(v.string()),
    os: v.optional(v.string()),
    app_version: v.optional(v.string()),
    device_public_key: v.optional(v.string()),
    signing_public_key: v.optional(v.string()),
    push_token: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('device_id', args.device_id))
      .unique();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        platform: args.platform,
        os: args.os,
        app_version: args.app_version,
        push_token: args.push_token,
        status: 'active',
        last_seen: now
      });
      return { deviceId: args.device_id, created: false };
    }

    await ctx.db.insert('devices', {
      user_id: args.user_id,
      device_id: args.device_id,
      name: args.name,
      platform: args.platform,
      os: args.os,
      app_version: args.app_version,
      device_public_key: args.device_public_key,
      signing_public_key: args.signing_public_key,
      push_token: args.push_token,
      status: 'active',
      last_seen: now,
      created_at: now
    });

    return { deviceId: args.device_id, created: true };
  }
});

export const listUserDevices = query({
  args: {
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query('devices')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    return devices
      .filter((d) => d.status === 'active')
      .map((d) => ({
        id: d.device_id,
        name: d.name,
        platform: d.platform,
        os: d.os,
        appVersion: d.app_version,
        lastSeen: d.last_seen,
        createdAt: d.created_at,
        pushToken: d.push_token,
        devicePublicKey: d.device_public_key,
        signingPublicKey: d.signing_public_key,
        status: d.status
      }));
  }
});

export const getDeviceByDeviceId = query({
  args: {
    device_id: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('device_id', args.device_id))
      .unique();
  }
});

export const renameDevice = mutation({
  args: {
    device_id: v.string(),
    user_id: v.id('users'),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('device_id', args.device_id))
      .unique();

    if (device === null || device.user_id !== args.user_id) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    await ctx.db.patch(device._id, {
      name: args.name,
      last_seen: Date.now()
    });
  }
});

export const revokeDevice = mutation({
  args: {
    device_id: v.string(),
    user_id: v.id('users')
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query('devices')
      .withIndex('by_device_id', (q) => q.eq('device_id', args.device_id))
      .unique();

    if (device === null || device.user_id !== args.user_id) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    await ctx.db.patch(device._id, {
      status: 'revoked',
      last_seen: Date.now()
    });

    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    const deviceSessions = sessions.filter(
      (s) => s.device_fingerprint === args.device_id
    );

    await Promise.all(deviceSessions.map((s) => ctx.db.delete(s._id)));

    const refreshTokens = await ctx.db
      .query('oauth_refresh_tokens')
      .withIndex('by_user', (q) => q.eq('user_id', args.user_id))
      .collect();

    const activeTokens = refreshTokens.filter(
      (t) => t.revoked_at === undefined
    );

    await Promise.all(
      activeTokens.map((t) =>
        ctx.db.patch(t._id, {
          revoked_at: Date.now(),
          revoke_reason: 'device_revoked' as const
        })
      )
    );

    await ctx.db.insert('audit_log', {
      user_id: args.user_id,
      event_type: 'session_revoked' as const,
      metadata: JSON.stringify({ device_id: args.device_id, reason: 'device_revoked' }),
      created_at: Date.now()
    });
  }
});