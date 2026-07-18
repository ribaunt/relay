type SessionCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict';
  maxAge: number;
  path: string;
  domain?: string;
};

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getSharedCookieDomain(): string | undefined {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) return undefined;

  try {
    const { hostname } = new URL(siteUrl);
    if (hostname.endsWith('.relay.re') || hostname === 'relay.re') {
      return '.relay.re';
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getSessionCookieOptions(): SessionCookieOptions {
  const domain = getSharedCookieDomain();

  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    ...(domain ? { domain } : {})
  };
}
