const configurationErrors = new Set([
  'Invalid NODE_ENV',
  'DATABASE_URL must be a PostgreSQL connection URL',
  'DATABASE_URL still contains the HOST placeholder',
  'DB_SYNC requires development',
  'Mock auth requires development/test',
  'Invalid PORT',
  'DB_SYNC must be true or false',
  'MOCK_AUTH must be true or false',
  'Course seed is development/test only',
]);

const databaseErrors: Record<string, string> = {
  ENOTFOUND:
    'Cannot resolve database host. Replace placeholder HOST with the actual provider host; check DNS.',
  EAI_AGAIN:
    'Database DNS lookup temporarily failed. Check network/DNS and retry.',
  ENETUNREACH:
    'Database network is unreachable. Check IPv6 support; for Supabase on IPv4 use its session pooler URL.',
  ECONNREFUSED:
    'Database connection refused. Check server availability, host and port.',
  ETIMEDOUT:
    'Database connection timed out. Check network access, firewall and provider availability.',
  '28P01':
    'Database authentication failed. Check database username/password and URL-encode special characters in credentials.',
  '3D000':
    'Configured database does not exist. Check the database name in DATABASE_URL.',
  '42P01':
    'Course table is missing. Prepare the schema first; only for a disposable development DB, opt in with DB_SYNC=true.',
  '42501':
    'Database permission denied. Check schema/table privileges for the configured role.',
  SELF_SIGNED_CERT_IN_CHAIN:
    'TLS certificate chain is not trusted. Configure the provider CA; do not disable certificate verification.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    'TLS certificate verification failed. Configure the provider CA.',
  CERT_HAS_EXPIRED:
    'Database TLS certificate has expired. Check the certificate chain and system clock.',
};

/** Never print arbitrary driver messages, SQL, connection strings or credentials. */
export function seedFailureMessage(error: unknown): string {
  const queue: unknown[] = [error];
  for (let i = 0; i < queue.length && i < 8; i++) {
    const item = queue[i];
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.message === 'string' && configurationErrors.has(row.message))
      return `Course seed failed: ${row.message}`;
    if (typeof row.code === 'string' && Object.hasOwn(databaseErrors, row.code))
      return `Course seed failed [${row.code}]: ${databaseErrors[row.code]}`;
    queue.push(row.driverError, row.cause);
    if (Array.isArray(row.errors)) queue.push(...row.errors);
  }
  return 'Course seed failed: unexpected configuration/storage error. Verify development settings, connectivity and schema; credentials and SQL have been omitted.';
}
