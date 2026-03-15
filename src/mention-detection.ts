/**
 * @mention detection for group message filtering.
 *
 * Ported from Python: telegram_userbot.py:_has_mention() + _is_for_me()
 */

import { Api } from "telegram/tl/index.js";
import type { TelegramUserbotAccountConfig } from "./types.ts";

/**
 * Check if the message text mentions a specific username.
 *
 * Checks:
 * 1. Raw text contains @username (case-insensitive)
 * 2. Message entities contain MessageEntityMention matching the username
 * 3. Message entities contain MessageEntityMentionName matching the user ID
 */
export function hasMention(
  rawText: string,
  entities: Api.TypeMessageEntity[] | undefined,
  meUsername: string | null,
  meId: number,
): boolean {
  // Username-based checks (only if we have a username)
  if (meUsername) {
    const handleLower = `@${meUsername}`.toLowerCase();

    // Raw text check (case-insensitive)
    if (rawText && rawText.toLowerCase().includes(handleLower)) {
      return true;
    }

    // Entity check for @username mentions
    if (entities) {
      for (const entity of entities) {
        if (entity instanceof Api.MessageEntityMention) {
          const mentionText = rawText.slice(
            entity.offset,
            entity.offset + entity.length,
          );
          if (mentionText.toLowerCase() === handleLower) {
            return true;
          }
        }
      }
    }
  }

  // ID-based mention check (works even without username)
  if (entities) {
    for (const entity of entities) {
      if (entity instanceof Api.MessageEntityMentionName) {
        if (Number(entity.userId) === meId) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Determine if a message should be processed based on group policy.
 *
 * - Private messages: always process
 * - Group messages with policy "open": always process
 * - Group messages with policy "mention": only if @mentioned or replying to us
 */
export async function isMessageForMe(
  message: Api.Message,
  config: TelegramUserbotAccountConfig,
  meUsername: string | null,
  meId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<boolean> {
  // Private messages always pass
  if (message.isPrivate) return true;

  const groupPolicy = config.groupPolicy ?? "mention";
  if (groupPolicy === "open") return true;

  const rawText = message.text || "";

  // Check mention in text entities
  if (hasMention(rawText, message.entities, meUsername, meId)) {
    return true;
  }

  // Check mention in media caption entities (GramJS unifies text/caption in .text,
  // but caption entities may differ from text entities on media messages)
  if (message.media) {
    const caption = (message as unknown as { message?: string }).message || "";
    if (caption && caption !== rawText) {
      if (hasMention(caption, message.entities, meUsername, meId)) {
        return true;
      }
    }
  }

  // Check if replying to our message
  if (message.replyTo) {
    const replyToMsgId = (message.replyTo as unknown as { replyToMsgId?: number }).replyToMsgId;
    if (replyToMsgId !== undefined) {
      try {
        const replyMsg = await client.getMessages(message.peerId, {
          ids: [replyToMsgId],
        });
        const replied = replyMsg?.[0];
        if (replied) {
          // fromId can be PeerUser | PeerChat | PeerChannel — only PeerUser has userId
          const fromId = replied.fromId;
          const fromUserId = fromId && "userId" in fromId
            ? Number((fromId as { userId: bigint }).userId)
            : null;
          if (fromUserId === meId) {
            return true;
          }
        }
      } catch {
        // Non-critical — ignore reply lookup failures
      }
    }
  }

  return false;
}
