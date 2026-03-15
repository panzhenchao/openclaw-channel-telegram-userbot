/**
 * Media download, type detection, and extension helpers.
 *
 * Ported from Python: telegram-client-sikill/channel/utils.py
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { TelegramClient } from "telegram";
import { Api } from "telegram/tl/index.js";
import type { MediaType } from "./types.ts";

/**
 * Detect media type from file extension.
 *
 * Ported from Python: detect_media_type()
 */
export function detectMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");

  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "photo";
  if (ext === "ogg") return "voice";
  if (["mp3", "m4a", "wav", "aac"].includes(ext)) return "audio";
  if (["mp4", "avi", "mkv", "mov", "webm"].includes(ext)) return "video";
  return "document";
}

/**
 * Get file extension based on media type, MIME type, or original filename.
 *
 * Ported from Python: get_extension()
 */
export function getExtension(
  mediaType: string,
  mimeType?: string,
  filename?: string,
): string {
  if (mimeType) {
    const extMap: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "audio/ogg": ".ogg",
      "audio/mpeg": ".mp3",
      "audio/mp4": ".m4a",
      "video/mp4": ".mp4",
    };
    if (extMap[mimeType]) return extMap[mimeType];
  }

  const typeMap: Record<string, string> = {
    photo: ".jpg",
    voice: ".ogg",
    audio: ".mp3",
    video: ".mp4",
    document: "",
  };
  if (typeMap[mediaType]) return typeMap[mediaType];

  if (filename) return path.extname(filename);
  return "";
}

/**
 * Get or create the media download directory.
 */
export function getMediaDir(): string {
  const dir = path.join(os.homedir(), ".openclaw", "media", "telegram-userbot");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Detect the media type from a GramJS message object.
 *
 * Returns a tuple of [mediaType, description] or undefined if no media.
 */
export function detectMessageMediaType(
  message: Api.Message,
): { type: MediaType | "poll" | "location" | "contact"; description: string } | undefined {
  if (message.photo) return { type: "photo", description: "image" };
  if (message.voice) return { type: "voice", description: "voice" };
  if (message.audio) return { type: "audio", description: "audio" };
  if (message.video || message.videoNote) return { type: "video", description: "video" };
  if (message.gif) return { type: "animation", description: "animation" };

  if (message.sticker) {
    const alt = (message.sticker as unknown as { alt?: string }).alt || "";
    return {
      type: "sticker",
      description: alt ? `sticker: ${alt}` : "sticker",
    };
  }

  if (message.document) return { type: "document", description: "file" };

  if (message.poll) {
    const question = (message.poll as unknown as { question?: { text?: string } }).question;
    const qText = question?.text || "?";
    return { type: "poll", description: `poll: ${qText}` };
  }

  if (message.geo || message.venue) {
    const geo = message.geo || (message.venue as unknown as { geo?: Api.GeoPoint })?.geo;
    if (geo && "lat" in geo) {
      return {
        type: "location",
        description: `location: ${(geo as Api.GeoPoint).lat}, ${(geo as Api.GeoPoint).long}`,
      };
    }
    return { type: "location", description: "location" };
  }

  if (message.contact) {
    const c = message.contact as unknown as {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
    };
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
    const info = c.phoneNumber ? `${name} ${c.phoneNumber}`.trim() : name || "unknown";
    return { type: "contact", description: `contact: ${info}` };
  }

  if (message.media) return { type: "document", description: "file" };

  return undefined;
}

/**
 * Download media from a GramJS message.
 *
 * Returns [filePaths, contentParts] — filePaths for downloadable media,
 * contentParts for text tags (e.g. "[sticker: 👍]", "[poll: Question?]").
 */
export async function downloadMessageMedia(
  client: TelegramClient,
  message: Api.Message,
): Promise<{ paths: string[]; parts: string[] }> {
  const mediaInfo = detectMessageMediaType(message);
  if (!mediaInfo) return { paths: [], parts: [] };

  // Non-downloadable types — return content tags only
  if (["sticker", "poll", "location", "contact"].includes(mediaInfo.type)) {
    return { paths: [], parts: [`[${mediaInfo.description}]`] };
  }

  // Downloadable media
  try {
    const mediaDir = getMediaDir();
    // GramJS downloadMedia returns Buffer | string (file path) | undefined
    const downloaded = await client.downloadMedia(message, {});

    if (!downloaded) {
      return { paths: [], parts: [`[${mediaInfo.description}: download failed]`] };
    }

    // Determine filename — extract MIME type from document if available
    const docMimeType = (message.document as unknown as { mimeType?: string })?.mimeType
      ?? (message.audio as unknown as { mimeType?: string })?.mimeType
      ?? (message.voice as unknown as { mimeType?: string })?.mimeType
      ?? undefined;
    const docFilename = (message.document as unknown as { fileName?: string })?.fileName ?? undefined;
    const ext = getExtension(mediaInfo.type, docMimeType, docFilename) || ".bin";
    const filename = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    const filePath = path.join(mediaDir, filename);

    if (typeof downloaded === "string") {
      // GramJS returned a file path — copy it to our media dir
      fs.copyFileSync(downloaded, filePath);
    } else if (Buffer.isBuffer(downloaded)) {
      fs.writeFileSync(filePath, downloaded);
    } else {
      // Uint8Array or other buffer-like
      fs.writeFileSync(filePath, Buffer.from(downloaded as Uint8Array));
    }

    return {
      paths: [filePath],
      parts: [`[${mediaInfo.description}: ${filePath}]`],
    };
  } catch (err) {
    console.error(`[telegram-userbot] Failed to download media: ${err}`);
    return { paths: [], parts: [`[${mediaInfo.description}: download failed]`] };
  }
}
