/**
 * Client API — higher-level Telegram operations.
 *
 * All functions follow the pattern: (accountId, ...) => Promise<...>
 * Uses getActiveClient() internally, wrapped in try-catch.
 */

import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { getActiveClient } from "./client-manager.ts";

/**
 * Fetch recent messages from a chat.
 */
export async function getMessageHistory(
  accountId: string,
  chatId: string | number,
  limit = 20,
  offsetId?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const messages = await active.client.getMessages(Number(chatId), {
      limit,
      ...(offsetId !== undefined ? { offsetId } : {}),
    });
    return messages ?? [];
  } catch (err) {
    console.error(`[telegram-userbot] getMessageHistory failed: ${err}`);
    throw err;
  }
}

/**
 * Forward messages between chats.
 */
export async function forwardMessages(
  accountId: string,
  fromChat: string | number,
  toChat: string | number,
  messageIds: number[],
): Promise<void> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    await active.client.forwardMessages(Number(toChat), {
      messages: messageIds,
      fromPeer: Number(fromChat),
    });
  } catch (err) {
    console.error(`[telegram-userbot] forwardMessages failed: ${err}`);
    throw err;
  }
}

/**
 * Delete messages in a chat.
 */
export async function deleteMessages(
  accountId: string,
  chatId: string | number,
  messageIds: number[],
  revoke = false,
): Promise<void> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    await active.client.deleteMessages(Number(chatId), messageIds, {
      revoke,
    });
  } catch (err) {
    console.error(`[telegram-userbot] deleteMessages failed: ${err}`);
    throw err;
  }
}

/**
 * Send a scheduled message.
 */
export async function sendScheduled(
  accountId: string,
  chatId: string | number,
  text: string,
  timestamp: number,
): Promise<void> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    await active.client.sendMessage(Number(chatId), {
      message: text,
      schedule: timestamp,
    });
  } catch (err) {
    console.error(`[telegram-userbot] sendScheduled failed: ${err}`);
    throw err;
  }
}

/**
 * Pin a message in a chat.
 */
export async function pinMessage(
  accountId: string,
  chatId: string | number,
  messageId: number,
  notify = false,
): Promise<void> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    await active.client.pinMessage(Number(chatId), messageId, {
      notify,
    });
  } catch (err) {
    console.error(`[telegram-userbot] pinMessage failed: ${err}`);
    throw err;
  }
}

/**
 * Search messages in a chat.
 */
export async function searchMessages(
  accountId: string,
  chatId: string | number,
  query: string,
  limit = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const result = await active.client.invoke(
      new Api.messages.Search({
        peer: Number(chatId),
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result as any)?.messages ?? [];
  } catch (err) {
    console.error(`[telegram-userbot] searchMessages failed: ${err}`);
    throw err;
  }
}

/**
 * Get participants/members of a group or channel.
 */
export async function getParticipants(
  accountId: string,
  chatId: string | number,
  limit = 100,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const participants = await active.client.getParticipants(Number(chatId), {
      limit,
    });
    return participants ?? [];
  } catch (err) {
    console.error(`[telegram-userbot] getParticipants failed: ${err}`);
    throw err;
  }
}

/**
 * List conversations (dialogs).
 */
export async function getDialogs(
  accountId: string,
  limit = 50,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const dialogs = await active.client.getDialogs({ limit });
    return dialogs ?? [];
  } catch (err) {
    console.error(`[telegram-userbot] getDialogs failed: ${err}`);
    throw err;
  }
}
