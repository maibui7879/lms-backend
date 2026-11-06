import { seedFailureMessage } from './seed-error';

describe('safe seed diagnostics', () => {
  it('reports placeholder configuration and missing schema action', () => {
    expect(
      seedFailureMessage(
        new Error('DATABASE_URL still contains the HOST placeholder'),
      ),
    ).toContain('HOST placeholder');
    const result = seedFailureMessage({
      driverError: { code: '42P01', message: 'private SQL' },
    });
    expect(result).toContain('DB_SYNC=true');
    expect(result).not.toContain('private SQL');
  });
  it('unwraps network errors without exposing host/password/SQL', () => {
    const secret = 'postgresql://private:password@private-host/db';
    const result = seedFailureMessage({
      cause: { code: 'ENOTFOUND', message: secret },
    });
    expect(result).toContain('[ENOTFOUND]');
    expect(result).not.toContain(secret);
    expect(seedFailureMessage(new Error(secret))).not.toContain(secret);
    expect(
      seedFailureMessage({ code: '__proto__', message: secret }),
    ).not.toContain(secret);
  });
});
