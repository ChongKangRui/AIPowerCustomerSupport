/**
 * Always returns a same-origin path. Returns "/" for anything else.
 *
 * `callbackUrl` starts out safe: proxy.ts sets it from the request's own
 * pathname. By the time the code reads it back from a query string, it is
 * just ordinary user-controlled input. An attacker could send a link like
 * "/login?callbackUrl=https://evil.example" to redirect a victim off-site
 * right after a successful login.
 *
 * Use this function everywhere callbackUrl becomes an actual redirect.
 */
export function safeRedirectTarget(value: string | string[] | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}
