// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readConfig } from './config.ts';

const env = {
  BETTER_AUTH_SECRET: 's3cret-0123456789abcdef0123456789',
  BETTER_AUTH_URL: 'https://app.example',
  BETTER_AUTH_TRUSTED_ORIGINS: 'https://app.example, http://localhost:5173',
  DATABASE_PATH: '/data/brandy.db',
  AUTH_PORT: '8081',
};

describe('readConfig', () => {
  it('reads what the Go API passes', () => {
    expect(readConfig(env)).toEqual({
      secret: env.BETTER_AUTH_SECRET,
      baseURL: 'https://app.example',
      trustedOrigins: ['https://app.example', 'http://localhost:5173'],
      databasePath: '/data/brandy.db',
      port: 8081,
    });
  });

  it('refuses to start without the secret, or on its own', () => {
    expect(() => readConfig({ ...env, BETTER_AUTH_SECRET: '' })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => readConfig({})).toThrow(/run the API/);
    expect(() => readConfig({ ...env, AUTH_PORT: 'http' })).toThrow(/not a port/);
  });
});
