/**
 * Persisted chat conversations.
 *
 * One JSON file per conversation under `userData/chats/`, rather than a single
 * index file: conversations are written on every turn, and a per-file layout
 * means a corrupt or half-written file costs one conversation instead of the
 * whole history.
 */
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import type { AiChatMessage, ChatConversation, ChatConversationSummary } from '../../shared/types';

/** Conversations kept on disk; the oldest are pruned past this. */
const MAX_CONVERSATIONS = 200;

function chatsDir(): string {
  return path.join(app.getPath('userData'), 'chats');
}

/** Rejects ids that could escape the chats directory. */
function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,120}$/.test(id) && !id.startsWith('.');
}

function conversationPath(id: string): string {
  return path.join(chatsDir(), `${id}.json`);
}

/** Derives a readable title from the first thing the user said. */
function deriveTitle(conversation: ChatConversation): string {
  const firstUser = conversation.messages.find((m: AiChatMessage) => m.role === 'user');
  const raw = (firstUser?.text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'New conversation';
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

export async function listConversations(): Promise<ChatConversationSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(chatsDir());
  } catch {
    return []; // No history yet.
  }

  const summaries: ChatConversationSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(chatsDir(), entry), 'utf-8');
      const parsed = JSON.parse(raw) as ChatConversation;
      if (!parsed?.id || !Array.isArray(parsed.messages)) continue;
      summaries.push({
        id: parsed.id,
        title: parsed.title || deriveTitle(parsed),
        updatedAt: parsed.updatedAt ?? 0,
        messageCount: parsed.messages.length,
      });
    } catch {
      // Skip unreadable files rather than failing the whole listing.
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadConversation(id: string): Promise<ChatConversation | null> {
  if (!isSafeId(id)) return null;
  try {
    const raw = await fs.readFile(conversationPath(id), 'utf-8');
    const parsed = JSON.parse(raw) as ChatConversation;
    return parsed?.id && Array.isArray(parsed.messages) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveConversation(conversation: ChatConversation): Promise<ChatConversation> {
  if (!isSafeId(conversation.id)) {
    throw new Error(`Invalid conversation id: ${conversation.id}`);
  }

  const record: ChatConversation = {
    ...conversation,
    title: conversation.title?.trim() || deriveTitle(conversation),
    updatedAt: Date.now(),
    createdAt: conversation.createdAt || Date.now(),
  };

  await fs.mkdir(chatsDir(), { recursive: true });

  // Write to a temp file and rename, so a crash mid-write cannot leave a
  // truncated conversation behind.
  const target = conversationPath(record.id);
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(record, null, 2), 'utf-8');
  await fs.rename(temp, target);

  await pruneOldConversations();
  return record;
}

export async function deleteConversation(id: string): Promise<boolean> {
  if (!isSafeId(id)) return false;
  try {
    await fs.unlink(conversationPath(id));
    return true;
  } catch {
    return false;
  }
}

export async function clearConversations(): Promise<number> {
  const summaries = await listConversations();
  let removed = 0;
  for (const summary of summaries) {
    if (await deleteConversation(summary.id)) removed += 1;
  }
  return removed;
}

async function pruneOldConversations(): Promise<void> {
  const summaries = await listConversations();
  if (summaries.length <= MAX_CONVERSATIONS) return;
  for (const stale of summaries.slice(MAX_CONVERSATIONS)) {
    await deleteConversation(stale.id);
  }
}
