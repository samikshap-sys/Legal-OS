import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('DESCRIBE `invoice_expo_history`');
console.log('invoice_expo_history columns:', rows.map(r => r.Field).join(', '));
await conn.end();
