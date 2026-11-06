import { databaseOptions, validateEnvironment } from './config';

describe('Course environment', () => {
  const base = {
    DATABASE_URL: 'postgresql://local:local@127.0.0.1:5432/course_test',
    NODE_ENV: 'development',
  };
  it('keeps schema sync disabled unless explicitly enabled in development', () => {
    expect(databaseOptions(base).synchronize).toBe(false);
    expect(databaseOptions({ ...base, DB_SYNC: 'true' }).synchronize).toBe(
      true,
    );
    for (const NODE_ENV of ['production', 'staging', 'test'])
      expect(() =>
        validateEnvironment({ ...base, NODE_ENV, DB_SYNC: 'true' }),
      ).toThrow();
  });
  it('rejects unsafe mock flags, invalid config and preserves provider SSL URL', () => {
    for (const NODE_ENV of ['production', 'staging'])
      expect(() =>
        validateEnvironment({ ...base, NODE_ENV, MOCK_AUTH: 'true' }),
      ).toThrow();
    for (const bad of [
      { DATABASE_URL: '' },
      { DATABASE_URL: 'postgresql://USER:PASSWORD@HOST:5432/course' },
      { DATABASE_URL: 'https://example.test' },
      { PORT: '123x' },
      { DB_SYNC: 'yes' },
    ])
      expect(() => validateEnvironment({ ...base, ...bad })).toThrow();
    const DATABASE_URL = base.DATABASE_URL + '?sslmode=verify-full';
    expect(databaseOptions({ ...base, DATABASE_URL }).url).toBe(DATABASE_URL);
  });
});
