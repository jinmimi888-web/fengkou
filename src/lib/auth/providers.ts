/**
 * Native Better Auth social providers (Google + X/Twitter).
 *
 * Source of truth for BOTH the server (`server.ts` → `socialProviders`) and the
 * client (sign-in buttons). Kept dependency-free so the client can import it
 * without pulling server-only Better Auth / `pg` into the browser bundle.
 *
 * Visibility is baked at build/dev-server start from GOOGLE_ and TWITTER_ env
 * pairs (see `vite.config.ts` `__AUTH_HAS_GOOGLE__` / `__AUTH_HAS_TWITTER__` defines). Secrets never ship to
 * the client — only booleans.
 */
export type SocialProviderId = "google" | "twitter";

export type SocialProvider = {
  /** Better Auth social provider id (`twitter` = X). */
  id: SocialProviderId;
  /** Human label for the sign-in button. */
  label: string;
};


function hasGoogle(): boolean {
  if (typeof __AUTH_HAS_GOOGLE__ === "boolean") return __AUTH_HAS_GOOGLE__;
  // Fallback when defines are absent (e.g. unit tests importing this module).
  if (typeof process !== "undefined") {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim(),
    );
  }
  return false;
}

function hasTwitter(): boolean {
  if (typeof __AUTH_HAS_TWITTER__ === "boolean") return __AUTH_HAS_TWITTER__;
  if (typeof process !== "undefined") {
    return Boolean(
      process.env.TWITTER_CLIENT_ID?.trim() &&
        process.env.TWITTER_CLIENT_SECRET?.trim(),
    );
  }
  return false;
}

/** Social providers that are configured and should appear in the UI. */
export const SOCIAL_PROVIDERS: readonly SocialProvider[] = [
  ...(hasGoogle() ? [{ id: "google" as const, label: "Google" }] : []),
  ...(hasTwitter() ? [{ id: "twitter" as const, label: "X" }] : []),
];
