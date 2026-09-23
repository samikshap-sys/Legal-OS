/**
 * nexusOneDocs.ts — Postgres-backed signed-document uploads for the Nexus
 * One tab. The tab's other data (Brand Name, Status columns) comes live from
 * a Google Sheet with no stable row id, so uploaded docs are keyed by the
 * brand name itself.
 */
import { getDb } from './db';
import { lcNexusOneDocs } from '../drizzle/schema';

export interface NexusOneDoc {
  brandName: string;
  signedDocKey: string;
  signedDocName: string;
  uploadedBy: string;
  uploadedAt: string;
}

export async function getNexusOneDocsByBrand(): Promise<Record<string, NexusOneDoc>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(lcNexusOneDocs);
  const byBrand: Record<string, NexusOneDoc> = {};
  for (const row of rows) {
    if (!row.signed_doc_key) continue;
    byBrand[row.brand_name] = {
      brandName:     row.brand_name,
      signedDocKey:  row.signed_doc_key ?? '',
      signedDocName: row.signed_doc_name ?? '',
      uploadedBy:    row.uploaded_by ?? '',
      uploadedAt:    row.uploaded_at ?? '',
    };
  }
  return byBrand;
}

export async function upsertNexusOneDoc(d: {
  brandName: string;
  signedDocKey: string;
  signedDocName: string;
  uploadedBy: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db
    .insert(lcNexusOneDocs)
    .values({
      brand_name:      d.brandName,
      signed_doc_key:  d.signedDocKey,
      signed_doc_name: d.signedDocName,
      uploaded_by:     d.uploadedBy,
      uploaded_at:     new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: lcNexusOneDocs.brand_name,
      set: {
        signed_doc_key:  d.signedDocKey,
        signed_doc_name: d.signedDocName,
        uploaded_by:     d.uploadedBy,
        uploaded_at:     new Date().toISOString(),
      },
    });
}
