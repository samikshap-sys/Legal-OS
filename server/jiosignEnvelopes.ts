/**
 * jiosignEnvelopes.ts — Postgres-backed record of documents sent through
 * JioSign, tracked so the JioSign tab has its own document list/repository
 * independent of what JioSign's hosted UI shows.
 */
import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { lcJiosignEnvelopes } from '../drizzle/schema';

export interface JioSignEnvelope {
  id: number;
  groupId: string;
  documentName: string;
  message: string;
  participantsJson: string;
  actionToken: string;
  status: string;
  errorMessage: string;
  signedDocKey: string;
  signedDocName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function normaliseRow(row: typeof lcJiosignEnvelopes.$inferSelect): JioSignEnvelope {
  return {
    id:                row.id,
    groupId:           row.group_id ?? '',
    documentName:      row.document_name ?? '',
    message:           row.message ?? '',
    participantsJson:  row.participants_json ?? '[]',
    actionToken:       row.action_token ?? '',
    status:            row.status ?? 'draft',
    errorMessage:      row.error_message ?? '',
    signedDocKey:      row.signed_doc_key ?? '',
    signedDocName:     row.signed_doc_name ?? '',
    createdBy:         row.created_by ?? '',
    createdAt:         row.created_at ?? '',
    updatedAt:         row.updated_at ?? '',
  };
}

export async function listJioSignEnvelopes(): Promise<JioSignEnvelope[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(lcJiosignEnvelopes).orderBy(desc(lcJiosignEnvelopes.id));
  return rows.map(normaliseRow);
}

export async function getJioSignEnvelope(id: number): Promise<JioSignEnvelope | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(lcJiosignEnvelopes).where(eq(lcJiosignEnvelopes.id, id)).limit(1);
  return rows[0] ? normaliseRow(rows[0]) : null;
}

export async function insertDraftEnvelope(d: {
  documentName: string;
  message: string;
  participantsJson: string;
  createdBy: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const now = new Date().toISOString();
  const rows = await db.insert(lcJiosignEnvelopes).values({
    document_name:     d.documentName,
    message:           d.message,
    participants_json: d.participantsJson,
    status:            'draft',
    created_by:        d.createdBy,
    created_at:        now,
    updated_at:        now,
  }).returning({ id: lcJiosignEnvelopes.id });
  return rows[0].id;
}

export async function updateEnvelope(id: number, patch: Partial<{
  groupId: string;
  actionToken: string;
  status: string;
  errorMessage: string;
  signedDocKey: string;
  signedDocName: string;
}>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.groupId       !== undefined) set.group_id        = patch.groupId;
  if (patch.actionToken   !== undefined) set.action_token    = patch.actionToken;
  if (patch.status        !== undefined) set.status          = patch.status;
  if (patch.errorMessage  !== undefined) set.error_message   = patch.errorMessage;
  if (patch.signedDocKey  !== undefined) set.signed_doc_key  = patch.signedDocKey;
  if (patch.signedDocName !== undefined) set.signed_doc_name = patch.signedDocName;
  await db.update(lcJiosignEnvelopes).set(set).where(eq(lcJiosignEnvelopes.id, id));
}
