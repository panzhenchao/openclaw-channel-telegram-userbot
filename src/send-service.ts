/**
 * Outbound message sending — text and media.
 *
 * Handles:
 * - Markdown→HTML conversion with plain-text fallback
 * - Message splitting (4000 char limit)
 * - Media file sending with type-specific parameters
 * - Auto-disclosure text appending
 * - Typing indicator
 */

import { Api } from "telegram/tl/index.js";
import { FloodWaitError } from "telegram/errors/RPCErrorList.js";
import { getActiveClient } from "./client-manager.ts";
import { normalizeTarget } from "./session-routing.ts";
import { markdownToTelegramHtml, splitMessage, TELEGRAM_MAX_MESSAGE_LEN } from "./message-utils.ts";
import { detectMediaType } from "./media-utils.ts";

/** Max sent message IDs tracked per chat. */
const SENT_MSG_CAP = 100;
/** Max FloodWait retries. */
const FLOOD_MAX_RETRIES = 3;

/**
 * Start a typing indicator for a chat.
 */
export function startTyping(accountId: string, chatId: string): void {
  const active = getActiveClient(accountId);
  if (!active) return;

  stopTyping(accountId, chatId);

  const sendTypingAction = async () => {
    // Re-check client is still active — it may have been stopped between intervals
    const current = getActiveClient(accountId);
    if (!current || !current.client.connected) {
      stopTyping(accountId, chatId);
      return;
    }
    try {
      await current.client.invoke(
        new Api.messages.SetTyping({
          peer: Number(chatId),
          action: new Api.SendMessageTypingAction(),
        }),
      );
    } catch {
      // Non-critical — ignore typing errors
    }
  };

  const interval = setInterval(sendTypingAction, 4000);
  active.typingTasks.set(chatId, interval);

  // Send immediately (fire-and-forget but safe — errors caught inside)
  sendTypingAction();
}

/**
 * Stop the typing indicator for a chat.
 */
export function stopTyping(accountId: string, chatId: string): void {
  const active = getActiveClient(accountId);
  if (!active) return;

  const existing = active.typingTasks.get(chatId);
  if (existing) {
    clearInterval(existing);
    active.typingTasks.delete(chatId);
  }
}

/**
 * Retry a function on FloodWaitError, sleeping for the required duration.
 */
async function withFloodRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < FLOOD_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof FloodWaitError && attempt < FLOOD_MAX_RETRIES - 1) {
        const waitSec = Math.min(err.seconds, 60);
        console.warn(`[telegram-userbot] FloodWait: sleeping ${waitSec}s (attempt ${attempt + 1}/${FLOOD_MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withFloodRetry: unreachable");
}

/**
 * Track a sent message ID for a chat.
 */
function trackSentMessage(accountId: string, chatId: string, messageId: number): void {
  const active = getActiveClient(accountId);
  if (!active) return;

  let ids = active.sentMessages.get(chatId);
  if (!ids) {
    ids = [];
    active.sentMessages.set(chatId, ids);
  }
  ids.push(messageId);
  if (ids.length > SENT_MSG_CAP) {
    ids.splice(0, ids.length - SENT_MSG_CAP);
  }
}

/**
 * Get sent message IDs for a chat.
 */
export function getSentMessages(accountId: string, chatId: string): number[] {
  const active = getActiveClient(accountId);
  if (!active) return [];
  return [...(active.sentMessages.get(chatId) ?? [])];
}

/**
 * Look up cached thread ID for a chat from the message thread cache.
 */
function lookupCachedThreadId(accountId: string, chatId: string): number | undefined {
  const active = getActiveClient(accountId);
  if (!active) return undefined;

  // Return the most recently cached thread ID for this chat
  // Map iteration is insertion order, so last match = most recent
  const prefix = `${chatId}:`;
  let result: number | undefined;
  for (const [key, topicId] of active.messageThreads) {
    if (key.startsWith(prefix)) {
      result = topicId;
    }
  }
  return result;
}

/**
 * Send a text message with Markdown→HTML conversion.
 *
 * Falls back to plain text if HTML parsing fails.
 * Splits long messages into chunks.
 */
export async function sendText(
  accountId: string,
  to: string,
  text: string,
  options?: {
    replyToMsgId?: number;
    threadId?: number;
    autoDisclosure?: string;
  },
): Promise<void> {
  const active = getActiveClient(accountId);
  if (!active) {
    console.warn("[telegram-userbot] No active client for account:", accountId);
    return;
  }

  const chatId = Number(normalizeTarget(to));
  const client = active.client;

  // Stop typing
  stopTyping(accountId, String(chatId));

  // Append disclosure
  let fullText = text;
  if (options?.autoDisclosure) {
    fullText = `${text}\n\n${options.autoDisclosure}`;
  }

  // Resolve reply target — fall back to cached thread ID for forum routing
  const replyTo = options?.replyToMsgId ?? options?.threadId
    ?? lookupCachedThreadId(accountId, String(chatId));

  // Split and send
  const chunks = splitMessage(fullText, TELEGRAM_MAX_MESSAGE_LEN);

  for (const chunk of chunks) {
    try {
      const html = markdownToTelegramHtml(chunk);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await withFloodRetry(() =>
        client.sendMessage(chatId, {
          message: html,
          parseMode: "html",
          replyTo,
          linkPreview: false,
        }),
      );
      if (result?.id) {
        trackSentMessage(accountId, String(chatId), result.id);
      }
    } catch (err) {
      // Fallback to plain text
      console.warn(`[telegram-userbot] HTML send failed, falling back to plain text: ${err}`);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await withFloodRetry(() =>
          client.sendMessage(chatId, {
            message: chunk,
            replyTo,
            linkPreview: false,
          }),
        );
        if (result?.id) {
          trackSentMessage(accountId, String(chatId), result.id);
        }
      } catch (err2) {
        console.error(`[telegram-userbot] Failed to send message: ${err2}`);
      }
    }
  }
}

/**
 * Send a media file (photo, voice, video, document).
 */
export async function sendMedia(
  accountId: string,
  to: string,
  filePath: string,
  options?: {
    caption?: string;
    replyToMsgId?: number;
    threadId?: number;
    asVoice?: boolean;
  },
): Promise<void> {
  const active = getActiveClient(accountId);
  if (!active) {
    console.warn("[telegram-userbot] No active client for account:", accountId);
    return;
  }

  const chatId = Number(normalizeTarget(to));
  const client = active.client;

  stopTyping(accountId, String(chatId));

  const mediaType = detectMediaType(filePath);
  const replyTo = options?.replyToMsgId ?? options?.threadId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendOpts: Record<string, any> = {
    file: filePath,
    replyTo,
  };

  if (options?.caption) {
    sendOpts.caption = options.caption;
  }

  // Type-specific flags
  if (options?.asVoice || mediaType === "voice") {
    sendOpts.voiceNote = true;
  } else if (mediaType === "video") {
    sendOpts.supportsStreaming = true;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await withFloodRetry(() => client.sendFile(chatId, sendOpts));
    if (result?.id) {
      trackSentMessage(accountId, String(chatId), result.id);
    }
  } catch (err) {
    console.error(`[telegram-userbot] Failed to send media ${filePath}: ${err}`);
    // Notify about failure
    const filename = filePath.split("/").pop() || filePath;
    try {
      await client.sendMessage(chatId, {
        message: `[Failed to send: ${filename}]`,
        replyTo,
      });
    } catch {
      // Ignore fallback failure
    }
  }
}
