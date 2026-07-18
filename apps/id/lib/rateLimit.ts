/**
 * Redis-backed sliding window rate limiter for auth routes.
 *
 * Uses a distributed sliding window algorithm with Redis for high-availability
 * deployments. Keys are prefixed with `rl:` to avoid collisions.
 *
 * Limits are configurable per route and dimension (IP, account, or client).
 */

import Redis from 'ioredis';
import { getEnv } from './env';

let redisClient: Redis | null = null;

type RedisCommandArg = string | number;
type RedisCommand = [string, ...RedisCommandArg[]];
type RedisResult = { result?: unknown; error?: string };

type RedisBackend =
  | {
      kind: 'tcp';
      client: Redis;
    }
  | {
      kind: 'rest';
      baseUrl: string;
      token: string;
    };

let redisBackend: RedisBackend | null = null;

function getRedisBackend(): RedisBackend {
  if (redisBackend !== null) {
    return redisBackend;
  }

  const env = getEnv();
  const redisUrl = new URL(env.REDIS_URL);

  if (redisUrl.protocol === 'http:' || redisUrl.protocol === 'https:') {
    redisBackend = {
      kind: 'rest',
      baseUrl: redisUrl.toString().replace(/\/$/, ''),
      token: env.REDIS_TOKEN
    };
    return redisBackend;
  }

  if (redisUrl.protocol !== 'redis:' && redisUrl.protocol !== 'rediss:') {
    throw new Error(
      `Unsupported REDIS_URL protocol "${redisUrl.protocol}". Use redis://, rediss://, http://, or https://.`
    );
  }

  redisClient = new Redis(env.REDIS_URL, {
    password: redisUrl.password || env.REDIS_TOKEN,
    maxRetriesPerRequest: 0,
    retryStrategy: null,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  redisClient.on('error', (error) => {
    console.error('Redis connection error:', error);
  });

  redisBackend = {
    kind: 'tcp',
    client: redisClient
  };
  return redisBackend;
}

function getRedis(): Redis {
  const backend = getRedisBackend();
  if (backend.kind !== 'tcp') {
    throw new Error('TCP Redis client requested for a REST-backed Redis configuration.');
  }
  return backend.client;
}

async function executeRestPipeline(
  baseUrl: string,
  token: string,
  commands: RedisCommand[]
): Promise<RedisResult[]> {
  const response = await fetch(`${baseUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands),
    cache: 'no-store'
  });

  const payload = (await response.json()) as RedisResult[] | { error?: string };

  if (!response.ok) {
    const error =
      !Array.isArray(payload) && typeof payload.error === 'string'
        ? payload.error
        : `REST Redis request failed with status ${response.status}`;
    throw new Error(error);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Unexpected REST Redis response shape.');
  }

  return payload;
}

async function executeTcpPipeline(client: Redis, commands: RedisCommand[]): Promise<RedisResult[]> {
  const pipeline = client.pipeline();

  for (const [command, ...args] of commands) {
    switch (command) {
      case 'ZREMRANGEBYSCORE':
        pipeline.zremrangebyscore(
          String(args[0]),
          Number(args[1]),
          Number(args[2])
        );
        break;
      case 'ZCARD':
        pipeline.zcard(String(args[0]));
        break;
      case 'ZADD':
        pipeline.zadd(String(args[0]), Number(args[1]), String(args[2]));
        break;
      case 'PEXPIRE':
        pipeline.pexpire(String(args[0]), Number(args[1]));
        break;
      case 'ZRANGE':
        pipeline.zrange(String(args[0]), Number(args[1]), Number(args[2]));
        break;
      case 'ZSCORE':
        pipeline.zscore(String(args[0]), String(args[1]));
        break;
      case 'DEL':
        pipeline.del(String(args[0]));
        break;
      default:
        throw new Error(`Unsupported Redis pipeline command: ${command}`);
    }
  }

  const results = await pipeline.exec();
  if (!results) {
    return [];
  }

  return results.map(([error, result]) =>
    error ? { error: error.message } : { result }
  );
}

async function executePipeline(commands: RedisCommand[]): Promise<RedisResult[]> {
  const backend = getRedisBackend();

  if (backend.kind === 'rest') {
    return executeRestPipeline(backend.baseUrl, backend.token, commands);
  }

  return executeTcpPipeline(backend.client, commands);
}

function readPipelineResult(results: RedisResult[], index: number): unknown {
  const entry = results[index];
  if (!entry) {
    return null;
  }
  if (entry.error) {
    throw new Error(entry.error);
  }
  return entry.result ?? null;
}

function extractFirstMember(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return typeof value[0] === 'string' ? value[0] : String(value[0]);
}

function parseTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const timestamp = Number.parseInt(String(value), 10);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export type RateLimitDimension = 'ip' | 'account' | 'client';

export interface RateLimitConfig {
  route: string;
  dimension: RateLimitDimension;
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const DEFAULT_CONFIGS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/srp/initiate': { maxRequests: 8, windowMs: 15 * 60 * 1000 },
  '/api/srp/complete': { maxRequests: 8, windowMs: 15 * 60 * 1000 },
  '/api/oidc/authorize:auth_code': { maxRequests: 30, windowMs: 15 * 60 * 1000 },
  '/api/oidc/token:auth_code': { maxRequests: 20, windowMs: 15 * 60 * 1000 },
  '/api/oidc/token:refresh': { maxRequests: 60, windowMs: 15 * 60 * 1000 },
  '/api/auth/recovery': { maxRequests: 5, windowMs: 15 * 60 * 1000 }
};

function makeKey(route: string, dimension: RateLimitDimension, identifier: string): string {
  const normalizedRoute = route.replace(/:/g, '/');
  return `rl:${dimension}:${normalizedRoute}:${identifier}`;
}

/**
 * Checks and increments the rate limit counter for a route and identifier.
 *
 * @param route - The route being rate-limited
 * @param dimension - The dimension for the limit (ip, account, or client)
 * @param identifier - The identifier for the dimension (IP address, account ID, or client ID)
 * @returns true if the request is allowed, false if rate-limited
 */
export async function checkRateLimit(
  route: string,
  dimension: RateLimitDimension,
  identifier: string
): Promise<boolean> {
  const config = DEFAULT_CONFIGS[route] || { maxRequests: 10, windowMs: 15 * 60 * 1000 };
  return (await checkRateLimitCustom(route, dimension, identifier, config.maxRequests, config.windowMs)).allowed;
}

/**
 * Checks and increments the rate limit counter with custom parameters.
 *
 * @param route - The route being rate-limited
 * @param dimension - The dimension for the limit (ip, account, or client)
 * @param identifier - The identifier for the dimension
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns RateLimitResult with allowed status, remaining count, and reset time
 */
export async function checkRateLimitCustom(
  route: string,
  dimension: RateLimitDimension,
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const key = makeKey(route, dimension, identifier);
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    const results = await executePipeline([
      ['ZREMRANGEBYSCORE', key, 0, windowStart],
      ['ZCARD', key],
      ['ZADD', key, now, `${now}-${crypto.randomUUID()}`],
      ['PEXPIRE', key, windowMs]
    ]);

    const count = Number(readPipelineResult(results, 1) ?? 0) + 1;
    const allowed = count <= maxRequests;

    if (allowed) {
      return { allowed, remaining: maxRequests - count, resetAt: now + windowMs };
    }

    const overflowResults = await executePipeline([['ZRANGE', key, 0, 0]]);
    const firstMember = extractFirstMember(readPipelineResult(overflowResults, 0));
    const firstTimestamp =
      firstMember === null
        ? null
        : parseTimestamp(
            readPipelineResult(
              await executePipeline([['ZSCORE', key, firstMember]]),
              0
            )
          );
    await executePipeline([['DEL', key]]);

    return {
      allowed,
      remaining: 0,
      resetAt: firstTimestamp ? firstTimestamp + windowMs : now + windowMs
    };
  } catch (error) {
    console.error('Rate limit backend unavailable, allowing request:', error);
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }
}

/**
 * Returns the remaining attempts and reset time for a rate limit.
 *
 * @param route - The route being rate-limited
 * @param dimension - The dimension for the limit (ip, account, or client)
 * @param identifier - The identifier for the dimension
 * @returns RateLimitResult with remaining count and reset time
 */
export async function getRateLimitInfo(
  route: string,
  dimension: RateLimitDimension,
  identifier: string
): Promise<{ remaining: number; resetAt: number }> {
  const config = DEFAULT_CONFIGS[route] || { maxRequests: 10, windowMs: 15 * 60 * 1000 };
  return await getRateLimitInfoCustom(route, dimension, identifier, config.maxRequests, config.windowMs);
}

/**
 * Returns rate limit info with custom parameters.
 *
 * @param route - The route being rate-limited
 * @param dimension - The dimension for the limit (ip, account, or client)
 * @param identifier - The identifier for the dimension
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 * @returns RateLimitResult with remaining count and reset time
 */
export async function getRateLimitInfoCustom(
  route: string,
  dimension: RateLimitDimension,
  identifier: string,
  maxRequests: number,
  windowMs: number
): Promise<{ remaining: number; resetAt: number }> {
  const key = makeKey(route, dimension, identifier);
  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    const results = await executePipeline([
      ['ZREMRANGEBYSCORE', key, 0, windowStart],
      ['ZCARD', key],
      ['ZRANGE', key, 0, 0]
    ]);
    const count = Number(readPipelineResult(results, 1) ?? 0);

    if (count === 0) {
      return { remaining: maxRequests, resetAt: now + windowMs };
    }

    const firstMember = extractFirstMember(readPipelineResult(results, 2));
    const firstTimestamp =
      firstMember === null
        ? null
        : parseTimestamp(
            readPipelineResult(
              await executePipeline([['ZSCORE', key, firstMember]]),
              0
            )
          );
    return {
      remaining: Math.max(0, maxRequests - count),
      resetAt: firstTimestamp ? firstTimestamp + windowMs : now + windowMs
    };
  } catch (error) {
    console.error('Failed to read rate limit info:', error);
    return { remaining: maxRequests, resetAt: now + windowMs };
  }
}

/**
 * Clears the rate limit for a specific key.
 *
 * @param route - The route being rate-limited
 * @param dimension - The dimension for the limit (ip, account, or client)
 * @param identifier - The identifier for the dimension
 */
export async function clearRateLimit(
  route: string,
  dimension: RateLimitDimension,
  identifier: string
): Promise<void> {
  const key = makeKey(route, dimension, identifier);
  try {
    const backend = getRedisBackend();
    if (backend.kind === 'rest') {
      await executePipeline([['DEL', key]]);
      return;
    }

    const redis = getRedis();
    await redis.del(key);
  } catch (error) {
    console.error('Failed to clear rate limit key:', error);
  }
}
