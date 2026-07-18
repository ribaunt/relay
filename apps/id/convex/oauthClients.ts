import { v } from 'convex/values';
import { defaults } from '@relay/services';
import { query, mutation, type MutationCtx } from './_generated/server';

const RELAY_AUTH_REQUIRED_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'relay.bootstrap',
  'relay.masterkey_handoff'
] as const;

const RELAY_AUTH_CLIENT_IDS = new Set([
  defaults.auth.oauthClientId,
  defaults.auth.oauthClientId.replace(/\./g, '-'),
]);

function normalizeFirstParty(client: {
  is_first_party?: boolean;
}) {
  return client.is_first_party === true;
}

function normalizeAllowedScopes(
  clientId: string,
  isFirstParty: boolean,
  allowedScopes: string[]
): string[] {
  const scopeSet = new Set(allowedScopes);

  if (isFirstParty && RELAY_AUTH_CLIENT_IDS.has(clientId)) {
    for (const scope of RELAY_AUTH_REQUIRED_SCOPES) {
      scopeSet.add(scope);
    }
  }

  return Array.from(scopeSet);
}

type OAuthClientInput = {
  clientId: string;
  clientName: string;
  clientType: 'confidential' | 'public';
  clientSecretHash?: string;
  isFirstParty: boolean;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedOrigins: string[];
  allowedScopes: string[];
  enforcePkce: boolean;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

async function upsertClientRecord(ctx: MutationCtx, args: OAuthClientInput) {
  const now = Date.now();
  const allowedScopes = normalizeAllowedScopes(
    args.clientId,
    args.isFirstParty,
    unique(args.allowedScopes)
  );
  const existing = await ctx.db
    .query('oauth_clients')
    .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
    .first();

  const payload = {
    client_id: args.clientId,
    client_name: args.clientName,
    client_type: args.clientType,
    client_secret_hash: args.clientSecretHash,
    is_first_party: args.isFirstParty,
    redirect_uris: unique(args.redirectUris),
    post_logout_redirect_uris: unique(args.postLogoutRedirectUris),
    allowed_origins: unique(args.allowedOrigins),
    allowed_scopes: allowedScopes,
    enforce_pkce: args.enforcePkce,
    status: 'active' as const,
    updated_at: now
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return;
  }

  await ctx.db.insert('oauth_clients', {
    ...payload,
    created_at: now
  });
}

export const getByClientId = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (!client || client.status !== 'active') {
      return null;
    }

    return {
      _id: client._id,
      _creationTime: client._creationTime,
      client_id: client.client_id,
      client_name: client.client_name,
      client_type: client.client_type,
      client_secret_hash: client.client_secret_hash,
      is_first_party: normalizeFirstParty(client),
      redirect_uris: client.redirect_uris,
      post_logout_redirect_uris: client.post_logout_redirect_uris,
      allowed_origins: client.allowed_origins,
      allowed_scopes: client.allowed_scopes,
      enforce_pkce: client.enforce_pkce,
      status: client.status,
      created_at: client.created_at,
      updated_at: client.updated_at
    };
  }
});

export const validateRedirectUri = query({
  args: {
    clientId: v.string(),
    redirectUri: v.string()
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (!client || client.status !== 'active') {
      return false;
    }

    return client.redirect_uris.includes(args.redirectUri);
  }
});

export const validateOrigin = query({
  args: {
    clientId: v.string(),
    origin: v.string()
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (!client || client.status !== 'active') {
      return false;
    }

    return client.allowed_origins.includes(args.origin);
  }
});

export const validateScope = query({
  args: {
    clientId: v.string(),
    scope: v.string()
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (!client || client.status !== 'active') {
      return false;
    }

    const requestedScopes = args.scope.split(' ').filter(Boolean);
    return requestedScopes.every((s) => client.allowed_scopes.includes(s));
  }
});

export const validateClientSecret = query({
  args: {
    clientId: v.string(),
    clientSecretHash: v.string()
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (!client || client.status !== 'active') {
      return false;
    }

    if (client.client_type === 'confidential') {
      return client.client_secret_hash === args.clientSecretHash;
    }

    return true;
  }
});

export const listActiveClients = query({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db
      .query('oauth_clients')
      .filter((q) => q.eq(q.field('status'), 'active'))
      .collect();

    return clients.map((c) => ({
      client_id: c.client_id,
      client_name: c.client_name,
      client_type: c.client_type,
      is_first_party: normalizeFirstParty(c),
      redirect_uris: c.redirect_uris,
      allowed_origins: c.allowed_origins,
      allowed_scopes: c.allowed_scopes,
      enforce_pkce: c.enforce_pkce
    }));
  }
});

export const create = mutation({
  args: {
    clientId: v.string(),
    clientName: v.string(),
    clientType: v.union(v.literal('confidential'), v.literal('public')),
    clientSecretHash: v.optional(v.string()),
    isFirstParty: v.boolean(),
    redirectUris: v.array(v.string()),
    postLogoutRedirectUris: v.array(v.string()),
    allowedOrigins: v.array(v.string()),
    allowedScopes: v.array(v.string()),
    enforcePkce: v.boolean()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (existing) {
      throw new Error('Client already exists');
    }

    await upsertClientRecord(ctx, args);
  }
});

export const upsert = mutation({
  args: {
    clientId: v.string(),
    clientName: v.string(),
    clientType: v.union(v.literal('confidential'), v.literal('public')),
    clientSecretHash: v.optional(v.string()),
    isFirstParty: v.boolean(),
    redirectUris: v.array(v.string()),
    postLogoutRedirectUris: v.array(v.string()),
    allowedOrigins: v.array(v.string()),
    allowedScopes: v.array(v.string()),
    enforcePkce: v.boolean()
  },
  handler: async (ctx, args) => {
    await upsertClientRecord(ctx, args);
  }
});

export const ensureRelayAuthClient = mutation({
  args: {
    authBaseUrl: v.optional(v.string()),
    localAuthBaseUrl: v.optional(v.string()),
    clientId: v.optional(v.string()),
    clientName: v.optional(v.string()),
    clientType: v.optional(v.union(v.literal('confidential'), v.literal('public'))),
    clientSecretHash: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const authBaseUrl = new URL(args.authBaseUrl ?? defaults.auth.origin);
    const localAuthBaseUrl = args.localAuthBaseUrl
      ? new URL(args.localAuthBaseUrl)
      : null;
    const clientId = args.clientId ?? authBaseUrl.host;

    await upsertClientRecord(ctx, {
      clientId,
      clientName: args.clientName ?? clientId,
      clientType: args.clientType ?? 'public',
      clientSecretHash: args.clientSecretHash,
      isFirstParty: true,
      redirectUris: unique([
        new URL('/oauth/callback', authBaseUrl).toString(),
        ...(localAuthBaseUrl
          ? [new URL('/oauth/callback', localAuthBaseUrl).toString()]
          : [])
      ]),
      postLogoutRedirectUris: unique([
        new URL('/', authBaseUrl).toString(),
        ...(localAuthBaseUrl ? [new URL('/', localAuthBaseUrl).toString()] : [])
      ]),
      allowedOrigins: unique([
        authBaseUrl.origin,
        ...(localAuthBaseUrl ? [localAuthBaseUrl.origin] : [])
      ]),
      allowedScopes: ['openid', 'profile', 'relay.bootstrap', 'relay.masterkey_handoff'],
      enforcePkce: true
    });
  }
});

export const updateStatus = mutation({
  args: {
    clientId: v.string(),
    status: v.union(v.literal('active'), v.literal('disabled'))
  },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query('oauth_clients')
      .withIndex('by_client_id', (q) => q.eq('client_id', args.clientId))
      .first();

    if (!client) {
      throw new Error('Client not found');
    }

    await ctx.db.patch(client._id, {
      status: args.status,
      updated_at: Date.now()
    });
  }
});
