import database from './data-source';
async function migrate(): Promise<void> {
  await database.initialize();
  try {
    // TypeORM creates its migration ledger before executing the first migration.
    await database.query('CREATE SCHEMA IF NOT EXISTS notification');
    await database.runMigrations({ transaction: 'all' });
  } finally {
    await database.destroy();
  }
}
void migrate().catch(() => {
  console.error(
    'Notification migration failed; check database configuration and availability.',
  );
  process.exitCode = 1;
});
