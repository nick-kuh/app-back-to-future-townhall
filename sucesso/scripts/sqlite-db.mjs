// Local development/test implementation of the D1 methods used by the Worker.
// Never imported by the hosted Worker or included in its deployment bundle.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = fileURLToPath(new URL('../drizzle/', import.meta.url));

export function openDatabase(filename = ':memory:') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY NOT NULL)');
  for (const name of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()) {
    if (sqlite.prepare('SELECT name FROM __local_migrations WHERE name = ?').get(name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
      sqlite.prepare('INSERT INTO __local_migrations(name) VALUES (?)').run(name);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      sqlite.close();
      throw error;
    }
  }

  class Statement {
    constructor(sql) { this.statement = sqlite.prepare(sql); this.parameters = []; }
    bind(...parameters) { this.parameters = parameters; return this; }
    first(columnName) {
      const row = this.statement.get(...this.parameters);
      if (row === undefined) return null;
      return columnName === undefined ? row : row[columnName];
    }
    all() { return { success: true, results: this.statement.all(...this.parameters), meta: {} }; }
    run() {
      const result = this.statement.run(...this.parameters);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    }
    execute() { return this.statement.columns().length ? this.all() : this.run(); }
  }

  return {
    prepare(sql) { return new Statement(sql); },
    batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
}
