export interface IdentityEnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  JWT_ISSUER: string;
  JWT_PUBLIC_KEY: string;
  JWT_PRIVATE_KEY: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_DAYS: number;
}

export function validateEnv(config: Record<string, unknown>): IdentityEnvConfig {
  const required = [
    'DATABASE_URL',
    'JWT_ISSUER',
    'JWT_PUBLIC_KEY',
    'JWT_PRIVATE_KEY',
  ] as const;

  for (const key of required) {
    if (!config[key] || String(config[key]).trim() === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    NODE_ENV: String(config.NODE_ENV || 'development'),
    PORT: Number(config.PORT || 3001),
    DATABASE_URL: String(config.DATABASE_URL),
    JWT_ISSUER: String(config.JWT_ISSUER),
    JWT_PUBLIC_KEY: String(config.JWT_PUBLIC_KEY).replace(/\\n/g, '\n'),
    JWT_PRIVATE_KEY: String(config.JWT_PRIVATE_KEY).replace(/\\n/g, '\n'),
    ACCESS_TOKEN_TTL_SECONDS: Number(config.ACCESS_TOKEN_TTL_SECONDS || 900),
    REFRESH_TOKEN_TTL_DAYS: Number(config.REFRESH_TOKEN_TTL_DAYS || 7),
  };
}