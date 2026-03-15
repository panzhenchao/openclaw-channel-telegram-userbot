/**
 * Message utilities: Markdown→HTML conversion and message splitting.
 *
 * Ported from Python: telegram-client-sikill/channel/utils.py
 */

/** Telegram maximum message length. */
export const TELEGRAM_MAX_MESSAGE_LEN = 4000;
/** Maximum reply context preview length. */
export const TELEGRAM_REPLY_CONTEXT_MAX_LEN = 4000;

/**
 * Split content into chunks within maxLen, preferring line breaks then spaces.
 *
 * Ported from Python: split_message()
 */
export function splitMessage(content: string, maxLen = 4000): string[] {
  if (!content) return [];
  if (content.length <= maxLen) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    const cut = remaining.slice(0, maxLen);
    let pos = cut.lastIndexOf("\n");
    if (pos <= 0) pos = cut.lastIndexOf(" ");
    if (pos <= 0) pos = maxLen;

    chunks.push(remaining.slice(0, pos));
    remaining = remaining.slice(pos).trimStart();
  }

  return chunks;
}

/**
 * Strip markdown inline formatting from text (for table rendering).
 */
function stripMd(s: string): string {
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  s = s.replace(/__(.+?)__/g, "$1");
  s = s.replace(/~~(.+?)~~/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  return s.trim();
}

/**
 * Calculate display width accounting for East Asian wide characters.
 */
function displayWidth(s: string): number {
  let width = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    // CJK Unified Ideographs, CJK Compatibility, Fullwidth Forms, etc.
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * Convert markdown pipe-table to compact aligned text for <pre> display.
 */
function renderTableBox(tableLines: string[]): string {
  const rows: string[][] = [];
  let hasSep = false;

  for (const line of tableLines) {
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map(stripMd);

    if (cells.every((c) => /^:?-+:?$/.test(c.trim()) || !c.trim())) {
      hasSep = true;
      continue;
    }
    rows.push(cells);
  }

  if (rows.length === 0 || !hasSep) return tableLines.join("\n");

  const ncols = Math.max(...rows.map((r) => r.length));
  for (const r of rows) {
    while (r.length < ncols) r.push("");
  }

  const widths: number[] = [];
  for (let c = 0; c < ncols; c++) {
    widths.push(Math.max(...rows.map((r) => displayWidth(r[c]))));
  }

  const drawRow = (cells: string[]): string =>
    cells
      .map((c, i) => c + " ".repeat(widths[i] - displayWidth(c)))
      .join("  ");

  const out = [drawRow(rows[0])];
  out.push(widths.map((w) => "\u2500".repeat(w)).join("  "));
  for (const row of rows.slice(1)) {
    out.push(drawRow(row));
  }

  return out.join("\n");
}

/**
 * Convert Markdown to Telegram-safe HTML.
 *
 * Handles: bold, italic, strikethrough, inline code, code blocks,
 * links, headers (→ plain), blockquotes (→ plain), lists, tables (→ pre).
 *
 * Ported from Python: markdown_to_telegram_html()
 */
export function markdownToTelegramHtml(text: string): string {
  if (!text) return "";

  // Save code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```\w*\n?([\s\S]*?)```/g, (_match, code) => {
    codeBlocks.push(code);
    return `\x00CB${codeBlocks.length - 1}\x00`;
  });

  // Process tables
  const lines = text.split("\n");
  const rebuilt: string[] = [];
  let li = 0;

  while (li < lines.length) {
    if (/^\s*\|.+\|/.test(lines[li])) {
      const tbl: string[] = [];
      while (li < lines.length && /^\s*\|.+\|/.test(lines[li])) {
        tbl.push(lines[li]);
        li++;
      }
      const box = renderTableBox(tbl);
      if (box !== tbl.join("\n")) {
        codeBlocks.push(box);
        rebuilt.push(`\x00CB${codeBlocks.length - 1}\x00`);
      } else {
        rebuilt.push(...tbl);
      }
    } else {
      rebuilt.push(lines[li]);
      li++;
    }
  }
  text = rebuilt.join("\n");

  // Save inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_match, code) => {
    inlineCodes.push(code);
    return `\x00IC${inlineCodes.length - 1}\x00`;
  });

  // Strip headers and blockquotes
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1");
  text = text.replace(/^>\s*(.*)$/gm, "$1");

  // Escape HTML entities
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Convert markdown formatting
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  text = text.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.+?)__/g, "<b>$1</b>");
  text = text.replace(/(?<![a-zA-Z0-9])_([^_]+)_(?![a-zA-Z0-9])/g, "<i>$1</i>");
  text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
  text = text.replace(/^[-*]\s+/gm, "\u2022 ");

  // Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    const escaped = inlineCodes[i]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(`\x00IC${i}\x00`, `<code>${escaped}</code>`);
  }

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    const escaped = codeBlocks[i]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(
      `\x00CB${i}\x00`,
      `<pre><code>${escaped}</code></pre>`,
    );
  }

  return text;
}
