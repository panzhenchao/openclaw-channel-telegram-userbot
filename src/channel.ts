/**
 * Channel plugin assembly — composes all adapters into the ChannelPlugin object.
 *
 * This is the main export that openclaw's plugin system registers.
 */

import { TelegramUserbotConfigSchema } from "./config-schema.ts";
import {
  listAccountIds,
  resolveAccount,
  defaultAccountId,
  isConfigured,
  describeAccount,
  getChannelConfig,
} from "./config.ts";
import { resolveDmPolicy } from "./access-control.ts";
import { normalizeTarget } from "./session-routing.ts";
import { sendText, sendMedia } from "./send-service.ts";
import { startClient } from "./client-manager.ts";
import { handleNewMessage, handleEditedMessage } from "./inbound-handler.ts";
import { setAccountConfig, deleteAccountConfig } from "./config-store.ts";
import type { TelegramUserbotConfig } from "./types.ts";
import * as clientApi from "./client-api.ts";
import * as profileApi from "./profile-api.ts";

const CHANNEL_ID = "telegram-userbot";

/**
 * Minimal ChannelPlugin shape — replace with openclaw's actual type once available.
 */
interface ChannelPluginShape {
  id: string;
  meta: Record<string, unknown>;
  configSchema: unknown;
  capabilities: Record<string, unknown>;
  reload: Record<string, unknown>;
  config: Record<string, unknown>;
  security: Record<string, unknown>;
  groups: Record<string, unknown>;
  messaging: Record<string, unknown>;
  outbound: Record<string, unknown>;
  gateway: Record<string, unknown>;
  status: Record<string, unknown>;
  api: { client: typeof clientApi; profile: typeof profileApi };
}

/**
 * The complete Telegram Userbot channel plugin object.
 *
 * Follows the openclaw ChannelPlugin adapter pattern
 * (ref: @soimy/openclaw-channel-dingtalk).
 */
export const telegramUserbotPlugin: ChannelPluginShape = {
  id: CHANNEL_ID,

  meta: {
    id: CHANNEL_ID,
    label: "Telegram Userbot",
    selectionLabel: "Telegram Userbot (MTProto)",
    docsPath: "/channels/telegram-userbot",
    blurb:
      "Connect as a Telegram user account (not a bot) via MTProto. " +
      "Supports DMs, groups, forum topics, media, reactions, and read receipts.",
    aliases: ["tg-user", "telegram-client"],
  },

  configSchema: TelegramUserbotConfigSchema,

  capabilities: {
    chatTypes: ["direct", "group"] as const,
    reactions: true,
    threads: true,
    media: true,
    nativeCommands: false,
    blockStreaming: false,
  },

  // On config change, openclaw stops the old account (calling our stop wrapper
  // which clears config-store) then re-calls startAccount with fresh config.
  reload: {
    configPrefixes: [`channels.${CHANNEL_ID}`],
  },

  // ---- Config adapter ----
  config: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listAccountIds: ({ cfg }: { cfg: any }) => {
      const channelCfg = getChannelConfig(cfg);
      return channelCfg ? listAccountIds(channelCfg) : [];
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveAccount: ({ cfg, accountId }: { cfg: any; accountId: string }) => {
      const channelCfg = getChannelConfig(cfg);
      if (!channelCfg) {
        return {
          accountId,
          name: accountId,
          config: {},
          enabled: false,
          configured: false,
        };
      }
      return resolveAccount(channelCfg, accountId);
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    defaultAccountId: ({ cfg }: { cfg: any }) => {
      const channelCfg = getChannelConfig(cfg);
      return channelCfg ? defaultAccountId(channelCfg) : "default";
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isConfigured: ({ cfg }: { cfg: any }) => {
      const channelCfg = getChannelConfig(cfg);
      return channelCfg ? isConfigured(channelCfg) : false;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    describeAccount: ({ account }: { account: any }) => {
      return describeAccount(account);
    },
  },

  // ---- Security adapter ----
  security: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveDmPolicy: ({ account }: { account: any }) => {
      return resolveDmPolicy(account?.config ?? {});
    },
  },

  // ---- Groups adapter ----
  groups: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveRequireMention: ({ account }: { account: any }) => {
      return (account?.config?.groupPolicy ?? "mention") === "mention";
    },
    resolveGroupIntroHint: () => {
      return "Mention me with @username in group chats to get a response.";
    },
  },

  // ---- Messaging adapter ----
  messaging: {
    normalizeTarget: ({ target }: { target: string }) => normalizeTarget(target),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    targetResolver: ({ sessionKey }: { sessionKey: string }) => {
      // Extract the chat target from session key
      return normalizeTarget(sessionKey);
    },
  },

  // ---- Outbound adapter ----
  outbound: {
    deliveryMode: "direct" as const,

    resolveTarget: ({ to }: { to: string }) => normalizeTarget(to),

    sendText: async ({
      to,
      text,
      accountId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account,
      sessionKey,
    }: {
      to: string;
      text: string;
      accountId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account: any;
      sessionKey?: string;
    }) => {
      // Extract topicId from session key pattern :topic:(\d+)$
      let threadId: number | undefined;
      if (sessionKey) {
        const topicMatch = sessionKey.match(/:topic:(\d+)$/);
        if (topicMatch) {
          threadId = Number(topicMatch[1]);
        }
      }
      await sendText(accountId, to, text, {
        autoDisclosure: account?.config?.autoDisclosure,
        threadId,
      });
    },

    sendMedia: async ({
      to,
      filePath,
      accountId,
      asVoice,
      sessionKey,
    }: {
      to: string;
      filePath: string;
      accountId: string;
      asVoice?: boolean;
      sessionKey?: string;
    }) => {
      // Extract topicId from session key pattern :topic:(\d+)$
      let threadId: number | undefined;
      if (sessionKey) {
        const topicMatch = sessionKey.match(/:topic:(\d+)$/);
        if (topicMatch) {
          threadId = Number(topicMatch[1]);
        }
      }
      await sendMedia(accountId, to, filePath, { asVoice, threadId });
    },
  },

  // ---- Gateway adapter ----
  gateway: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startAccount: async (ctx: any) => {
      const { accountId, account, log } = ctx;
      const config = account?.config as TelegramUserbotConfig;

      if (!config?.apiId || !config?.apiHash) {
        throw new Error(
          "Telegram Userbot: apiId and apiHash are required. " +
          "Get them from https://my.telegram.org",
        );
      }

      // Store config for inbound handler to access
      setAccountConfig(accountId, config);

      const logger = log?.info?.bind(log) ?? console.log;

      const { stop, sessionString } = await startClient(
        accountId,
        config,
        handleNewMessage,
        handleEditedMessage,
        logger,
      );

      // Log session string for persistence
      if (sessionString && !config.sessionString) {
        logger(
          `[telegram-userbot] Session string for persistence (add to config):\n${sessionString}`,
        );
      }

      return {
        stop: async () => {
          deleteAccountConfig(accountId);
          await stop();
        },
      };
    },
  },

  // ---- Status adapter ----
  status: {
    defaultRuntime: {
      accountId: "default",
      running: false,
      lastEventAt: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    probeAccount: async ({ account }: { account: any }) => {
      if (!account?.config?.apiId || !account?.config?.apiHash) {
        return { ok: false, error: "Missing apiId or apiHash" };
      }
      if (!account?.config?.sessionString && !account?.config?.phone) {
        return {
          ok: false,
          error: "No sessionString or phone configured for authentication",
        };
      }
      return { ok: true, details: { apiId: account.config.apiId } };
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    buildAccountSnapshot: ({ account, runtime, probe }: any) => ({
      accountId: account?.accountId,
      name: account?.name,
      enabled: account?.enabled,
      configured: account?.configured,
      apiId: account?.config?.apiId,
      running: runtime?.running ?? false,
      lastError: runtime?.lastError ?? null,
      probe,
    }),
  },

  // ---- Extended APIs ----
  api: {
    client: clientApi,
    profile: profileApi,
  },
};
