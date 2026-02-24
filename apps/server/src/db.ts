import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DEFAULT_COLUMNS } from '@copilot-cli-board/shared';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, '.copilot-cli-board');
const DB_PATH = path.join(DATA_DIR, 'board.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db: BetterSqlite3.Database = new Database(DB_PATH);
db.pragma('journal_mode = DELETE');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    "order" INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    columnId TEXT NOT NULL REFERENCES columns(id),
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    archivedAt TEXT,
    archivedBy TEXT,
    archiveReason TEXT,
    provenance TEXT NOT NULL DEFAULT '{"skillsUsed":[],"instructionsUsed":[],"toolsUsed":[],"agentsInvolved":[]}',
    lastUpdatedBy TEXT
  );

  CREATE TABLE IF NOT EXISTS card_labels (
    cardId TEXT NOT NULL REFERENCES cards(id),
    labelId TEXT NOT NULL REFERENCES labels(id),
    PRIMARY KEY (cardId, labelId)
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    cardId TEXT NOT NULL REFERENCES cards(id),
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL DEFAULT 'system',
    payload TEXT NOT NULL DEFAULT '{}'
  );
`);

// Seed default columns if empty
const colCount = db.prepare('SELECT COUNT(*) as c FROM columns').get() as { c: number };
if (colCount.c === 0) {
  const insert = db.prepare('INSERT OR IGNORE INTO columns (id, name, "order") VALUES (?, ?, ?)');
  for (const col of DEFAULT_COLUMNS) {
    insert.run(crypto.randomUUID(), col.name, col.order);
  }
}

export function uid(): string {
  return crypto.randomUUID();
}

export default db;
