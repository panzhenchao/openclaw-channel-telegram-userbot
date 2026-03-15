/**
 * Configuration resolution: reads raw config, merges account-specific overrides.
 */

import type {
  TelegramUserbotConfig,
  TelegramUserbotAccountConfig,
  ResolvedAccount,
} from "./types.ts";

const CHANNEL_ID = "telegram-userbot";
const DEFAULT_ACCOUNT_ID = "default";

/**
 * Extract the telegram-userbot config section from the full openclaw config.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getChannelConfig(cfg: any): TelegramUserbotConfig | undefined {
  return cfg?.channels?.[CHANNEL_ID] ?? cfg?.channels?.["telegramUserbot"];
}

/**
 * List all configured account IDs.
 * If no `accounts` sub-object exists, returns ["default"].
 */
export function listAccountIds(cfg: TelegramUserbotConfig): string[] {
  if (cfg.accounts && Object.keys(cfg.accounts).length > 0) {
    return Object.keys(cfg.accounts);
  }
  return [DEFAULT_ACCOUNT_ID];
}

/**
 * Merge top-level defaults with account-specific overrides.
 *
 * Uses shallow merge: account-level array fields (e.g. `allowFrom`)
 * fully replace the top-level defaults rather than being concatenated.
 * This matches the behavior of other openclaw channel plugins.
 */
function mergeAccountConfig(
  base: TelegramUserbotConfig,
  override?: Partial<TelegramUserbotAccountConfig>,
): TelegramUserbotAccountConfig {
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Resolve a single account by ID, merging defaults.
 */
export function resolveAccount(
  cfg: TelegramUserbotConfig,
  accountId: string,
): ResolvedAccount {
  const accountOverride = cfg.accounts?.[accountId];
  const merged =
    accountId === DEFAULT_ACCOUNT_ID && !accountOverride
      ? cfg
      : mergeAccountConfig(cfg, accountOverride);

  const configured = Boolean(merged.apiId && merged.apiHash);
  const enabled = merged.enabled !== false && configured;

  return {
    accountId,
    name: merged.name || accountId,
    config: merged,
    enabled,
    configured,
  };
}

/**
 * Check if the channel has any configured account.
 */
export function isConfigured(cfg: TelegramUserbotConfig): boolean {
  const ids = listAccountIds(cfg);
  return ids.some((id) => resolveAccount(cfg, id).configured);
}

/**
 * Get the default account ID.
 */
export function defaultAccountId(cfg: TelegramUserbotConfig): string {
  const ids = listAccountIds(cfg);
  return ids[0] || DEFAULT_ACCOUNT_ID;
}

/**
 * Describe an account for status display.
 */
export function describeAccount(account: ResolvedAccount): string {
  if (!account.configured) return "Not configured (missing apiId/apiHash)";
  if (!account.enabled) return "Disabled";
  return `Configured (apiId: ${account.config.apiId})`;
}
