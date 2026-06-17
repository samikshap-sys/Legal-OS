import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

const conn = await createConnection(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS gauge_task_templates (
    id int AUTO_INCREMENT NOT NULL,
    ownerEmail varchar(320) NOT NULL,
    name varchar(255) NOT NULL,
    type enum('standard','custom') NOT NULL DEFAULT 'standard',
    columns text NOT NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
  `CREATE TABLE IF NOT EXISTS gauge_tasks (
    id int AUTO_INCREMENT NOT NULL,
    ownerEmail varchar(320) NOT NULL,
    templateId int NOT NULL,
    data text NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'todo',
    position int NOT NULL DEFAULT 0,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
  `CREATE TABLE IF NOT EXISTS gauge_meetings (
    id int AUTO_INCREMENT NOT NULL,
    ownerEmail varchar(320) NOT NULL,
    title varchar(512) NOT NULL,
    startAt bigint NOT NULL,
    endAt bigint NOT NULL,
    location varchar(512) DEFAULT '',
    googleMeetLink varchar(512) DEFAULT '',
    description text,
    momNotes text,
    attendees text NOT NULL,
    docLinks text NOT NULL,
    slackNotified int NOT NULL DEFAULT 0,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  )`,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    const tableName = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
    console.log('✓ Created:', tableName);
  } catch (e) {
    console.error('✗ Error:', e.message);
  }
}

await conn.end();
console.log('Migration complete.');
