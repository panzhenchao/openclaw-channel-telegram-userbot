/**
 * Session routing key generation.
 *
 * Maps Telegram chat contexts to unique session keys for openclaw's
 * conversation tracking.
 *
 * Formats:
 *   DM:    telegram-userbot:dm:{senderId}
 *   Group: telegram-userbot:group:{chatId}
 *   Topic: telegram-userbot:group:{chatId}:topic:{topicId}
 */

import { Api } from "telegram/tl/index.js";

const CHANNEL_PREFIX = "telegram-userbot";

/**
 * Derive the session routing key from a GramJS message.
 */
export function deriveSessionKey(message: Api.Message): string {
  const chatId = String(message.chatId || message.peerId);

  // Check for forum topic
  if (message.replyTo) {
    const replyTo = message.replyTo as unknown as {
      forumTopic?: boolean;
      replyToTopId?: number;
      replyToMsgId?: number;
    };

    if (replyTo.forumTopic) {
      const topicId = replyTo.replyToTopId ?? replyTo.replyToMsgId;
      if (topicId !== undefined) {
        return `${CHANNEL_PREFIX}:group:${chatId}:topic:${topicId}`;
      }
    }
  }

  // Private message
  if (message.isPrivate) {
    // message.senderId is already a number/bigint; message.fromId may be a Peer object
    // GramJS uses BigInteger (big-integer lib), not native bigint — use String() for safety
    const senderId = message.senderId
      ?? (message.fromId && "userId" in message.fromId
        ? (message.fromId as unknown as { userId: unknown }).userId
        : message.chatId);
    return `${CHANNEL_PREFIX}:dm:${String(senderId)}`;
  }

  // Group message
  return `${CHANNEL_PREFIX}:group:${chatId}`;
}

/**
 * Normalize a target identifier for outbound messages.
 * Accepts numeric chat ID or "dm:{userId}" / "group:{chatId}" format.
 */
export function normalizeTarget(target: string): string {
  // Already a numeric ID
  if (/^-?\d+$/.test(target)) return target;

  // Strip channel prefix if present
  const stripped = target.startsWith(`${CHANNEL_PREFIX}:`)
    ? target.slice(CHANNEL_PREFIX.length + 1)
    : target;

  // Extract the chat/user ID from the routing key
  const dmMatch = stripped.match(/^dm:(.+)$/);
  if (dmMatch) return dmMatch[1];

  const groupMatch = stripped.match(/^group:([^:]+)/);
  if (groupMatch) return groupMatch[1];

  return target;
}
