import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _schemaEnsured = false;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  if (_db && !_schemaEnsured) {
    _schemaEnsured = true;
    await ensureLegalSchema(_db);
  }
  return _db;
}

/**
 * The live lc_requests table has drifted from drizzle/schema.ts in the past
 * (columns provisioned outside of drizzle-kit migrations), and this
 * environment has no working drizzle-kit CLI/DATABASE_URL access to run
 * `db:push` against production. New columns are instead added here as
 * idempotent, additive DDL that runs once when the live server (which does
 * have DATABASE_URL) boots up.
 */
async function ensureLegalSchema(db: ReturnType<typeof drizzle>) {
  try {
    await db.execute(sql`ALTER TABLE lc_requests ADD COLUMN IF NOT EXISTS deal_value numeric(14,2)`);
    await db.execute(sql`ALTER TABLE lc_requests ADD COLUMN IF NOT EXISTS signed_doc_key text`);
    await db.execute(sql`ALTER TABLE lc_requests ADD COLUMN IF NOT EXISTS signed_doc_name varchar(255)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lc_downloads (
        id SERIAL PRIMARY KEY,
        region VARCHAR(32) NOT NULL,
        category VARCHAR(32) NOT NULL,
        card_name VARCHAR(255) NOT NULL,
        doc_name VARCHAR(255) NOT NULL,
        doc_size VARCHAR(32) NOT NULL DEFAULT '',
        storage_key TEXT NOT NULL,
        uploaded_by VARCHAR(320) NOT NULL DEFAULT '',
        uploaded_at VARCHAR(64) NOT NULL DEFAULT ''
      )
    `);

    // One-time seed of the India KYC docs that already work today (real
    // /manus-storage/ keys) so the admin-managed repository doesn't start
    // empty. The India Agreement entries are dropped intentionally — their
    // old "legal-templates/..." paths were already dead links.
    const existing = await db.execute(sql`SELECT COUNT(*)::int AS count FROM lc_downloads`);
    const count = Number((existing.rows[0] as { count: number } | undefined)?.count ?? 0);
    if (count === 0) {
      const seedNow = new Date().toISOString();
      const kycDocs: Array<[string, string, string]> = [
        ['COI_SRTL.pdf', '412 KB', 'COI_SRTLpdf_3aab0537.pdf'],
        ['List of Directors.docx', '3.3 MB', 'ListofDirectors_54b56c76.docx'],
        ['MOA_SRTL.pdf', '278 KB', 'MOA_SRTL_79a5d8bf.pdf'],
        ['List of Shareholders (Revised).docx', '166 KB', 'ListofShareholder_Revised_5db1bf71.docx'],
        ['AOA_SRTL.pdf', '497 KB', 'AOA_SRTL_73b25a10.pdf'],
      ];
      for (const [docName, docSize, storageKey] of kycDocs) {
        await db.execute(sql`
          INSERT INTO lc_downloads (region, category, card_name, doc_name, doc_size, storage_key, uploaded_by, uploaded_at)
          VALUES ('india', 'kyc', 'KYC Documents / Licenses / Certificates', ${docName}, ${docSize}, ${storageKey}, 'Migrated from static list', ${seedNow})
        `);
      }
    }
  } catch (error) {
    console.warn("[Database] ensureLegalSchema failed:", error);
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
