/**
 * GramJS authentication strategies.
 *
 * Three modes:
 * 1. StringSession — config provides a pre-authenticated session string
 * 2. Phone + verification code — interactive console-based auth
 * 3. QR code — scan from another Telegram device
 *
 * After successful auth, the session string is exported for persistence.
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import type { TelegramUserbotAccountConfig, GramJSProxy } from "./types.ts";

/**
 * Create and authenticate a GramJS TelegramClient.
 *
 * Returns the connected, authenticated client.
 * Throws on auth failure.
 */
export async function authenticateClient(
  config: TelegramUserbotAccountConfig,
  proxy?: GramJSProxy,
  log?: (...args: unknown[]) => void,
): Promise<TelegramClient> {
  const logger = log ?? console.log;
  const session = new StringSession(config.sessionString || "");

  const client = new TelegramClient(session, config.apiId, config.apiHash, {
    connectionRetries: 5,
    retryDelay: 1000,
    floodSleepThreshold: 60,
    ...(proxy ? { proxy } : {}),
  });

  await client.connect();

  // If session is pre-authenticated, verify it
  if (config.sessionString) {
    try {
      await client.getMe();
      logger("[telegram-userbot] Authenticated via StringSession");
      return client;
    } catch (err: unknown) {
      const errStr = String(err);
      if (errStr.includes("AUTH_KEY_UNREGISTERED") || errStr.includes("SESSION_REVOKED")) {
        logger("[telegram-userbot] Session expired, need re-authentication");
      } else {
        throw err;
      }
    }
  }

  // If sessionString was provided but expired, and no phone is configured,
  // do NOT silently fall through to QR auth (would hang on headless servers).
  if (config.sessionString && !config.phone) {
    throw new Error(
      "Telegram Userbot: sessionString expired/revoked and no phone number configured. " +
      "Please re-authenticate and update your sessionString, or configure a phone number.",
    );
  }

  // Interactive authentication with phone number
  if (config.phone) {
    logger(`[telegram-userbot] Starting phone auth for ${config.phone}...`);
    await client.start({
      phoneNumber: async () => config.phone!,
      phoneCode: async () => {
        // Dynamic import for interactive input
        const { default: input } = await import("input");
        return await input.text(`Enter the code sent to ${config.phone}: `);
      },
      password: async () => {
        const { default: input } = await import("input");
        return await input.text("Enter your 2FA password: ");
      },
      onError: (err: Error) => {
        logger(`[telegram-userbot] Auth error: ${err.message}`);
        throw err;
      },
    });
    logger("[telegram-userbot] Authenticated via phone number");
    return client;
  }

  // QR code authentication
  logger("[telegram-userbot] Starting QR code authentication...");
  logger("[telegram-userbot] Open Telegram on your phone → Settings → Devices → Link Desktop Device");

  const user = await client.signInUserWithQrCode(
    { apiId: config.apiId, apiHash: config.apiHash },
    {
      qrCode: async (code) => {
        const qrUrl = `tg://login?token=${code.token.toString("base64url")}`;
        logger(`\n[telegram-userbot] Scan this QR code with Telegram:`);
        logger(`Link: ${qrUrl}`);
        logger("(Or use a QR code generator with the link above)\n");
      },
      password: async () => {
        const { default: input } = await import("input");
        return await input.text("Enter your 2FA password: ");
      },
      onError: (err: Error) => {
        // Non-fatal: QR code expired, will retry automatically
        if (String(err).includes("FRESH_RESET_AUTHORISATION_FORBIDDEN")) {
          throw err;
        }
        logger(`[telegram-userbot] QR auth retry: ${err.message}`);
      },
    },
  );

  logger(`[telegram-userbot] QR auth successful for user ${user?.id}`);
  return client;
}

/**
 * Export the current session as a StringSession for persistence.
 */
export function exportSessionString(client: TelegramClient): string {
  return (client.session as StringSession).save();
}
