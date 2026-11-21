export interface IdentityEnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  JWT_ISSUER: string;
  JWT_PUBLIC_KEY: string;
  JWT_PRIVATE_KEY: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_DAYS: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER: string;
  SMTP_PASS: string;
  OTP_TTL_MINUTES: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const required = [
    'DATABASE_URL',
    'JWT_ISSUER',
    'ACCESS_TOKEN_TTL_SECONDS',
    'REFRESH_TOKEN_TTL_DAYS',
    'JWT_PRIVATE_KEY',
    'JWT_PUBLIC_KEY',
    'INTERNAL_JWT_PUBLIC_KEY',
  ];

  for (const key of required) {
    const val = config[key];
    if (val === undefined || val === null || String(val).trim() === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return config;
}
