import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import url from 'url';
import { pool } from '../src/db.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS migrations (
    id text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz DEFAULT now()
  )`);
}

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

async function getApplied() {
  const res = await pool.query('SELECT id, checksum FROM migrations');
  const map = new Map();
  for (const row of res.rows) map.set(row.id, row.checksum);
  return map;
}

async function applyMigration(id, sql) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO migrations (id, checksum) VALUES ($1, $2)', [id, sha256(sql)]);
    await client.query('COMMIT');
    console.log('Applied', id);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed', id, e);
    throw e;
  } finally {
    client.release();
  }
}

async function run() {
  await ensureMigrationsTable();
  const applied = await getApplied();
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const id = file;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const sum = sha256(sql);
    if (applied.get(id) === sum) continue;
    if (applied.has(id) && applied.get(id) !== sum) {
      throw new Error(`Checksum mismatch for ${id}`);
    }
    await applyMigration(id, sql);
  }
  console.log('Migrations complete');
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
