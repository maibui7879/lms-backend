import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

export const learningEnvironmentFile = resolve(__dirname, '../.env');

export function loadLearningEnvironment(): void {
  if (existsSync(learningEnvironmentFile)) {
    loadEnvFile(learningEnvironmentFile);
  }
}
