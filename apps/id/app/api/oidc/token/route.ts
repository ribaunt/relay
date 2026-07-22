import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { fetchAuthQuery, fetchAuthMutation } from '@/lib/auth-server';
import {
  captureOIDCTokenExchangeSucceeded,
  captureOIDCTokenExchangeFailed,
  captureOIDCRefreshReplayDetected,
  flushPostHog
} from '@/lib/posthog-server';
import { signAccessToken, signIDToken } from '@/lib/oidc-tokens';
import { getEnv } from '@/lib/env';
import { createMasterKeyHandoff, HANDOFF_SCOPE } from '@/lib/master-key-handoff';
import { decryptMasterKey } from '@relay/crypto';
import { consumeHandoffKek, hexToBytes } from '@/lib/handoff-key-store';

type HandoffMode = 'popup' | 'redirect';

type AuthorizationCodeWithHandoff = {
  handoff_mode?: string;
  handoff_nonce?: string;
  handoff_public_key?: string;
  handoff_origin?: string;
  handoff_client_id?: string;
  client_id: string;
};

function isValidHttpsOrLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isValidHandoffMode(value: unknown): value is HandoffMode {
  return value === 'popup' || value === 'redirect';
}

function getHandoffEligibility(input: {
  scopes: string[];
  code: AuthorizationCodeWithHandoff;
  oauthClientId: string;
  issuer: string;
}):
  | { eligible: false; reason: string }
  | {
      eligible: true;
      mode: HandoffMode;
      nonce: string;
      publicKey: string;
      audience: string;
    } {
  if (!input.scopes.includes(HANDOFF_SCOPE)) {
    return { eligible: false, reason: 'scope_not_granted' };
  }

  const hasAnyHandoffParam = [
    input.code.handoff_mode,
    input.code.handoff_nonce,
    input.code.handoff_public_key,
    input.code.handoff_origin,
    input.code.handoff_client_id
  ].some((value) => typeof value === 'string' && value.length > 0);

  if (!hasAnyHandoffParam) {
    return { eligible: false, reason: 'handoff_parameters_missing' };
  }

  const handoffMode = input.code.handoff_mode;
  const handoffNonce = input.code.handoff_nonce;
  const handoffPublicKey = input.code.handoff_public_key;
  const handoffOrigin = input.code.handoff_origin;
  const handoffClientId = input.code.handoff_client_id;

  if (
    typeof handoffMode !== 'string' ||
    handoffMode.length === 0 ||
    typeof handoffNonce !== 'string' ||
    handoffNonce.length === 0 ||
    typeof handoffPublicKey !== 'string' ||
    handoffPublicKey.length === 0 ||
    typeof handoffOrigin !== 'string' ||
    handoffOrigin.length === 0 ||
    typeof handoffClientId !== 'string' ||
    handoffClientId.length === 0
  ) {
    return { eligible: false, reason: 'handoff_parameters_incomplete' };
  }

  if (!isValidHandoffMode(handoffMode)) {
    return { eligible: false, reason: 'handoff_mode_invalid' };
  }

  if (!isValidHttpsOrLocalhostUrl(handoffOrigin)) {
    return { eligible: false, reason: 'handoff_origin_invalid' };
  }

  if (!isValidHttpsOrLocalhostUrl(input.issuer)) {
    return { eligible: false, reason: 'issuer_must_be_https' };
  }

  if (handoffClientId !== input.code.client_id) {
    return { eligible: false, reason: 'handoff_client_id_mismatch_with_authorize_client' };
  }

  if (handoffClientId !== input.oauthClientId) {
    return { eligible: false, reason: 'handoff_client_id_mismatch_with_token_client' };
  }

  return {
    eligible: true,
    mode: handoffMode,
    nonce: handoffNonce,
    publicKey: handoffPublicKey,
    audience: handoffClientId
  };
}

async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyCodeVerifier(codeVerifier: string, codeChallenge: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const base64UrlHash = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64UrlHash === codeChallenge;
}

async function generateRefreshToken(): Promise<string> {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const grantType = formData.get('grant_type') as string;
    const clientId = formData.get('client_id') as string;
    const clientSecret = formData.get('client_secret') as string | null;
    const code = formData.get('code') as string | null;
    const redirectUri = formData.get('redirect_uri') as string | null;
    const codeVerifier = formData.get('code_verifier') as string | null;
    const refreshToken = formData.get('refresh_token') as string | null;
    const scope = formData.get('scope') as string | null;

    const client = await fetchAuthQuery(api.oauthClients.getByClientId, { clientId });

    if (!client) {
      await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'invalid_client');
      await flushPostHog();
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Client not found' },
        { status: 401 }
      );
    }

    const clientSecretHash = clientSecret ? await hashString(clientSecret) : undefined;
    const secretValid = await fetchAuthQuery(api.oauthClients.validateClientSecret, {
      clientId,
      clientSecretHash: clientSecretHash || ''
    });

    if (!secretValid) {
      await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'invalid_client_credentials');
      await flushPostHog();
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client credentials' },
        { status: 401 }
      );
    }

    if (grantType === 'authorization_code') {
      if (!code || !redirectUri || !codeVerifier) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'missing_parameters');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing required parameters' },
          { status: 400 }
        );
      }

      if (!client.redirect_uris.includes(redirectUri)) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'invalid_redirect_uri');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid redirect URI' },
          { status: 400 }
        );
      }

      const codeHash = await hashString(code);
      const codeResult = await fetchAuthQuery(api.oauthCodes.lookup, { codeHash });

      if (!codeResult || !codeResult.valid) {
        const reason = !codeResult ? 'not_found' : ((codeResult as any).reason ?? 'unknown');
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, reason);
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: `Authorization code ${reason}` },
          { status: 400 }
        );
      }

      if (codeResult.client_id !== clientId) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'client_mismatch');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Client ID mismatch' },
          { status: 400 }
        );
      }

      if (codeResult.redirect_uri !== redirectUri) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'redirect_uri_mismatch');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Redirect URI mismatch' },
          { status: 400 }
        );
      }

      const verifierValid = await verifyCodeVerifier(codeVerifier, codeResult.code_challenge);
      if (!verifierValid) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'invalid_verifier');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid code verifier' },
          { status: 400 }
        );
      }

      const consumed = await fetchAuthMutation(api.oauthCodes.consume, { codeHash });
      if (!consumed.success) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, consumed.reason ?? 'unknown');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Authorization code already used or expired' },
          { status: 400 }
        );
      }

      const globalCutoff = await fetchAuthQuery(api.oauthRevocations.getGlobalCutoff, {
        userId: consumed.code!.user_id
      });

      if (globalCutoff && globalCutoff > consumed.code!.created_at) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'global_revocation');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'User globally logged out' },
          { status: 400 }
        );
      }

      const env = getEnv();
      const scopes = consumed.code!.scope.split(' ');
      const includeEmail = scopes.includes('email');
      const includeProfile = scopes.includes('profile');
      const includeOfflineAccess = scopes.includes('offline_access');

      const user = await fetchAuthQuery(api.users.getUserProfileById, {
        user_id: consumed.code!.user_id
      });

      const kid = env.OIDC_JWKS_ACTIVE_KID;
      const accessToken = await signAccessToken(
        env.SITE_URL,
        env.SITE_URL,
        consumed.code!.user_id,
        consumed.code!.scope,
        clientId,
        kid
      );

      const authTime = Math.floor(consumed.code!.created_at / 1000);
      const idToken = await signIDToken(
        env.SITE_URL,
        clientId,
        consumed.code!.user_id,
        authTime,
        consumed.code!.nonce,
        includeEmail ? undefined : undefined,
        includeEmail ? user?.email_verified : undefined,
        includeProfile ? user?.display_name : undefined,
        includeProfile ? user?.avatar_url : undefined,
        kid
      );

      const tokenFamilyId = crypto.randomUUID();
      let refreshTokenResponse: string | undefined;

      if (includeOfflineAccess) {
        const rawRefreshToken = await generateRefreshToken();
        const refreshTokenHash = await hashString(rawRefreshToken);

        await fetchAuthMutation(api.oauthRefresh.issue, {
          tokenHash: refreshTokenHash,
          tokenFamilyId,
          clientId,
          userId: consumed.code!.user_id,
          scope: consumed.code!.scope
        });

        refreshTokenResponse = rawRefreshToken;
      }

      await captureOIDCTokenExchangeSucceeded(requestId, grantType, clientId);
      await flushPostHog();

      const response: any = {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
        scope: consumed.code!.scope
      };

      if (refreshTokenResponse) {
        response.refresh_token = refreshTokenResponse;
      }

      // Master key handoff payload is optional and fail-open if eligibility or wrapping fails.
      const handoffEligibility = getHandoffEligibility({
        scopes,
        code: codeResult as AuthorizationCodeWithHandoff,
        oauthClientId: clientId,
        issuer: env.SITE_URL
      });

      if (handoffEligibility.eligible) {
        // Decrypt encrypted master-key blob with the password-derived KEK that
        // the login page stashed after SRP. Never hand off the ciphertext as
        // if it were the plaintext key.
        let masterKeyBytes: Uint8Array | null = null;
        let kek: Uint8Array | null = null;
        try {
          const kekHex = consumeHandoffKek(consumed.code!.user_id);
          if (!kekHex) {
            console.warn('Skipping master key handoff: no KEK in handoff store', {
              requestId,
              clientId
            });
          } else {
            const encryptedKeyResult = await fetchAuthQuery(api.users.getEncryptedMasterKeyById, {
              user_id: consumed.code!.user_id
            });
            if (!encryptedKeyResult) {
              console.warn('Skipping master key handoff: encrypted master key missing', {
                requestId,
                clientId
              });
            } else {
              kek = hexToBytes(kekHex);
              masterKeyBytes = await decryptMasterKey(
                encryptedKeyResult.encrypted_master_key,
                encryptedKeyResult.iv,
                kek
              );

              if (masterKeyBytes.length !== 32) {
                console.error('Skipping master key handoff: decrypted key has unexpected length', {
                  requestId,
                  clientId,
                  length: masterKeyBytes.length
                });
                masterKeyBytes.fill(0);
                masterKeyBytes = null;
              }
            }
          }

          if (masterKeyBytes) {
            const handoffPayload = await createMasterKeyHandoff({
              issuer: env.SITE_URL,
              audience: handoffEligibility.audience,
              sub: consumed.code!.user_id,
              nonce: handoffEligibility.nonce,
              receiverPublicKey: handoffEligibility.publicKey,
              masterKey: masterKeyBytes
            });

            response.relay_handoff = {
              mode: handoffEligibility.mode,
              payload: handoffPayload
            };
          }
        } catch (error) {
          console.error('Failed to create master key handoff payload (fail-open):', {
            requestId,
            clientId,
            reason: 'wrapping_error',
            error
          });
          // Don't fail the token exchange, just skip handoff
        } finally {
          if (kek) kek.fill(0);
          if (masterKeyBytes) masterKeyBytes.fill(0);
        }
      } else if (scopes.includes(HANDOFF_SCOPE)) {
        console.warn('Skipping master key handoff payload generation (fail-open):', {
          requestId,
          clientId,
          reason: handoffEligibility.reason
        });
      }

      return NextResponse.json(response);
    } else if (grantType === 'refresh_token') {
      if (!refreshToken) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'missing_refresh_token');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing refresh token' },
          { status: 400 }
        );
      }

      const refreshTokenHash = await hashString(refreshToken);
      const tokenResult = await fetchAuthQuery(api.oauthRefresh.lookup, { tokenHash: refreshTokenHash });

      if (!tokenResult.found) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'token_not_found');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Refresh token not found' },
          { status: 400 }
        );
      }

      if (!tokenResult.valid) {
        if (tokenResult.reason === 'replay_detected') {
          await captureOIDCRefreshReplayDetected(
            requestId,
            clientId,
            tokenResult.token?.user_id ?? '',
            tokenResult.token?.token_family_id ?? ''
          );
        } else {
          await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, tokenResult.reason ?? 'unknown');
        }
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: `Refresh token ${tokenResult.reason}` },
          { status: 400 }
        );
      }

      if (tokenResult.token.client_id !== clientId) {
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'client_mismatch');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'Client ID mismatch' },
          { status: 400 }
        );
      }

      const globalCutoff = await fetchAuthQuery(api.oauthRevocations.getGlobalCutoff, {
        userId: tokenResult.token.user_id
      });

      if (globalCutoff && globalCutoff > tokenResult.token.issued_at) {
        await fetchAuthMutation(api.oauthRefresh.revoke, {
          tokenHash: refreshTokenHash,
          reason: 'global_logout'
        });
        await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'global_revocation');
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: 'User globally logged out' },
          { status: 400 }
        );
      }

      const newRefreshToken = await generateRefreshToken();
      const newRefreshTokenHash = await hashString(newRefreshToken);

      const rotateResult = await fetchAuthMutation(api.oauthRefresh.rotate, {
        oldTokenHash: refreshTokenHash,
        newTokenHash: newRefreshTokenHash,
        clientId,
        scope: tokenResult.token.scope
      });

      if (!rotateResult.success) {
        if (rotateResult.reason === 'replay_detected') {
          await captureOIDCRefreshReplayDetected(
            requestId,
            clientId,
            tokenResult.token.user_id,
            tokenResult.token.token_family_id
          );
        } else {
          await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, rotateResult.reason ?? 'unknown');
        }
        await flushPostHog();
        return NextResponse.json(
          { error: 'invalid_grant', error_description: `Refresh token ${rotateResult.reason}` },
          { status: 400 }
        );
      }

      const env = getEnv();
      const scopes = tokenResult.token.scope.split(' ');
      const includeEmail = scopes.includes('email');
      const includeProfile = scopes.includes('profile');

      const user = await fetchAuthQuery(api.users.getUserProfileById, {
        user_id: tokenResult.token.user_id
      });

      const kid = env.OIDC_JWKS_ACTIVE_KID;
      const accessToken = await signAccessToken(
        env.SITE_URL,
        env.SITE_URL,
        tokenResult.token.user_id,
        tokenResult.token.scope,
        clientId,
        kid
      );

      const authTime = Math.floor(Date.now() / 1000);
      const idToken = await signIDToken(
        env.SITE_URL,
        clientId,
        tokenResult.token.user_id,
        authTime,
        undefined,
        includeEmail ? undefined : undefined,
        includeEmail ? user?.email_verified : undefined,
        includeProfile ? user?.display_name : undefined,
        includeProfile ? user?.avatar_url : undefined,
        kid
      );

      await captureOIDCTokenExchangeSucceeded(requestId, grantType, clientId);
      await flushPostHog();

      return NextResponse.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
        refresh_token: newRefreshToken,
        scope: tokenResult.token.scope
      });
    } else {
      await captureOIDCTokenExchangeFailed(requestId, grantType, clientId, 'unsupported_grant_type');
      await flushPostHog();
      return NextResponse.json(
        { error: 'unsupported_grant_type', error_description: 'Only authorization_code and refresh_token are supported' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Token error:', error);
    await captureOIDCTokenExchangeFailed(requestId, 'unknown', 'unknown', 'internal_error');
    await flushPostHog();
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}
