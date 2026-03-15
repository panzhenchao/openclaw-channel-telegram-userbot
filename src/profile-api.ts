/**
 * User Profile Management API.
 *
 * Provides functions to manage the authenticated user's Telegram profile.
 * All functions follow the pattern: (accountId, ...) => Promise<...>
 */

import bigInt, { type BigInteger } from "big-integer";
import { Api } from "telegram/tl/index.js";
import { getActiveClient } from "./client-manager.ts";

/**
 * Update the user's profile (first name, last name, about/bio).
 */
export async function updateProfile(
  accountId: string,
  options: { firstName?: string; lastName?: string; about?: string },
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const result = await active.client.invoke(
      new Api.account.UpdateProfile({
        firstName: options.firstName,
        lastName: options.lastName,
        about: options.about,
      }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] updateProfile failed: ${err}`);
    throw err;
  }
}

/**
 * Update the user's username.
 */
export async function updateUsername(
  accountId: string,
  username: string,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const result = await active.client.invoke(
      new Api.account.UpdateUsername({ username }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] updateUsername failed: ${err}`);
    throw err;
  }
}

/**
 * Check if a username is available.
 */
export async function checkUsername(
  accountId: string,
  username: string,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const result = await active.client.invoke(
      new Api.account.CheckUsername({ username }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] checkUsername failed: ${err}`);
    throw err;
  }
}

/**
 * Upload a profile photo from a file path.
 */
export async function uploadProfilePhoto(
  accountId: string,
  filePath: string,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    await active.client.invoke(
      new Api.photos.UploadProfilePhoto({
        file: await active.client.uploadFile({
          file: filePath,
          workers: 1,
        }),
      }),
    );
    return true;
  } catch (err) {
    console.error(`[telegram-userbot] uploadProfilePhoto failed: ${err}`);
    throw err;
  }
}

/**
 * Delete all profile photos.
 */
export async function deleteProfilePhotos(
  accountId: string,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const photos = await active.client.invoke(
      new Api.photos.GetUserPhotos({
        userId: new Api.InputUserSelf(),
        offset: 0,
        maxId: bigInt(0),
        limit: 100,
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photoList = (photos as any)?.photos ?? [];
    if (photoList.length === 0) return true;

    const inputPhotos = photoList.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) =>
        new Api.InputPhoto({
          id: p.id,
          accessHash: p.accessHash,
          fileReference: p.fileReference,
        }),
    );

    await active.client.invoke(
      new Api.photos.DeletePhotos({ id: inputPhotos }),
    );
    return true;
  } catch (err) {
    console.error(`[telegram-userbot] deleteProfilePhotos failed: ${err}`);
    throw err;
  }
}

/**
 * Set or clear the user's emoji status.
 */
export async function updateEmojiStatus(
  accountId: string,
  emojiDocumentId?: BigInteger,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const emojiStatus = emojiDocumentId
      ? new Api.EmojiStatus({ documentId: emojiDocumentId })
      : new Api.EmojiStatusEmpty();
    const result = await active.client.invoke(
      new Api.account.UpdateEmojiStatus({ emojiStatus }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] updateEmojiStatus failed: ${err}`);
    throw err;
  }
}

/**
 * Update online/offline status.
 */
export async function updateOnlineStatus(
  accountId: string,
  offline: boolean,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const result = await active.client.invoke(
      new Api.account.UpdateStatus({ offline }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] updateOnlineStatus failed: ${err}`);
    throw err;
  }
}

/**
 * Update profile color.
 */
export async function updateProfileColor(
  accountId: string,
  color: number,
  backgroundEmojiId?: BigInteger,
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const result = await active.client.invoke(
      new Api.account.UpdateColor({
        color,
        ...(backgroundEmojiId !== undefined
          ? { backgroundEmojiId }
          : {}),
      }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] updateProfileColor failed: ${err}`);
    throw err;
  }
}

/**
 * Set or clear birthday.
 */
export async function updateBirthday(
  accountId: string,
  birthday?: { day: number; month: number; year?: number },
): Promise<boolean> {
  const active = getActiveClient(accountId);
  if (!active) throw new Error(`No active client for account: ${accountId}`);

  try {
    const birthdayObj = birthday
      ? new Api.Birthday({
          day: birthday.day,
          month: birthday.month,
          ...(birthday.year !== undefined ? { year: birthday.year } : {}),
        })
      : undefined;
    const result = await active.client.invoke(
      new Api.account.UpdateBirthday({ birthday: birthdayObj }),
    );
    return Boolean(result);
  } catch (err) {
    console.error(`[telegram-userbot] updateBirthday failed: ${err}`);
    throw err;
  }
}
