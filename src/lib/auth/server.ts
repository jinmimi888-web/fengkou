/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * The app runs its own Better Auth at `/api/auth/*`, so the session cookie stays
 * on this app's own origin. Social sign-in uses native Better Auth
 * socialProviders (Google + X/Twitter) from env — no Grok auth broker.
 *
 * Tri-mode:
 *   - Deployed: set BETTER_AUTH_URL, BETTER_AUTH_SECRET, DATABASE_URL, and
 *     optional GOOGLE_* / TWITTER_* OAuth pairs.
 *   - Sandbox live preview: dynamic *.grok-sandbox.com baseURL from the
 *     request; sessions in embedded PGLite. Live-preview iframe clients use a
 *     bearer token (partitioned cookies) — see client.ts.
 *   - Off (VITE_AUTH_ENABLED=false): no real auth enforcement; requireUserId
 *     resolves a dev user when no database is configured (see verify.server.ts).
 *
 * NEVER import this from client code — it pulls in pg + server-only Better Auth
 * internals. The client uses @/lib/auth/client; components read the user via
 * @/lib/auth/use-current-user; server functions get a verified id via
 * @/lib/auth/middleware.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "./gate-session.server";
import { pgliteDialect } from "./pglite-dialect";
import { PREVIEW_ALLOWED_HOSTS } from "./preview";

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const authDisabled = env("VITE_AUTH_ENABLED") === "false";

const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");
const twitterClientId = env("TWITTER_CLIENT_ID");
const twitterClientSecret = env("TWITTER_CLIENT_SECRET");

const googleConfigured = Boolean(googleClientId && googleClientSecret);
const twitterConfigured = Boolean(twitterClientId && twitterClientSecret);

/** True when real auth is enforced — no Grok broker required. */
export const authConfigured = !authDisabled;

const explicitBaseURL = env("BETTER_AUTH_URL");
const previewAllowedHosts: string[] = [...PREVIEW_ALLOWED_HOSTS];
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
const baseURL = explicitBaseURL ?? {
  allowedHosts: [...previewAllowedHosts, "localhost", "127.0.0.1", "[::1]"],
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

const trustedOrigins: string[] = explicitBaseURL
  ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
  : [
      ...previewAllowedHosts,
      ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
      ...LOCAL_DEV_ORIGINS,
    ];

const databaseUrl = env("DATABASE_URL");

const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

const trustedSocialProviders = [
  ...(googleConfigured ? (["google"] as const) : []),
  ...(twitterConfigured ? (["twitter"] as const) : []),
];

export const auth = betterAuth({
  baseURL,
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,
  trustedOrigins,
  socialProviders: {
    ...(googleConfigured
      ? {
          google: {
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
          },
        }
      : {}),
    ...(twitterConfigured
      ? {
          twitter: {
            clientId: twitterClientId as string,
            clientSecret: twitterClientSecret as string,
          },
        }
      : {}),
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: [...trustedSocialProviders, GATE_PROVIDER_ID],
      requireLocalEmailVerified: false,
    },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),
  advanced: {
    useSecureCookies: false,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },
  plugins: [
    gateIdentitySessions(),
    bearer(),
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

export { SOCIAL_PROVIDERS } from "./providers";
