// The auth sidecar: Better Auth behind a plain Node HTTP server on 127.0.0.1. The Go API starts it, restarts it if
// it dies, and proxies /api/auth/* to it (api/internal/sidecar, api/internal/server/proxy.go).
import { toNodeHandler } from 'better-auth/node';
import { createServer } from 'node:http';
import { authOptions, createAuth, openDatabase, schemaDrift } from './auth.ts';
import { readConfig } from './config.ts';

const config = readConfig(process.env);
const db = openDatabase(config.databasePath);

// The schema comes from the Go migrations; refuse to run on one that Better Auth does not expect.
const drift = await schemaDrift(authOptions(config, db));
if (drift.length > 0) {
  console.error(
    `auth sidecar: the database schema does not match Better Auth: ${drift.join('; ')}. ` +
      'Add a Go migration in api/internal/db/migrations/ (see web/server/schema.test.ts).',
  );
  process.exit(1);
}

const handle = toNodeHandler(createAuth(config, db));
const server = createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    console.error('auth sidecar: request failed', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"internal server error"}');
  });
});
server.listen(config.port, '127.0.0.1', () => {
  console.log(JSON.stringify({ level: 'INFO', msg: 'auth sidecar listening', port: config.port }));
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
