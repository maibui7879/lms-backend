import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { UserEntity } from '../modules/users/entities/user.entity';
import { UserAuditEntity } from '../modules/users/entities/user-audit.entity';
import { EmailOtpEntity } from '../modules/auth/entities/email-otp.entity';
import { RoleRequestEntity } from '../modules/users/entities/role-request.entity';
import { RefreshTokenEntity } from '../modules/auth/entities/refresh-token.entity';


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
  entities: [UserEntity, UserAuditEntity, EmailOtpEntity, RoleRequestEntity,RefreshTokenEntity],
  migrations: [path.resolve(__dirname, 'migrations/*{.ts,.js}')],
  synchronize: false,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export default AppDataSource;