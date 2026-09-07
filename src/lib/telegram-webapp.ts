/**
 * Telegram Mini App (WebApp) shell helpers.
 * No bot token / Login Widget — entry readiness only. No-op outside Telegram.
 */

export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  viewportStableHeight?: number;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string | undefined>;
  initData?: string;
  platform?: string;
  version?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const LIGHT_BG = "#f2f3f7";
const DARK_BG = "#0c0c0a";

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * True when running inside a Telegram client Mini App.
 * The official script still defines `Telegram.WebApp` in normal browsers
 * (platform "unknown", empty initData) — treat that as not-in-Telegram.
 */
export function isTelegramMiniApp(): boolean {
  const wa = getTelegramWebApp();
  if (!wa) return false;
  if (wa.initData) return true;
  const platform = wa.platform;
  return Boolean(platform && platform !== "unknown");
}

/**
 * Call WebApp.ready / expand / theme colors and mark html/body with `tg-miniapp`.
 * Retries briefly if the official script is still loading. Returns a cleanup.
 * No-op in regular browsers.
 */
export function initTelegramMiniApp(): () => void {
  if (typeof window === "undefined") return () => {};

  const apply = (): boolean => {
    const wa = getTelegramWebApp();
    // Script not loaded yet — keep retrying.
    if (!wa) return false;
    // Script loaded but not inside Telegram — stop retrying (true = done).
    if (!isTelegramMiniApp()) return true;

    try {
      wa.ready();
      wa.expand();

      const dark = document.documentElement.classList.contains("dark");
      const bg = dark ? DARK_BG : LIGHT_BG;
      try {
        wa.setHeaderColor?.(bg);
      } catch {
        /* older clients */
      }
      try {
        wa.setBackgroundColor?.(bg);
      } catch {
        /* older clients */
      }

      document.documentElement.classList.add("tg-miniapp");
      document.body.classList.add("tg-miniapp");
    } catch {
      /* ignore — keep browsing normally */
    }
    return true;
  };

  if (apply()) return () => {};

  let tries = 0;
  const id = window.setInterval(() => {
    tries += 1;
    if (apply() || tries > 40) window.clearInterval(id);
  }, 50);

  return () => window.clearInterval(id);
}
