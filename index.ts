/**
 * openclaw-channel-telegram-userbot
 *
 * Plugin entry point — registers the Telegram Userbot channel with openclaw.
 *
 * This plugin enables openclaw to operate as a Telegram user account (not a bot)
 * using GramJS (MTProto). Supports DMs, groups, forum topics, media, reactions,
 * read receipts, and @mention detection.
 *
 * WARNING: Using a user account for automated messaging may violate Telegram's
 * Terms of Service. Use a dedicated secondary account.
 */

import { telegramUserbotPlugin } from "./src/channel.ts";
import { setTelegramRuntime } from "./src/runtime.ts";

// Re-export public APIs
export {
  getMessageHistory,
  forwardMessages,
  deleteMessages,
  sendScheduled,
  pinMessage,
  searchMessages,
  getParticipants,
  getDialogs,
} from "./src/client-api.ts";

export {
  updateProfile,
  updateUsername,
  checkUsername,
  uploadProfilePhoto,
  deleteProfilePhotos,
  updateEmojiStatus,
  updateOnlineStatus,
  updateProfileColor,
  updateBirthday,
} from "./src/profile-api.ts";

export { getSentMessages } from "./src/send-service.ts";

export default {
  id: "telegram-userbot",
  name: "Telegram Userbot",
  description:
    "Connect as a Telegram user account via MTProto (GramJS). " +
    "Supports DMs, groups, topics, media, reactions, and read receipts.",

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(api: any): void {
    // Store the runtime for cross-module access
    setTelegramRuntime(api.runtime);

    // Register the channel plugin
    api.registerChannel({ plugin: telegramUserbotPlugin });
  },
};
