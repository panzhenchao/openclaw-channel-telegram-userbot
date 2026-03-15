/**
 * Allowlist / DM policy access control.
 *
 * Ported from Python: telegram_userbot.py:is_allowed()
 */

import type { TelegramUserbotAccountConfig } from "./types.ts";

/**
 * Check if a sender is allowed based on the allowFrom list.
 *
 * Sender ID format: "userId" or "userId|username"
 *
 * Matching rules:
 * - ["*"] allows everyone
 * - Matches against numeric userId or username (case-insensitive)
 */
export function isAllowed(
  config: TelegramUserbotAccountConfig,
  senderId: string,
): boolean {
  const allowList = config.allowFrom ?? [];
  if (allowList.length === 0) return false;
  if (allowList.includes("*")) return true;

  // Direct match
  if (allowList.includes(senderId)) return true;

  // Parse "userId|username" format
  const pipeIndex = senderId.indexOf("|");
  if (pipeIndex === -1) {
    // Plain ID — check case-insensitive
    return allowList.some((a) => a.toLowerCase() === senderId.toLowerCase());
  }

  const numericId = senderId.slice(0, pipeIndex);
  const username = senderId.slice(pipeIndex + 1);

  if (!numericId || !username) return false;

  return allowList.some((entry) => {
    const lower = entry.toLowerCase();
    return lower === numericId || lower === username.toLowerCase();
  });
}

/**
 * Resolve DM policy for an account.
 * Returns "open" or "allowlist" based on config.
 */
export function resolveDmPolicy(
  config: TelegramUserbotAccountConfig,
): "open" | "allowlist" {
  return config.dmPolicy ?? "open";
}

/**
 * Build the composite sender ID string.
 * Format: "userId|username" or just "userId" if no username.
 */
export function buildSenderId(
  userId: number | bigint,
  username: string | null | undefined,
): string {
  const id = String(userId);
  return username ? `${id}|${username}` : id;
}
