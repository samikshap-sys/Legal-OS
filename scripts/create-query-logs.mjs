import mysql from "mysql2/promise";
import { config } from "dotenv";
config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`query_logs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`query\` text NOT NULL,
      \`queryType\` varchar(20) NOT NULL DEFAULT 'OTHER',
      \`tables\` text,
      \`rowCount\` int DEFAULT 0,
      \`elapsed\` varchar(20) DEFAULT '',
      \`runAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \`query_logs_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("query_logs table created (or already exists)");
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await conn.end();
}
