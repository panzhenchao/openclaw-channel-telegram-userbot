/**
 * Inbound message handler pipeline.
 *
 * Processes incoming GramJS events and dispatches to openclaw:
 *
 * 1. Filter own messages
 * 2. Discard stale messages (>60s at startup)
 * 3. Check allowlist
 * 4. Check group policy (mention detection)
 * 5. Send emoji reaction (if configured)
 * 6. Download media
 * 7. Extract reply context
 * 8. Handle media groups (600ms buffer)
 * 9. Mark as read
 * 10. Build envelope → dispatch via openclaw runtime
 */

import { Api } from "telegram/tl/index.js";
import type { ActiveClient, InboundEnvelope, MediaGroupBuffer } from "./types.ts";
import { isAllowed, buildSenderId } from "./access-control.ts";
import { isMessageForMe } from "./mention-detection.ts";
import { deriveSessionKey } from "./session-routing.ts";
import { downloadMessageMedia } from "./media-utils.ts";
import { TELEGRAM_REPLY_CONTEXT_MAX_LEN } from "./message-utils.ts";
import { getTelegramRuntime } from "./runtime.ts";
import { getAccountConfig } from "./config-store.ts";
import { startTyping } from "./send-service.ts";

/** Messages older than this (seconds) at startup are stale. */
const STALE_MESSAGE_THRESHOLD = 60;
/** Media group buffering delay in ms. */
const MEDIA_GROUP_DELAY_MS = 600;
/** Max entries in the message thread cache per client. */
const THREAD_CACHE_CAP = 500;

/**
 * Main inbound message handler — registered on GramJS NewMessage event.
 */
export async function handleNewMessage(
  activeClient: ActiveClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
): Promise<void> {
  const message: Api.Message = event.message;
  if (!message) return;

  const client = activeClient.client;
  const config = getAccountConfig(activeClient.accountId);
  if (!config) return;

  // 1. Skip own messages
  const rawSenderId = message.senderId || (message.fromId as Api.PeerUser)?.userId;
  const senderId = Number(rawSenderId);
  if (!rawSenderId || !Number.isFinite(senderId) || senderId === 0) return;
  if (senderId === activeClient.meId) return;

  // 2. Discard stale messages
  if (message.date) {
    const msgTimestamp = message.date;
    if (msgTimestamp < activeClient.startTime - STALE_MESSAGE_THRESHOLD) return;
  }

  // Get sender info — prefer event's cached sender to avoid extra RPC call
  let senderUsername: string | null = null;
  let firstName: string | null = null;
  try {
    // GramJS events often carry the sender entity already resolved
    const sender = event._sender ?? event.sender;
    if (sender) {
      senderUsername = (sender as unknown as { username?: string }).username ?? null;
      firstName = (sender as unknown as { firstName?: string }).firstName ?? null;
    } else {
      // Fallback: fetch from cache/network (GramJS caches internally)
      const entity = await client.getEntity(senderId);
      senderUsername = (entity as unknown as { username?: string }).username ?? null;
      firstName = (entity as unknown as { firstName?: string }).firstName ?? null;
    }
  } catch {
    // Ignore — proceed without username
  }

  const senderIdStr = buildSenderId(senderId, senderUsername);
  const chatId = String(message.chatId || message.peerId);

  // 3. Check allowlist
  if (!isAllowed(config, senderIdStr)) return;

  // 4. Check group policy (mention detection)
  const forMe = await isMessageForMe(
    message,
    config,
    activeClient.meUsername,
    activeClient.meId,
    client,
  );
  if (!forMe) return;

  // 5. Handle built-in commands locally
  if (handleBuiltinCommand(activeClient, message)) return;

  // 6. Send emoji reaction + start typing indicator
  await reactToMessage(activeClient, message, config.reactionEmoji);
  startTyping(activeClient.accountId, chatId);

  // Build content
  const contentParts: string[] = [];
  const mediaPaths: string[] = [];
  const rawText = message.text || "";

  if (rawText) contentParts.push(rawText);

  // 6. Download media
  if (message.media) {
    const { paths, parts } = await downloadMessageMedia(client, message);
    mediaPaths.push(...paths);
    contentParts.push(...parts);
  }

  // 7. Extract reply context
  const replyToMsgId = (message.replyTo as unknown as { replyToMsgId?: number })?.replyToMsgId;
  if (message.replyTo && replyToMsgId !== undefined) {
    try {
      const replyMsgs = await client.getMessages(message.peerId, {
        ids: [replyToMsgId],
      });
      const replyMsg = replyMsgs?.[0];
      if (replyMsg) {
        const replyText = replyMsg.text || "";
        if (replyText) {
          const truncated =
            replyText.length > TELEGRAM_REPLY_CONTEXT_MAX_LEN
              ? replyText.slice(0, TELEGRAM_REPLY_CONTEXT_MAX_LEN) + "..."
              : replyText;
          contentParts.unshift(`[Reply to: ${truncated}]`);
        }

        // Download reply media too
        if (replyMsg.media) {
          const { paths: replyPaths, parts: replyParts } =
            await downloadMessageMedia(client, replyMsg);
          if (replyPaths.length > 0) {
            mediaPaths.unshift(...replyPaths);
          }
          if (replyParts.length > 0 && !replyText) {
            contentParts.unshift(`[Reply to: ${replyParts[0]}]`);
          }
        }
      }
    } catch {
      // Non-critical — ignore reply lookup failures
    }
  }

  // Session key
  const sessionKey = deriveSessionKey(message);

  // Build metadata
  const metadata = buildMetadata(message, senderId, senderUsername, firstName);

  // Cache thread ID for forum topic routing
  cacheMessageThread(activeClient, chatId, message);

  // Transcription hook: if voice/audio, attempt transcription
  if (message.media && (message.voice || message.audio)) {
    try {
      const rt = getTelegramRuntime();
      if (rt?.services?.transcribe) {
        if (mediaPaths.length > 0) {
          const transcription = await rt.services.transcribe(mediaPaths[0]);
          if (transcription) {
            contentParts.push(`[Transcription: ${transcription}]`);
          }
        }
      }
    } catch {
      // Non-critical — silently ignore transcription failures
    }
  }

  // 8. Handle media groups (buffer multiple media messages)
  const isGroup = !message.isPrivate;
  const groupedId = (message as unknown as { groupedId?: bigint }).groupedId;
  if (groupedId) {
    const key = `${chatId}:${groupedId}`;
    handleMediaGroup(activeClient, key, {
      senderId: senderIdStr,
      senderName: firstName || senderUsername || String(senderId),
      chatId,
      contents: contentParts.filter((c) => c !== "[empty message]"),
      media: [...mediaPaths],
      metadata,
      sessionKey,
    }, isGroup);
    return;
  }

  // 9. Mark as read
  try {
    await client.markAsRead(message.peerId);
  } catch {
    // Non-critical
  }

  // 10. Dispatch to openclaw
  const content = contentParts.length > 0 ? contentParts.join("\n") : "[empty message]";

  const envelope: InboundEnvelope = {
    channelId: "telegram-userbot",
    accountId: activeClient.accountId,
    senderId: senderIdStr,
    senderName: firstName || senderUsername || String(senderId),
    sessionKey,
    content,
    media: mediaPaths.length > 0 ? mediaPaths : undefined,
    metadata,
    isGroup,
  };

  await dispatchToOpenclaw(envelope);
}

/**
 * Buffer media group messages, flush after delay.
 */
function handleMediaGroup(
  activeClient: ActiveClient,
  key: string,
  data: MediaGroupBuffer,
  isGroup: boolean,
): void {
  const existing = activeClient.mediaGroupBuffers.get(key);
  if (existing) {
    existing.contents.push(...data.contents);
    existing.media.push(...data.media);
  } else {
    activeClient.mediaGroupBuffers.set(key, { ...data });
  }

  // Reset timer
  const existingTimer = activeClient.mediaGroupTimers.get(key);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(async () => {
    activeClient.mediaGroupTimers.delete(key);
    const buf = activeClient.mediaGroupBuffers.get(key);
    activeClient.mediaGroupBuffers.delete(key);

    if (!buf) return;

    const content = buf.contents.length > 0 ? buf.contents.join("\n") : "[empty message]";
    const uniqueMedia = [...new Set(buf.media)];

    const envelope: InboundEnvelope = {
      channelId: "telegram-userbot",
      accountId: activeClient.accountId,
      senderId: buf.senderId,
      senderName: buf.senderName,
      sessionKey: buf.sessionKey,
      content,
      media: uniqueMedia.length > 0 ? uniqueMedia : undefined,
      metadata: buf.metadata,
      isGroup,
    };

    await dispatchToOpenclaw(envelope);
  }, MEDIA_GROUP_DELAY_MS);

  activeClient.mediaGroupTimers.set(key, timer);
}

/**
 * Send emoji reaction to a message if configured.
 */
async function reactToMessage(
  activeClient: ActiveClient,
  message: Api.Message,
  emoji: string | undefined,
): Promise<void> {
  if (!emoji) return;

  try {
    await activeClient.client.invoke(
      new Api.messages.SendReaction({
        peer: message.peerId!,
        msgId: message.id,
        reaction: [new Api.ReactionEmoji({ emoticon: emoji })],
      }),
    );
  } catch {
    // Non-critical — ignore reaction failures
  }
}

/**
 * Build message metadata dict.
 */
function buildMetadata(
  message: Api.Message,
  senderId: number,
  senderUsername: string | null,
  firstName?: string | null,
): Record<string, unknown> {
  const replyTo = message.replyTo as unknown as {
    replyToMsgId?: number;
    replyToTopId?: number;
    forumTopic?: boolean;
  } | undefined;

  return {
    message_id: message.id,
    user_id: senderId,
    username: senderUsername,
    first_name: firstName ?? null,
    is_group: !message.isPrivate,
    message_thread_id: replyTo?.replyToTopId ?? null,
    is_forum: Boolean(replyTo?.forumTopic),
    reply_to_message_id: replyTo?.replyToMsgId ?? null,
  };
}

/**
 * Cache message thread ID for forum topic routing.
 */
function cacheMessageThread(
  activeClient: ActiveClient,
  chatId: string,
  message: Api.Message,
): void {
  const replyTo = message.replyTo as unknown as {
    replyToTopId?: number;
    forumTopic?: boolean;
  } | undefined;

  const topicId = replyTo?.replyToTopId;
  if (!topicId) return;

  const cache = activeClient.messageThreads;
  const key = `${chatId}:${message.id}`;
  cache.set(key, topicId);

  // Evict oldest entries if over cap
  if (cache.size > THREAD_CACHE_CAP) {
    const it = cache.keys();
    const oldest = it.next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Handle built-in commands (/start, /help) locally without dispatching.
 * Returns true if handled.
 */
function handleBuiltinCommand(
  activeClient: ActiveClient,
  message: Api.Message,
): boolean {
  const text = (message.text || "").trim();
  if (!text.startsWith("/")) return false;

  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\S+$/, "");

  if (cmd === "/start" || cmd === "/help") {
    const name = activeClient.meUsername
      ? `@${activeClient.meUsername}`
      : `User ${activeClient.meId}`;
    const helpText = `Hi! I'm ${name}, an openclaw-powered Telegram userbot. Just send me a message to get started.`;

    activeClient.client
      .sendMessage(message.peerId, {
        message: helpText,
        replyTo: message.id,
      })
      .catch(() => {
        // Non-critical
      });
    return true;
  }

  return false;
}

/**
 * Handle edited messages — treat as new message with [edited] prefix.
 */
export async function handleEditedMessage(
  activeClient: ActiveClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
): Promise<void> {
  const message: Api.Message = event.message;
  if (!message) return;

  const client = activeClient.client;
  const config = getAccountConfig(activeClient.accountId);
  if (!config) return;

  const rawSenderId = message.senderId || (message.fromId as Api.PeerUser)?.userId;
  const senderId = Number(rawSenderId);
  if (!rawSenderId || !Number.isFinite(senderId) || senderId === 0) return;
  if (senderId === activeClient.meId) return;

  const rawText = message.text || "";
  if (!rawText) return; // Only handle text edits

  // Check group policy
  const forMe = await isMessageForMe(
    message,
    config,
    activeClient.meUsername,
    activeClient.meId,
    client,
  );
  if (!forMe) return;

  let senderUsername: string | null = null;
  let firstName: string | null = null;
  try {
    const sender = event._sender ?? event.sender;
    if (sender) {
      senderUsername = (sender as unknown as { username?: string }).username ?? null;
      firstName = (sender as unknown as { firstName?: string }).firstName ?? null;
    }
  } catch {
    // Ignore
  }

  const senderIdStr = buildSenderId(senderId, senderUsername);
  const chatId = String(message.chatId || message.peerId);

  if (!isAllowed(config, senderIdStr)) return;

  const sessionKey = deriveSessionKey(message);
  const metadata = buildMetadata(message, senderId, senderUsername, firstName);
  const content = `[edited message] ${rawText}`;

  startTyping(activeClient.accountId, chatId);

  const envelope: InboundEnvelope = {
    channelId: "telegram-userbot",
    accountId: activeClient.accountId,
    senderId: senderIdStr,
    senderName: firstName || senderUsername || String(senderId),
    sessionKey,
    content,
    metadata,
    isGroup: !message.isPrivate,
  };

  await dispatchToOpenclaw(envelope);
}

/**
 * Dispatch inbound envelope to openclaw runtime.
 */
async function dispatchToOpenclaw(envelope: InboundEnvelope): Promise<void> {
  try {
    const rt = getTelegramRuntime();
    if (rt?.channel?.reply?.dispatchReply) {
      await rt.channel.reply.dispatchReply(envelope);
    } else {
      console.log(
        `[telegram-userbot] Received message from ${envelope.senderId}: ${envelope.content.slice(0, 100)}`,
      );
    }
  } catch (err) {
    console.error(`[telegram-userbot] Failed to dispatch message: ${err}`);
  }
}
