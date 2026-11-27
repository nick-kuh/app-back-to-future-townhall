// Banco de dados SQLite (node:sqlite, sem dependências nativas).
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'townhall.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  wl TEXT DEFAULT '',
  team TEXT DEFAULT '',
  manager TEXT DEFAULT '',
  area TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  checked_in_at TEXT,
  token TEXT,
  form_json TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  era TEXT DEFAULT 'presente',
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  members TEXT NOT NULL,
  queue TEXT NOT NULL DEFAULT '[]',
  position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS seen (
  person_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  round INTEGER,
  PRIMARY KEY (person_id, question_id)
);
CREATE TABLE IF NOT EXISTS rankings (
  person_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  submitted_at TEXT,
  PRIMARY KEY (person_id, round)
);
CREATE TABLE IF NOT EXISTS results (
  person_id INTEGER PRIMARY KEY,
  match_id INTEGER,
  mutual INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS words (
  person_id INTEGER PRIMARY KEY,
  w1 TEXT NOT NULL,
  w2 TEXT DEFAULT '',
  at TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER UNIQUE,
  rating INTEGER NOT NULL,
  liked TEXT DEFAULT '',
  improve TEXT DEFAULT '',
  anonymous INTEGER DEFAULT 0,
  at TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  person_id INTEGER PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  version TEXT NOT NULL,
  updated_at TEXT
);
`);

// Perguntas das Conexões também em espanhol (quem escolhe "Español" no login vê a mesma pergunta no seu idioma)
if (!db.prepare('PRAGMA table_info(questions)').all().some(c => c.name === 'text_es')) db.exec("ALTER TABLE questions ADD COLUMN text_es TEXT DEFAULT ''");

function kvGet(key, fallback = null) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
function kvSet(key, value) {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

function seedIfEmpty() {
  const nPeople = db.prepare('SELECT COUNT(*) AS n FROM people').get().n;
  if (nPeople === 0) {
    const people = require('./seed/people');
    const ins = db.prepare('INSERT INTO people (name, email, wl, team, manager, area, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const p of people) ins.run(p.name, p.email, p.wl, p.team, p.manager, p.area, p.sort_order);
  }
  const nQ = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (nQ === 0) resetQuestions();
}

function resetQuestions() {
  const questions = require('./seed/questions');
  db.exec('DELETE FROM questions');
  const ins = db.prepare('INSERT INTO questions (text, text_es, era, sort_order) VALUES (?, ?, ?, ?)');
  for (const q of questions) ins.run(q.text, q.es || '', q.cat, q.sort_order); // a coluna "era" guarda a categoria da pergunta
}
// "Época" do banco: um código sorteado quando o banco nasce. Se o servidor reinicia com o banco zerado (no plano
// gratuito do Render isso acontece), o código muda e os celulares sabem que precisam refazer o próprio check-in sozinhos.
function dbEpoch() {
  let e = kvGet('epoch', null);
  if (typeof e !== 'string' || !e) { e = require('crypto').randomBytes(6).toString('hex'); kvSet('epoch', e); }
  return e;
}

module.exports = { db, kvGet, kvSet, seedIfEmpty, resetQuestions, dbEpoch, DB_PATH, DATA_DIR };
