import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { DataSource } from 'typeorm';
import { databaseOptions, envFiles } from '../config';
for (const path of envFiles) if (existsSync(path)) loadEnvFile(path);
export default new DataSource(databaseOptions(process.env));
