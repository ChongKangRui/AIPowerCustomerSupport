/**
 * Only ever returns a same-origin path, defaulting to "/" for anything else.
 *
 * `callbackUrl` starts out safe (proxy.ts sets it from the request's own
 * pathname), but by the time it's read back out of a query string it's just
 * ordinary user-controlled input — e.g. someone could send a victim a link
 * like "/login?callbackUrl=https://evil.example" to redirect them off-site
 * right after a successful login. Guard against that everywhere callbackUrl
 * is turned into an actual redirect.
 */
export function safeRedirectTarget(value: string | string[] | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
