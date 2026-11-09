// @vitest-environment node
// One source of truth for the auth tables: the Go migrations. This checks that, applied in order, they give the
// schema Better Auth 1.x expects, so that a Better Auth upgrade that changes it fails here, not in production.
import { describe, expect, it } from 'vitest';
import { authOptions, openDatabase, schemaDrift } from './auth.ts';
import { migratedDatabase, testConfig } from './test-db.ts';

describe('the Go migrations', () => {
  it('create exactly the tables Better Auth expects', async () => {
    expect(await schemaDrift(authOptions(testConfig, migratedDatabase()))).toEqual([]);
  });

  it('are what the sidecar checks against: an empty database drifts', async () => {
    const drift = await schemaDrift(authOptions(testConfig, openDatabase(':memory:')));
    expect(drift).toEqual(expect.arrayContaining(['missing table user', 'missing table session']));
  });
});
