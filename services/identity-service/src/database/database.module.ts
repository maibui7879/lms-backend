import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.getOrThrow<string>('DATABASE_URL');
        const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

        return {
          type: 'postgres' as const,
          url: dbUrl,
          autoLoadEntities: true,
          synchronize: false,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          retryAttempts: 5,
          retryDelay: 2000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}