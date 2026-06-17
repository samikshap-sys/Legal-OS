import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`pipeline_history\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`status\` varchar(20) NOT NULL DEFAULT 'running',
      \`jobType\` varchar(64) NOT NULL,
      \`executionMode\` varchar(32) NOT NULL,
      \`query\` varchar(1024) NOT NULL DEFAULT '—',
      \`invocationId\` varchar(512) DEFAULT '',
      \`runRef\` varchar(1024) DEFAULT '',
      \`errorMsg\` text,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`pipeline_history_id\` PRIMARY KEY(\`id\`)
    )
  `);
  console.log("✓ pipeline_history table created");
} finally {
  await conn.end();
}
