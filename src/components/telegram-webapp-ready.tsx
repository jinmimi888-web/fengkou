/**
 * Mount once in `__root.tsx`. Initializes Telegram WebApp when present; no-op elsewhere.
 */

import { useEffect } from "react";
import { initTelegramMiniApp } from "@/lib/telegram-webapp";

export function TelegramWebAppReady() {
  useEffect(() => initTelegramMiniApp(), []);
  return null;
}
