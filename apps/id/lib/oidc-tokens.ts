import { SignJWT, jwtVerify, importJWK, exportJWK, importPKCS8, importSPKI } from 'jose';
import { getEnv } from './env';

const ACCESS_TOKEN_TTL_SEC = 5 * 60;
const ID_TOKEN_TTL_SEC = 5 * 60;

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
  client_id: string;
}

export interface IDTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  auth_time: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export interface TokenVerificationResult {
  valid: boolean;
  claims?: any;
  reason?: string;
}

let accessTokenPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let accessTokenPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;
let idTokenPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let idTokenPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

async function getAccessTokenKeys() {
  if (accessTokenPrivateKey && accessTokenPublicKey) {
    return { privateKey: accessTokenPrivateKey, publicKey: accessTokenPublicKey };
  }

  const env = getEnv();

  accessTokenPrivateKey = await importPKCS8(
    normalizePem(env.OIDC_ACCESS_TOKEN_PRIVATE_KEY_PEM),
    'RS256'
  );
  accessTokenPublicKey = await importSPKI(
    normalizePem(env.OIDC_ACCESS_TOKEN_PUBLIC_KEY_PEM),
    'RS256'
  );

  return { privateKey: accessTokenPrivateKey, publicKey: accessTokenPublicKey };
}

async function getIDTokenKeys() {
  if (idTokenPrivateKey && idTokenPublicKey) {
    return { privateKey: idTokenPrivateKey, publicKey: idTokenPublicKey };
  }

  const env = getEnv();

  idTokenPrivateKey = await importPKCS8(
    normalizePem(env.OIDC_ID_TOKEN_PRIVATE_KEY_PEM),
    'RS256'
  );
  idTokenPublicKey = await importSPKI(
    normalizePem(env.OIDC_ID_TOKEN_PUBLIC_KEY_PEM),
    'RS256'
  );

  return { privateKey: idTokenPrivateKey, publicKey: idTokenPublicKey };
}

export async function generateJTI(): Promise<string> {
  return crypto.randomUUID();
}

export async function signAccessToken(
  issuer: string,
  aud: string,
  sub: string,
  scope: string,
  clientId: string,
  kid: string
): Promise<string> {
  const { privateKey } = await getAccessTokenKeys();
  const jti = await generateJTI();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TOKEN_TTL_SEC;

  const jwt = await new SignJWT({
    iss: issuer,
    aud,
    sub,
    scope,
    iat: now,
    exp,
    jti,
    client_id: clientId
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return jwt;
}

export async function signIDToken(
  issuer: string,
  aud: string,
  sub: string,
  authTime: number,
  nonce: string | undefined,
  email: string | undefined,
  emailVerified: boolean | undefined,
  name: string | undefined,
  picture: string | undefined,
  kid: string
): Promise<string> {
  const { privateKey } = await getIDTokenKeys();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ID_TOKEN_TTL_SEC;

  const claims: any = {
    iss: issuer,
    aud,
    sub,
    iat: now,
    exp,
    auth_time: authTime
  };

  if (nonce !== undefined) {
    claims.nonce = nonce;
  }

  if (email !== undefined) {
    claims.email = email;
    claims.email_verified = emailVerified;
  }

  if (name !== undefined) {
    claims.name = name;
  }

  if (picture !== undefined) {
    claims.picture = picture;
  }

  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return jwt;
}

export async function verifyAccessToken(
  token: string,
  issuer: string,
  audiences: string[],
  kid?: string
): Promise<TokenVerificationResult> {
  try {
    const { publicKey } = await getAccessTokenKeys();

    const { payload } = await jwtVerify(token, publicKey, {
      issuer,
      audience: audiences,
      algorithms: ['RS256']
    });

    return { valid: true, claims: payload };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { valid: false, reason: 'token_expired' };
      }
      if (error.message.includes('signature')) {
        return { valid: false, reason: 'invalid_signature' };
      }
      if (error.message.includes('audience')) {
        return { valid: false, reason: 'invalid_audience' };
      }
      if (error.message.includes('issuer')) {
        return { valid: false, reason: 'invalid_issuer' };
      }
    }
    return { valid: false, reason: 'verification_failed' };
  }
}

export async function verifyIDToken(
  token: string,
  issuer: string,
  audience: string,
  nonce?: string
): Promise<TokenVerificationResult> {
  try {
    const { publicKey } = await getIDTokenKeys();

    const { payload } = await jwtVerify(token, publicKey, {
      issuer,
      audience,
      algorithms: ['RS256']
    });

    if (nonce !== undefined && payload.nonce !== nonce) {
      return { valid: false, reason: 'nonce_mismatch' };
    }

    return { valid: true, claims: payload };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { valid: false, reason: 'token_expired' };
      }
      if (error.message.includes('signature')) {
        return { valid: false, reason: 'invalid_signature' };
      }
      if (error.message.includes('audience')) {
        return { valid: false, reason: 'invalid_audience' };
      }
      if (error.message.includes('issuer')) {
        return { valid: false, reason: 'invalid_issuer' };
      }
    }
    return { valid: false, reason: 'verification_failed' };
  }
}

export async function getPublicKeyAsJWK(keyType: 'access' | 'id', kid: string): Promise<Record<string, unknown>> {
  const env = getEnv();

  if (keyType === 'access') {
    const publicKey = await importSPKI(env.OIDC_ACCESS_TOKEN_PUBLIC_KEY_PEM, 'RS256');
    const jwk = await exportJWK(publicKey);
    return jwk as Record<string, unknown>;
  } else {
    const publicKey = await importSPKI(env.OIDC_ID_TOKEN_PUBLIC_KEY_PEM, 'RS256');
    const jwk = await exportJWK(publicKey);
    return jwk as Record<string, unknown>;
  }
}
