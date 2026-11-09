// For the sidecar's tests: an in-memory database with the Go migrations applied, as the Go API applies them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from './auth.ts';

const migrationsDir = join(import.meta.dirname, '../../api/internal/db/migrations');

export const testConfig = {
  secret: 'test-secret-0123456789abcdef0123456789',
  baseURL: 'http://localhost:8080',
  trustedOrigins: ['http://localhost:8080', 'http://localhost:5173'],
};

export function migratedDatabase() {
  const db = openDatabase(':memory:');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return db;
}
