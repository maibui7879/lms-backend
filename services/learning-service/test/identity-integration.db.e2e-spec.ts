import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { spawn, execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { IdentityClient } from '../src/integrations/identity.client';
import { createLearningDataSource } from '../src/database/learning-database';
import { identityKeys, serviceKeys } from './fixtures/identity-auth';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const run = promisify(execFile);

suite(
  'Learning integrated with the actual Identity login and PostgreSQL',
  () => {
    let identity: ChildProcess | undefined;
    let admin: DataSource | undefined;
    let identityDb: DataSource | undefined;
    let learningDb: DataSource | undefined;
    let app: INestApplication | undefined;
    let databaseCreated = false;
    let accessToken = '';
    const databaseName = `learning_identity_${randomUUID().replaceAll('-', '')}_test`;
    const user = providers.identity.studentB;
    const displayName = 'Nguyễn Văn Học';
    const password = 'Identity-test-only-2026!';
    const original = { ...process.env };

    beforeAll(async () => {
      const local = new URL(databaseUrl!);
      if (
        !['localhost', '127.0.0.1'].includes(local.hostname) ||
        !local.pathname.endsWith('_test')
      )
        throw new Error('Use a local *_test PostgreSQL database');
      admin = new DataSource({ type: 'postgres', url: databaseUrl });
      await admin.initialize();
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      databaseCreated = true;
      local.pathname = '/' + databaseName;
      const identityDatabaseUrl = local.toString();

      const reservation = createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const port = (reservation.address() as { port: number }).port;
      await new Promise<void>((resolve) => reservation.close(() => resolve()));
      const identityUrl = `http://127.0.0.1:${port}`;
      const environment = {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DATABASE_URL: identityDatabaseUrl,
        JWT_ISSUER: 'identity-service',
        JWT_PUBLIC_KEY: identityKeys.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
        JWT_PRIVATE_KEY: identityKeys.privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        INTERNAL_JWT_PUBLIC_KEY: serviceKeys.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
        ACCESS_TOKEN_TTL_SECONDS: '900',
        REFRESH_TOKEN_TTL_DAYS: '7',
      };
      await run(
        process.execPath,
        [
          resolve(__dirname, '../../../node_modules/typeorm/cli.js'),
          'migration:run',
          '-d',
          resolve(
            __dirname,
            '../../identity-service/dist/database/data-source.js',
          ),
        ],
        { env: environment, windowsHide: true },
      );
      identityDb = new DataSource({
        type: 'postgres',
        url: identityDatabaseUrl,
      });
      await identityDb.initialize();
      const passwordHash = await argon2.hash(password);
      await identityDb.query(
        'INSERT INTO users (id, email, password_hash, display_name, role, status, email_verified_at) VALUES ($1, $2, $3, $4, $5, $6, now())',
        [
          user.id,
          user.email.toLowerCase(),
          passwordHash,
          displayName,
          'STUDENT',
          'ACTIVE',
        ],
      );
      identity = spawn(
        process.execPath,
        [resolve(__dirname, '../../identity-service/dist/main.js')],
        {
          env: environment,
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      let ready = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (identity.exitCode !== null)
          throw new Error('Identity exited during startup');
        try {
          const response = await fetch(
            identityUrl + '/api/v1/auth/public-key',
            { signal: AbortSignal.timeout(1000) },
          );
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          /* Wait for Identity's database connection and HTTP listener. */
        }
        await delay(200);
      }
      if (!ready) throw new Error('Identity did not become ready');
      const login = await request(identityUrl)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password })
        .expect(200);
      accessToken = login.body.data.accessToken as string;
      expect(accessToken).toEqual(expect.any(String));

      process.env.JWT_PUBLIC_KEY = environment.JWT_PUBLIC_KEY;
      process.env.JWT_ISSUER = environment.JWT_ISSUER;
      process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = serviceKeys.privateKey
        .export({ type: 'pkcs8', format: 'pem' })
        .toString();
      process.env.IDENTITY_URL = identityUrl;
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = databaseUrl!;
      delete process.env.RABBITMQ_URL;
      learningDb = createLearningDataSource(databaseUrl);
      await learningDb.initialize();
      await learningDb.runMigrations();
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
    }, 45000);

    afterEach(async () => {
      if (identityDb?.isInitialized)
        await identityDb.query(
          'UPDATE users SET status=$1, role=$2 WHERE id=$3',
          ['ACTIVE', 'STUDENT', user.id],
        );
    });
    afterAll(async () => {
      await app?.close();
      if (
        identity?.pid &&
        identity.exitCode === null &&
        identity.signalCode === null
      ) {
        const stopped = once(identity, 'exit');
        identity.kill();
        await stopped;
      }
      if (identityDb?.isInitialized) await identityDb.destroy();
      if (learningDb?.isInitialized) await learningDb.destroy();
      if (admin?.isInitialized) {
        if (databaseCreated)
          await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        await admin.destroy();
      }
      process.env = original;
    });

    const list = () =>
      request(app!.getHttpServer())
        .get('/api/v1/learning/me/certificates')
        .set('Authorization', `Bearer ${accessToken}`);
    it('accepts a user token returned by the real Identity login API', async () => {
      const response = await list().expect(200);
      expect(response.body.data.items).toEqual([]);
    });
    it('reads the Vietnamese certificate recipient through the real Identity internal summary', async () => {
      expect(
        await app!.get(IdentityClient).certificateRecipient({
          userId: user.id,
          authorization: `Bearer ${accessToken}`,
          requestId: 'identity-integration',
        }),
      ).toBe(displayName);
    });
    it('rejects an existing token immediately after Identity deactivates the user', async () => {
      await identityDb!.query('UPDATE users SET status=$1 WHERE id=$2', [
        'INACTIVE',
        user.id,
      ]);
      await list().expect(403);
    });
    it('rejects stale permissions after Identity changes the role', async () => {
      await identityDb!.query('UPDATE users SET role=$1 WHERE id=$2', [
        'INSTRUCTOR',
        user.id,
      ]);
      await list().expect(403);
    });
    it('rejects an unauthenticated fixture header on the real Learning app', async () => {
      await request(app!.getHttpServer())
        .get('/api/v1/learning/me/certificates')
        .set('X-Mock-User', 'studentB')
        .expect(401);
    });
  },
);
