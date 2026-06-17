import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`invoice_expo_history\` (
      \`id\` varchar(64) NOT NULL,
      \`monthYear\` varchar(10) NOT NULL,
      \`status\` varchar(20) NOT NULL DEFAULT 'running',
      \`pdfCount\` int DEFAULT 0,
      \`errorMsg\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`invoice_expo_history_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log('✓ invoice_expo_history table created (or already exists)');
} catch (err) {
  console.error('✗ Error:', err.message);
} finally {
  await conn.end();
}
