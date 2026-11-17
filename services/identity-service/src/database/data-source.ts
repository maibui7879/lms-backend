import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { UserEntity } from '../modules/users/entities/user.entity';
import { RefreshSessionEntity } from '../modules/users/entities/refresh-session.entity';
import { UserAuditEntity } from '../modules/users/entities/user-audit.entity';
import { EmailOtpEntity } from '../modules/auth/entities/email-otp.entity';
import { RoleRequestEntity } from '../modules/users/entities/role-request.entity';
// Tìm .env ở thư mục gốc của identity-service bất kể đang chạy ở src hay dist
dotenv.config({ path: path.resolve(process.cwd(), 'services/identity-service/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('DATABASE_URL is required to run migrations');
}

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

const AppDataSource = new DataSource({
  type: 'postgres',
  url: dbUrl,
  entities: [UserEntity, RefreshSessionEntity, UserAuditEntity, EmailOtpEntity, RoleRequestEntity],
  migrations: [path.resolve(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export default AppDataSource;