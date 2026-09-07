/**
 * Live-preview host allowlist (server-only — NEVER import from the client).
 *
 * Sandbox live previews run on dynamic `https://*.grok-sandbox.com` hosts.
 * Better Auth derives the origin from the request and validates it against
 * this list (wildcard-matched) when `BETTER_AUTH_URL` is not set.
 *
 * Social OAuth no longer uses the Grok auth broker preview client; Google/X
 * credentials come from `GOOGLE_*` / `TWITTER_*` env vars on the app itself.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
