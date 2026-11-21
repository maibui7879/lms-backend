import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { databaseOptions, envFiles } from '../config';

for (const path of envFiles) if (existsSync(path)) loadEnvFile(path);
const options = databaseOptions({ ...process.env, DB_SYNC: 'false' });
export default new DataSource(options as DataSourceOptions);
