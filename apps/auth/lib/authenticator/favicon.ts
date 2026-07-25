export function getFaviconUrl(site: string | null | undefined, size = 64): string | null {
  if (!site) return null
  const domain = site.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim()
  if (!domain) return null
  return `https://favicon.vemetric.com/${encodeURIComponent(domain)}?size=${size}`
}
