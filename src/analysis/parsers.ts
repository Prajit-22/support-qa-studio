/**
 * Import support conversations from common export formats.
 *
 * All parsing is local and deterministic - nothing leaves the browser.
 * Supported:
 *  - WhatsApp .txt chat export (both iOS "[date, time] Name: msg" and
 *    Android "date, time - Name: msg" shapes, 12h and 24h clocks)
 *  - JSON: [{ sender: "customer"|"agent"|"user"|"ai", text|message, timestamp? }]
 *    or the PCA API shape { messages: [...] }, or a list of conversations
 *  - CSV: sender,text(,timestamp) rows with a header line
 *
 * WhatsApp exports name participants, so the importer asks the caller to
 * map names to roles (see detectSpeakers / applyRoleMap).
 */

import type { Conversation, Message, Sender } from './types';
export type { Sender };

export interface ParsedConversation {
  title: string;
  messages: Array<Message & { author?: string }>;
}

export interface ParseResult {
  conversations: ParsedConversation[];
  warnings: string[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toSender(raw: string): Sender | null {
  const s = raw.trim().toLowerCase();
  if (s === 'customer' || s === 'user' || s === 'client') return 'customer';
  if (s === 'agent' || s === 'ai' || s === 'support' || s === 'bot') return 'agent';
  return null;
}

// ------------------------------------------------------------------- JSON

export function parseJson(text: string): ParseResult {
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { conversations: [], warnings: ['Not valid JSON.'] };
  }

  const asMessages = (arr: unknown[]): Message[] => {
    const out: Message[] = [];
    for (const item of arr) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      const sender = toSender(String(rec.sender ?? rec.role ?? ''));
      const body = String(rec.text ?? rec.message ?? '').trim();
      if (!sender || !body) continue;
      const msg: Message = { sender, text: body };
      if (typeof rec.timestamp === 'string' && rec.timestamp) msg.timestamp = rec.timestamp;
      out.push(msg);
    }
    return out;
  };

  const conversations: ParsedConversation[] = [];
  if (Array.isArray(data)) {
    // Either one conversation (array of messages) or many (array of {messages}).
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0]) && ('messages' in (data[0] as object))) {
      for (const conv of data as Array<Record<string, unknown>>) {
        const msgs = asMessages((conv.messages as unknown[]) ?? []);
        if (msgs.length > 0) {
          conversations.push({ title: String(conv.title ?? `Conversation ${conversations.length + 1}`), messages: msgs });
        }
      }
    } else {
      const msgs = asMessages(data);
      if (msgs.length > 0) conversations.push({ title: 'Imported conversation', messages: msgs });
    }
  } else if (typeof data === 'object' && data !== null && 'messages' in (data as object)) {
    const conv = data as Record<string, unknown>;
    const msgs = asMessages((conv.messages as unknown[]) ?? []);
    if (msgs.length > 0) conversations.push({ title: String(conv.title ?? 'Imported conversation'), messages: msgs });
  }

  if (conversations.length === 0) warnings.push('No messages with sender "customer"/"agent" (or "user"/"ai") and text found.');
  return { conversations, warnings };
}

// -------------------------------------------------------------------- CSV

export function parseCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { conversations: [], warnings: ['CSV needs a header and at least one row.'] };

  const splitRow = (row: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQuotes && row[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const si = header.findIndex((h) => ['sender', 'role', 'from'].includes(h));
  const ti = header.findIndex((h) => ['text', 'message', 'body'].includes(h));
  const tsi = header.findIndex((h) => ['timestamp', 'time', 'date', 'at'].includes(h));
  if (si === -1 || ti === -1) {
    return { conversations: [], warnings: ['CSV header needs sender and text columns.'] };
  }
  const messages: Message[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cols = splitRow(line);
    const sender = toSender(cols[si] ?? '');
    const body = (cols[ti] ?? '').trim();
    if (!sender || !body) {
      skipped += 1;
      continue;
    }
    const msg: Message = { sender, text: body };
    if (tsi !== -1 && cols[tsi]) msg.timestamp = cols[tsi];
    messages.push(msg);
  }
  if (skipped > 0) warnings.push(`${skipped} row${skipped === 1 ? '' : 's'} skipped (unknown sender or empty text).`);
  if (messages.length === 0) return { conversations: [], warnings };
  return { conversations: [{ title: 'Imported conversation (CSV)', messages }], warnings };
}

// --------------------------------------------------------------- WhatsApp

const WA_PATTERNS: Array<{ re: RegExp; groups: { date: number; time: number; author: number; text: number } }> = [
  // iOS: [12/05/24, 9:41:02 AM] Name: message
  { re: /^\[(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s+([^:]+?):\s(.*)$/, groups: { date: 1, time: 2, author: 3, text: 4 } },
  // Android: 12/05/24, 09:41 - Name: message
  { re: /^(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s+-\s+([^:]+?):\s(.*)$/, groups: { date: 1, time: 2, author: 3, text: 4 } },
];

export interface WhatsAppParse {
  /** author name -> their lines */
  speakers: Map<string, string[]>;
  /** ordered raw turns */
  turns: Array<{ author: string; text: string; timestamp?: string }>;
  warnings: string[];
}

function waTimestamp(date: string, time: string): string | undefined {
  const dparts = date.split(/[/.]/).map((x) => parseInt(x, 10));
  if (dparts.length !== 3 || dparts.some(Number.isNaN)) return undefined;
  let [a, b, y] = dparts;
  if (y < 100) y += 2000;
  // WhatsApp exports are locale dependent; day-first is the common export
  // for most locales. If day > 12 it is unambiguous; otherwise keep day-first.
  const day = a > 12 ? a : a; // day-first assumption
  const month = b;
  if (day > 31 || month > 12) return undefined;
  const m = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?/);
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = m[3] ? parseInt(m[3], 10) : 0;
  const ampm = m[4]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(Date.UTC(y, month - 1, day, h, min, s));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseWhatsApp(text: string): WhatsAppParse {
  const warnings: string[] = [];
  const turns: WhatsAppParse['turns'] = [];
  const systemLines = [/^messages and calls are end-to-end encrypted/i, /created group/i, /added you/i];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    let matched = false;
    for (const { re, groups } of WA_PATTERNS) {
      const m = rawLine.match(re);
      if (!m) continue;
      matched = true;
      const author = m[groups.author].trim();
      const body = m[groups.text].trim();
      if (systemLines.some((s) => s.test(body))) break;
      turns.push({
        author,
        text: body,
        timestamp: waTimestamp(m[groups.date], m[groups.time]),
      });
      break;
    }
    if (!matched && turns.length > 0) {
      // Continuation line (multi-line message)
      turns[turns.length - 1].text += '\n' + rawLine.trim();
    }
  }
  if (turns.length === 0) {
    warnings.push('No WhatsApp message lines found. Export a chat without media and upload the .txt file.');
  }
  const speakers = new Map<string, string[]>();
  for (const t of turns) {
    const arr = speakers.get(t.author) ?? [];
    if (arr.length < 3) arr.push(t.text);
    speakers.set(t.author, arr);
  }
  return { speakers, turns, warnings };
}

/** Map WhatsApp speaker names to roles and produce the final message list. */
export function applyRoleMap(
  turns: WhatsAppParse['turns'],
  roleMap: Record<string, Sender>,
): Message[] {
  return turns
    .filter((t) => roleMap[t.author])
    .map((t) => {
      const msg: Message = { sender: roleMap[t.author], text: t.text, author: t.author };
      if (t.timestamp) msg.timestamp = t.timestamp;
      return msg;
    });
}

// -------------------------------------------------------------- dispatcher

export type ImportFormat = 'whatsapp' | 'json' | 'csv' | 'unknown';

export function detectFormat(filename: string, text: string): ImportFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.txt')) {
    const wa = parseWhatsApp(text);
    if (wa.turns.length > 0) return 'whatsapp';
    return 'unknown';
  }
  // sniff content
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  const wa = parseWhatsApp(text);
  if (wa.turns.length > 0) return 'whatsapp';
  if (trimmed.includes(',')) return 'csv';
  return 'unknown';
}

export function toConversation(parsed: ParsedConversation, source: string): Conversation {
  return { id: uid(), title: parsed.title, source, messages: parsed.messages };
    }
