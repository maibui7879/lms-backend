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

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

export function validateEnv(config: Record<string, unknown>): IdentityEnvConfig {
  const required = [
    'DATABASE_URL',
    'JWT_ISSUER',
    'JWT_PUBLIC_KEY',
    'JWT_PRIVATE_KEY',
  ] as const;

  for (const key of required) {
    if (getString(config[key]) === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    NODE_ENV: getString(config.NODE_ENV, 'development'),
    PORT: Number(getString(config.PORT, '3001')),
    DATABASE_URL: getString(config.DATABASE_URL),
    JWT_ISSUER: getString(config.JWT_ISSUER),
    JWT_PUBLIC_KEY: getString(config.JWT_PUBLIC_KEY).replace(/\\n/g, '\n'),
    JWT_PRIVATE_KEY: getString(config.JWT_PRIVATE_KEY).replace(/\\n/g, '\n'),
    ACCESS_TOKEN_TTL_SECONDS: Number(getString(config.ACCESS_TOKEN_TTL_SECONDS, '900')),
    REFRESH_TOKEN_TTL_DAYS: Number(getString(config.REFRESH_TOKEN_TTL_DAYS, '7')),
    SMTP_HOST: getString(config.SMTP_HOST, 'smtp.gmail.com'),
    SMTP_PORT: Number(getString(config.SMTP_PORT, '587')),
    SMTP_USER: getString(config.SMTP_USER),
    SMTP_PASS: getString(config.SMTP_PASS),
    OTP_TTL_MINUTES: Number(getString(config.OTP_TTL_MINUTES, '10')),
  };
}