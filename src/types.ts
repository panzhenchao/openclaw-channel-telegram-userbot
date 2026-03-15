/**
 * Core TypeScript interfaces for the Telegram Userbot channel plugin.
 */

/** Telegram Userbot channel configuration (per-account). */
export interface TelegramUserbotAccountConfig {
  /** Display name for this account. */
  name?: string;
  /** Whether this account is enabled. */
  enabled?: boolean;
  /** Telegram API ID from https://my.telegram.org */
  apiId: number;
  /** Telegram API hash from https://my.telegram.org */
  apiHash: string;
  /** Pre-authenticated GramJS StringSession. */
  sessionString?: string;
  /** Phone number for interactive auth (e.g. "+8613800138000"). */
  phone?: string;
  /** Proxy URL: socks5://host:port, http://host:port, etc. */
  proxy?: string;
  /** Allowed sender IDs/usernames. ["*"] = allow all. */
  allowFrom?: string[];
  /** Group message policy: "open" = respond to all, "mention" = only when @mentioned. */
  groupPolicy?: "open" | "mention";
  /** Whether to reply to the original message (quote). */
  replyToMessage?: boolean;
  /** React to incoming messages with this emoji (e.g. "👀"). Empty = disabled. */
  reactionEmoji?: string;
  /** Text appended to every outbound message (e.g. "[AI]"). */
  autoDisclosure?: string;
  /** DM policy: "open" = accept all DMs, "allowlist" = only allowFrom. */
  dmPolicy?: "open" | "allowlist";
}

/** Top-level channel config (supports multi-account via `accounts` record). */
export interface TelegramUserbotConfig extends TelegramUserbotAccountConfig {
  /** Per-account overrides keyed by account ID. */
  accounts?: Record<string, Partial<TelegramUserbotAccountConfig>>;
}

/** Resolved account with merged defaults + account-specific overrides. */
export interface ResolvedAccount {
  accountId: string;
  name: string;
  config: TelegramUserbotAccountConfig;
  enabled: boolean;
  configured: boolean;
}

/** GramJS SOCKS proxy configuration object. */
export interface GramJSProxy {
  ip: string;
  port: number;
  socksType: 4 | 5;
  timeout?: number;
  username?: string;
  password?: string;
}

/** Media type detection result. */
export type MediaType = "photo" | "voice" | "audio" | "video" | "document" | "sticker" | "animation";

/** Inbound message envelope passed to openclaw dispatch. */
export interface InboundEnvelope {
  channelId: string;
  accountId: string;
  senderId: string;
  senderName: string;
  sessionKey: string;
  content: string;
  media?: string[];
  metadata: Record<string, unknown>;
  isGroup: boolean;
}

/** Active client state tracked per account. */
export interface ActiveClient {
  accountId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any; // TelegramClient instance
  meId: number;
  meUsername: string | null;
  startTime: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typingTasks: Map<string, any>;
  mediaGroupBuffers: Map<string, MediaGroupBuffer>;
  mediaGroupTimers: Map<string, ReturnType<typeof setTimeout>>;
  /** Cache of chatId:messageId → topicId for forum thread routing. */
  messageThreads: Map<string, number>;
  /** Sent message IDs per chat for tracking. */
  sentMessages: Map<string, number[]>;
}

/** Buffer for media group messages. */
export interface MediaGroupBuffer {
  senderId: string;
  senderName: string;
  chatId: string;
  contents: string[];
  media: string[];
  metadata: Record<string, unknown>;
  sessionKey: string;
}
