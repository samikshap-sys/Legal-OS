import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load .env manually
try {
  const env = readFileSync('.env', 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}

const conn = await mysql.createConnection(process.env.DATABASE_URL);
await conn.execute(`CREATE TABLE IF NOT EXISTS \`invoice_download_history\` (
  \`id\` varchar(64) NOT NULL,
  \`requestType\` varchar(20) NOT NULL,
  \`query\` varchar(1024) NOT NULL,
  \`invoiceCount\` int DEFAULT 0,
  \`fileNames\` text DEFAULT NULL,
  \`status\` varchar(20) NOT NULL DEFAULT 'success',
  \`fileKey\` varchar(512) DEFAULT '',
  \`errorMsg\` text,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (\`id\`)
)`);
console.log('invoice_download_history table created (or already exists)');
await conn.end();
