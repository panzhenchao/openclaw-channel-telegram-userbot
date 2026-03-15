/**
 * Module-level config storage for account configs.
 *
 * Avoids polluting the openclaw runtime object with private state.
 * All modules that need account config read from here.
 */

import type { TelegramUserbotAccountConfig } from "./types.ts";

const accountConfigs = new Map<string, TelegramUserbotAccountConfig>();

export function setAccountConfig(
  accountId: string,
  config: TelegramUserbotAccountConfig,
): void {
  accountConfigs.set(accountId, config);
}

export function getAccountConfig(
  accountId: string,
): TelegramUserbotAccountConfig | undefined {
  return accountConfigs.get(accountId);
}

export function deleteAccountConfig(accountId: string): void {
  accountConfigs.delete(accountId);
}

export function clearAllAccountConfigs(): void {
  accountConfigs.clear();
}
