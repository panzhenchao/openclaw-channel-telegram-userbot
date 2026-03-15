/**
 * GramJS client lifecycle management.
 *
 * Handles:
 * - Client creation with proxy configuration
 * - Authentication via auth.ts
 * - Health check loop with auto-reconnect
 * - Event handler registration
 * - Graceful disconnect
 */

import { TelegramClient } from "telegram";
import { NewMessage } from "telegram/events/index.js";
import { EditedMessage } from "telegram/events/EditedMessage.js";
import { Api } from "telegram/tl/index.js";
import type { TelegramUserbotAccountConfig, ActiveClient, GramJSProxy } from "./types.ts";
import { authenticateClient, exportSessionString } from "./auth.ts";
import { parseProxyUrl } from "./proxy-utils.ts";

/** Connected clients keyed by accountId. */
const activeClients = new Map<string, ActiveClient>();

export function getActiveClient(accountId: string): ActiveClient | undefined {
  return activeClients.get(accountId);
}

export function getAllActiveClients(): Map<string, ActiveClient> {
  return activeClients;
}

/**
 * Start a GramJS client for the given account config.
 *
 * Authenticates, fetches own identity, registers event handlers,
 * and starts a health check loop.
 *
 * Returns a stop() function to tear down the client.
 */
export async function startClient(
  accountId: string,
  config: TelegramUserbotAccountConfig,
  onNewMessage: (client: ActiveClient, event: unknown) => Promise<void>,
  onMessageEdited?: (client: ActiveClient, event: unknown) => Promise<void>,
  log?: (...args: unknown[]) => void,
): Promise<{ stop: () => Promise<void>; sessionString: string }> {
  const logger = log ?? console.log;

  const proxy: GramJSProxy | undefined = parseProxyUrl(config.proxy);
  const client = await authenticateClient(config, proxy, logger);

  // Get own identity
  const me = await client.getMe();
  const meId = Number(me.id);
  const meUsername: string | null =
    (me as unknown as { username?: string }).username ?? null;

  logger(
    `[telegram-userbot] Connected as ${meUsername || me.firstName} (ID: ${meId})`,
  );

  const activeClient: ActiveClient = {
    accountId,
    client,
    meId,
    meUsername,
    startTime: Date.now() / 1000,
    typingTasks: new Map(),
    mediaGroupBuffers: new Map(),
    mediaGroupTimers: new Map(),
    messageThreads: new Map(),
    sentMessages: new Map(),
  };

  activeClients.set(accountId, activeClient);

  // Register event handlers
  client.addEventHandler(
    (event: unknown) => onNewMessage(activeClient, event),
    new NewMessage({}),
  );

  if (onMessageEdited) {
    client.addEventHandler(
      (event: unknown) => onMessageEdited(activeClient, event),
      new EditedMessage({}),
    );
  }

  // CallbackQuery handler — auto-answer inline button presses
  client.addEventHandler(async (update: unknown) => {
    if (update && typeof update === "object" && "query" in update) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bqUpdate = update as { query?: { queryId?: any } };
        if (bqUpdate.query?.queryId) {
          await client.invoke(
            new Api.messages.SetBotCallbackAnswer({
              queryId: bqUpdate.query.queryId,
            }),
          );
        }
      } catch {
        // Non-critical
      }
    }
  });

  // Export session string for persistence
  const sessionString = exportSessionString(client);

  // Health check loop
  let running = true;
  const healthCheck = async () => {
    while (running) {
      await new Promise((r) => setTimeout(r, 5000));
      if (!running) break;

      try {
        if (!client.connected) {
          logger("[telegram-userbot] Connection lost, reconnecting...");
          await client.connect();
          const authorized = await client
            .getMe()
            .then(() => true)
            .catch(() => false);
          if (authorized) {
            logger("[telegram-userbot] Reconnected successfully");
          } else {
            logger("[telegram-userbot] Session expired during reconnect");
            running = false;
          }
        }
      } catch (err) {
        logger(`[telegram-userbot] Health check error: ${err}`);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  };

  // Start health check in background
  const healthCheckPromise = healthCheck();

  // Return stop function
  const stop = async () => {
    running = false;

    // Cancel all typing tasks
    for (const timer of activeClient.typingTasks.values()) {
      clearInterval(timer);
    }
    activeClient.typingTasks.clear();

    // Cancel all media group timers
    for (const timer of activeClient.mediaGroupTimers.values()) {
      clearTimeout(timer);
    }
    activeClient.mediaGroupTimers.clear();
    activeClient.mediaGroupBuffers.clear();

    activeClients.delete(accountId);

    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // Wait for health check to finish
    await healthCheckPromise.catch(() => {});

    logger("[telegram-userbot] Client disconnected");
  };

  return { stop, sessionString };
}
