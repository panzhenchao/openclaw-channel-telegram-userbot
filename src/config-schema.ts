/**
 * Zod validation schema for Telegram Userbot channel configuration.
 */

import { z } from "zod";

/** Per-account config schema — apiId and apiHash are required here. */
export const TelegramUserbotAccountConfigSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  apiId: z.number().int().positive(),
  apiHash: z.string().min(1),
  sessionString: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  proxy: z.string().optional(),
  allowFrom: z.array(z.string()).optional().default(["*"]),
  groupPolicy: z.enum(["open", "mention"]).optional().default("mention"),
  replyToMessage: z.boolean().optional().default(false),
  reactionEmoji: z.string().optional().default(""),
  autoDisclosure: z.string().optional().default(""),
  dmPolicy: z.enum(["open", "allowlist"]).optional().default("open"),
});

/**
 * Top-level channel config schema.
 *
 * apiId/apiHash are optional at top-level because they can be specified
 * per-account instead. When using multi-account, top-level values serve
 * as shared defaults.
 */
export const TelegramUserbotConfigSchema = TelegramUserbotAccountConfigSchema
  .partial({ apiId: true, apiHash: true })
  .extend({
    accounts: z
      .record(z.string(), TelegramUserbotAccountConfigSchema.partial().optional())
      .optional(),
  });

export type TelegramUserbotConfigZod = z.infer<typeof TelegramUserbotConfigSchema>;
