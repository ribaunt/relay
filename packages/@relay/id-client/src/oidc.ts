import type { OIDCTokenResponse } from "./types";

export async function exchangeAuthorizationCode(
  baseUrl: string,
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OIDCTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const res = await fetch(`${baseUrl}/api/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!res.ok) {
    throw new Error("Token exchange failed");
  }

  return res.json();
}

export async function refreshAccessToken(
  baseUrl: string,
  clientId: string,
  refreshToken: string
): Promise<OIDCTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken
  });

  const res = await fetch(`${baseUrl}/api/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  if (!res.ok) {
    throw new Error("Token refresh failed");
  }

  return res.json();
}

export async function revokeToken(
  baseUrl: string,
  refreshToken: string
): Promise<void> {
  await fetch(`${baseUrl}/api/oidc/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: refreshToken, token_type_hint: "refresh_token" })
  });
}