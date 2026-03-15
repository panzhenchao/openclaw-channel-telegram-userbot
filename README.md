# openclaw-channel-telegram-userbot

Telegram Userbot channel plugin for [openclaw](https://github.com/anthropics/openclaw) — connects as a regular Telegram user account (not a bot) via MTProto using [GramJS](https://github.com/nicedayfor/gramjs).

> **WARNING**: Using a user account for automated messaging may violate Telegram's Terms of Service. Use a dedicated secondary account. Your account could be banned or restricted.

## Features

- **MTProto Client API** — operates as a user account, not a bot
- **DM & Group support** — private chats, groups, supergroups, forum topics
- **Forum topic routing** — correctly routes replies to the right forum topic thread
- **@Mention detection** — respond only when mentioned in groups (text, caption, and ID-based mentions)
- **Media handling** — photos, voice, video, documents, stickers, media groups
- **Voice transcription** — automatic voice/audio transcription when runtime provides a transcription service
- **Read receipts** — mark messages as read
- **Emoji reactions** — react to incoming messages
- **Auto-disclosure** — append "[AI]" or custom text to outbound messages
- **FloodWait handling** — automatic retry with backoff on Telegram rate limits
- **Proxy support** — SOCKS4/SOCKS5 proxy configuration
- **Multi-account** — run multiple Telegram accounts simultaneously
- **Three auth methods** — StringSession, phone+code, QR code
- **Client API** — message history, forwarding, search, scheduling, pinning, and more
- **Profile API** — manage username, bio, avatar, emoji status, profile color, birthday

## Installation

```bash
# From npm
npm install openclaw-channel-telegram-userbot

# Or local install
cd /path/to/openclaw-channel-telegram-userbot
npm install
npx openclaw install ./
```

## Configuration

Add to your openclaw config (`~/.openclaw/config.json`):

```json
{
  "channels": {
    "telegram-userbot": {
      "enabled": true,
      "apiId": 12345678,
      "apiHash": "your_api_hash_from_my_telegram_org",
      "sessionString": "1BVtsOH...",
      "allowFrom": ["*"],
      "groupPolicy": "mention",
      "reactionEmoji": "👀",
      "autoDisclosure": "[AI]"
    }
  }
}
```

### Getting API Credentials

1. Go to https://my.telegram.org
2. Log in with your phone number
3. Go to "API development tools"
4. Create a new application
5. Copy the `api_id` and `api_hash`

### Authentication Methods

#### 1. StringSession (recommended for production)

Pre-authenticate once, then use the session string in config:

```json
{
  "sessionString": "1BVtsOH..."
}
```

#### 2. Phone + Verification Code

Provide your phone number — you'll be prompted for the code on first start:

```json
{
  "phone": "+8613800138000"
}
```

#### 3. QR Code

Leave both `sessionString` and `phone` empty — a QR code link will be displayed. Scan it with Telegram: Settings → Devices → Link Desktop Device.

### Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `apiId` | number | required | Telegram API ID |
| `apiHash` | string | required | Telegram API hash |
| `sessionString` | string | `""` | Pre-authenticated StringSession |
| `phone` | string | `""` | Phone number for interactive auth |
| `proxy` | string | — | Proxy URL (e.g. `socks5://host:port`) |
| `allowFrom` | string[] | `["*"]` | Allowed sender IDs/usernames |
| `groupPolicy` | `"open"` \| `"mention"` | `"mention"` | Group message handling |
| `replyToMessage` | boolean | `false` | Quote original message in replies |
| `reactionEmoji` | string | `""` | React to incoming messages |
| `autoDisclosure` | string | `""` | Text appended to all outbound messages |
| `dmPolicy` | `"open"` \| `"allowlist"` | `"open"` | DM acceptance policy |

### Multi-Account

```json
{
  "channels": {
    "telegram-userbot": {
      "apiId": 12345678,
      "apiHash": "shared_hash",
      "groupPolicy": "mention",
      "accounts": {
        "personal": {
          "sessionString": "session_1...",
          "allowFrom": ["friend1", "friend2"]
        },
        "work": {
          "sessionString": "session_2...",
          "allowFrom": ["*"],
          "autoDisclosure": "[AI Assistant]"
        }
      }
    }
  }
}
```

### Proxy Configuration

Supports SOCKS4, SOCKS5, and HTTP proxies:

```json
{
  "proxy": "socks5://username:password@host:port"
}
```

## Client API

Higher-level Telegram operations accessible via the plugin's `api.client` namespace. All functions take `accountId` as the first parameter.

### `getMessageHistory(accountId, chatId, limit?, offsetId?)`

Fetch recent messages from a chat.

```typescript
const messages = await plugin.api.client.getMessageHistory("default", "-100123456", 50);
```

### `forwardMessages(accountId, fromChat, toChat, messageIds)`

Forward messages between chats.

```typescript
await plugin.api.client.forwardMessages("default", "-100111", "-100222", [42, 43]);
```

### `deleteMessages(accountId, chatId, messageIds, revoke?)`

Delete messages. Set `revoke: true` to delete for everyone.

```typescript
await plugin.api.client.deleteMessages("default", "-100123456", [42], true);
```

### `sendScheduled(accountId, chatId, text, timestamp)`

Send a message scheduled for a future time (Unix timestamp).

```typescript
const futureTs = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
await plugin.api.client.sendScheduled("default", "-100123456", "Hello!", futureTs);
```

### `pinMessage(accountId, chatId, messageId, notify?)`

Pin a message in a chat.

```typescript
await plugin.api.client.pinMessage("default", "-100123456", 42, false);
```

### `searchMessages(accountId, chatId, query, limit?)`

Search messages in a chat by keyword.

```typescript
const results = await plugin.api.client.searchMessages("default", "-100123456", "keyword", 10);
```

### `getParticipants(accountId, chatId, limit?)`

List group/channel members.

```typescript
const members = await plugin.api.client.getParticipants("default", "-100123456", 200);
```

### `getDialogs(accountId, limit?)`

List recent conversations.

```typescript
const chats = await plugin.api.client.getDialogs("default", 100);
```

## Profile API

Manage the authenticated user's Telegram profile via `api.profile`.

### `updateProfile(accountId, { firstName?, lastName?, about? })`

Update display name and bio.

```typescript
await plugin.api.profile.updateProfile("default", {
  firstName: "Alice",
  lastName: "Bot",
  about: "Powered by openclaw",
});
```

### `updateUsername(accountId, username)` / `checkUsername(accountId, username)`

Change or check availability of a username.

```typescript
const available = await plugin.api.profile.checkUsername("default", "my_new_name");
if (available) {
  await plugin.api.profile.updateUsername("default", "my_new_name");
}
```

### `uploadProfilePhoto(accountId, filePath)` / `deleteProfilePhotos(accountId)`

Upload a new avatar or remove all profile photos.

```typescript
await plugin.api.profile.uploadProfilePhoto("default", "/path/to/photo.jpg");
await plugin.api.profile.deleteProfilePhotos("default");
```

### `updateEmojiStatus(accountId, emojiDocumentId?)`

Set or clear the premium emoji status. Pass `undefined` to clear.

```typescript
import bigInt from "big-integer";
await plugin.api.profile.updateEmojiStatus("default", bigInt("5368324170671202286"));
await plugin.api.profile.updateEmojiStatus("default"); // clear
```

### `updateOnlineStatus(accountId, offline)`

Set online/offline status.

```typescript
await plugin.api.profile.updateOnlineStatus("default", false); // appear online
```

### `updateProfileColor(accountId, color, backgroundEmojiId?)`

Change the profile accent color (Telegram Premium).

```typescript
await plugin.api.profile.updateProfileColor("default", 5);
```

### `updateBirthday(accountId, { day, month, year? }?)`

Set or clear birthday. Pass `undefined` to clear.

```typescript
await plugin.api.profile.updateBirthday("default", { day: 1, month: 1, year: 2000 });
await plugin.api.profile.updateBirthday("default"); // clear
```

## Inbound Message Pipeline

Messages pass through a 10-stage pipeline:

1. **Filter own messages** — skip messages sent by the bot itself
2. **Discard stale messages** — ignore messages older than 60s at startup
3. **Check allowlist** — verify sender is in `allowFrom`
4. **Check group policy** — detect @mentions (text, caption, message entities, reply-to-us)
5. **Handle built-in commands** — `/start` and `/help` respond locally
6. **Send emoji reaction** + start typing indicator
7. **Download media** — photos, voice, video, documents
8. **Extract reply context** — include quoted message text and media
9. **Handle media groups** — buffer multiple media in 600ms window
10. **Mark as read** → build envelope → dispatch to openclaw

### Built-in Commands

- `/start` — responds with a greeting message
- `/help` — responds with usage information

These are handled locally without dispatching to the openclaw runtime.

### Voice Transcription

When the openclaw runtime provides a `transcribe` service (`rt.services.transcribe`), voice and audio messages are automatically transcribed. The transcription is appended to the message content as `[Transcription: ...]`.

### Forum Topic Routing

Messages in forum topics are correctly routed using thread IDs:

- **Inbound**: Thread IDs are cached per message (`chatId:messageId → topicId`)
- **Outbound**: Thread ID is extracted from the session key pattern `:topic:(\d+)$`, or looked up from the cache
- **Session keys**: Forum topics use the format `telegram-userbot:group:{chatId}:topic:{topicId}`

### FloodWait Handling

Telegram rate limits (FloodWaitError) are handled automatically:

- Up to 3 retries per operation
- Waits the required duration (capped at 60s per wait)
- Applies to all outbound `sendText` and `sendMedia` calls
- `floodSleepThreshold: 60` is set at the client level for GramJS built-in handling

## Architecture

```
index.ts                  → Plugin entry, registers channel
src/channel.ts            → Assembles all adapters into ChannelPlugin
src/types.ts              → TypeScript interfaces
src/config-schema.ts      → Zod config validation
src/config.ts             → Config resolution + multi-account merge
src/runtime.ts            → Global PluginRuntime storage
src/auth.ts               → GramJS authentication (QR + phone + StringSession)
src/client-manager.ts     → Client lifecycle (connect/disconnect/reconnect)
src/inbound-handler.ts    → Inbound message pipeline (10 stages)
src/send-service.ts       → Outbound message sending (text/media)
src/access-control.ts     → Allowlist / DM policy
src/mention-detection.ts  → @mention detection for groups
src/media-utils.ts        → Media download and type detection
src/message-utils.ts      → Markdown→HTML, message splitting
src/proxy-utils.ts        → Proxy URL parsing
src/session-routing.ts    → Session key generation (DM/group/topic)
src/client-api.ts         → Client API (history, forward, search, schedule, pin)
src/profile-api.ts        → Profile API (name, username, avatar, emoji, color)
```

## License

MIT
