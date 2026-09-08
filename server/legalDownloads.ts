/**
 * legalDownloads.ts — Postgres-backed data layer for the Downloads repository.
 * Replaces the previously hardcoded template arrays in LegalDashboard.tsx.
 */
import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { lcDownloads } from '../drizzle/schema';

export interface DownloadDoc {
  id: number;
  region: string;
  category: string;
  card_name: string;
  doc_name: string;
  doc_size: string;
  storage_key: string;
  uploaded_by: string;
  uploaded_at: string;
}

function normaliseRow(row: typeof lcDownloads.$inferSelect): DownloadDoc {
  return {
    id:          row.id,
    region:      row.region      ?? '',
    category:    row.category    ?? '',
    card_name:   row.card_name   ?? '',
    doc_name:    row.doc_name    ?? '',
    doc_size:    row.doc_size    ?? '',
    storage_key: row.storage_key ?? '',
    uploaded_by: row.uploaded_by ?? '',
    uploaded_at: row.uploaded_at ?? '',
  };
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function listDownloadDocs(): Promise<DownloadDoc[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(lcDownloads).orderBy(desc(lcDownloads.id));
  return rows.map(normaliseRow);
}

export async function insertDownloadDoc(d: {
  region: string;
  category: string;
  cardName: string;
  docName: string;
  docSize: string;
  storageKey: string;
  uploadedBy: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.insert(lcDownloads).values({
    region:      d.region,
    category:    d.category,
    card_name:   d.cardName,
    doc_name:    d.docName,
    doc_size:    d.docSize,
    storage_key: d.storageKey,
    uploaded_by: d.uploadedBy,
    uploaded_at: new Date().toISOString(),
  });
}

export async function deleteDownloadDoc(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(lcDownloads).where(eq(lcDownloads.id, id));
}
