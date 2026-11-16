import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseContract } from '@lms/contracts';
import type { CertificateData } from '@lms/contracts';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createLearningDataSource } from '../src/database/learning-database';
import { LinkCertificateReplacements1794528000013 } from '../src/database/migrations/1794528000013-link-certificate-replacements';
import { Certificate } from '../src/modules/certificates/entities/certificate.entity';
import { CertificateDocument } from '../src/modules/certificates/entities/certificate-document.entity';
import { CertificateIssuanceReceipt } from '../src/modules/certificates/entities/certificate-issuance-receipt.entity';
import { AssessmentAttempt } from '../src/modules/progress-sync/entities/assessment-attempt.entity';
import { AssessmentSyncReceipt } from '../src/modules/progress-sync/entities/assessment-sync-receipt.entity';
import { AssessmentAttemptsRepository } from '../src/modules/progress-sync/repositories/assessment-attempts.repository';
import { ItemCompletion } from '../src/modules/progress/entities/item-completion.entity';
import { LessonCompletion } from '../src/modules/progress/entities/lesson-completion.entity';
import {
  nextEnrollment,
  recipientDisplayName,
  revocationReason,
} from './fixtures/certificates.mock.json';
import providers from './fixtures/learning-providers.mock.json';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const pdfRenderer = process.env.TEST_PDF_RENDERER;
const run = promisify(execFile);

suite('Certificate API with PostgreSQL and mock providers', () => {
  const env = { ...process.env };
  const token = 'certificate-course-test-token';
  const { userId } = providers.course.enrollment;
  let courseId: string;
  let enrollmentIds: Record<number, string>;
  let publishedVersion: number;
  let enrolledVersion: number;
  let issuedVersionEnabled: boolean;
  let emptyRequirements: boolean;
  let uppercaseEnrollment: boolean;
  let changeAssessmentVersions: boolean;
  let retakeStartedAt: string | undefined;
  let identityId: string;
  let displayName: string;
  let identityGate: (() => Promise<void>) | undefined;
  let source: DataSource | undefined;
  let app: INestApplication<App> | undefined;
  let attempts: AssessmentAttemptsRepository;
  let learningPort = 0;
  const snapshots: number[] = [];

  function structure(version: number) {
    const offset = changeAssessmentVersions ? version - 1 : 0;
    const data = parseContract(
      'CourseLearningStructure',
      structuredClone(providers.course.structure),
    );
    const { outline, completionPolicy } = data;
    Object.assign(outline, { courseId, contentVersion: version });
    Object.assign(completionPolicy, {
      courseId,
      contentVersion: version,
      certificateEnabled: issuedVersionEnabled,
    });
    if (emptyRequirements) {
      outline.chapters = [];
      completionPolicy.requiredItemIds = [];
      completionPolicy.requiredAssessments = [];
      completionPolicy.chapterPolicies = [];
    }
    for (const requirement of [
      ...completionPolicy.requiredAssessments,
      ...completionPolicy.chapterPolicies.flatMap(
        (policy) => policy.requiredAssessments,
      ),
    ])
      requirement.assessmentVersion += offset;
    for (const chapter of outline.chapters) {
      chapter.courseId = courseId;
      if (chapter.endSectionQuiz)
        chapter.endSectionQuiz.assessmentVersion += offset;
      for (const lesson of chapter.lessons) {
        lesson.courseId = courseId;
        for (const item of lesson.items) {
          Object.assign(item, { courseId, contentVersion: version });
          if (item.type === 'QUIZ') item.assessmentVersion += offset;
        }
      }
    }
    return data;
  }

  const providersServer = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const send = (data: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data }));
    };
    if (
      url.pathname === '/api/v1/users/me' &&
      req.headers['x-mock-user'] === 'studentB'
    ) {
      const profile = {
        ...providers.identity.studentB,
        id: identityId,
        displayName,
        avatarUrl: null,
        bio: null,
        createdAt: providers.course.enrollment.enrolledAt,
        version: 1,
      };
      if (identityGate) {
        void identityGate().then(() => send(profile));
        return;
      }
      return send(profile);
    }
    if (url.pathname === '/api/v1/enrollments/me') {
      const items =
        req.headers['x-mock-user'] === 'studentB'
          ? [
              {
                enrollment: {
                  ...providers.course.enrollment,
                  courseId: uppercaseEnrollment
                    ? courseId.toUpperCase()
                    : courseId,
                  enrollmentId: uppercaseEnrollment
                    ? enrollmentIds[enrolledVersion].toUpperCase()
                    : enrollmentIds[enrolledVersion],
                  contentVersion: enrolledVersion,
                  enrolledAt:
                    retakeStartedAt ?? providers.course.enrollment.enrolledAt,
                },
                course: {
                  ...providers.course.publishedCourse,
                  id: courseId,
                  contentVersion: publishedVersion,
                },
              },
            ]
          : [];
      return send({
        items,
        total: items.length,
        page: Number(url.searchParams.get('page')),
        limit: Number(url.searchParams.get('limit')),
      });
    }
    if (url.pathname === `/api/v1/internal/courses/${courseId}/structure`) {
      if (req.headers.authorization !== `Bearer ${token}`)
        return res.writeHead(401).end();
      const version = Number(url.searchParams.get('contentVersion'));
      snapshots.push(version);
      if (!enrollmentIds[version] || version > publishedVersion)
        return res.writeHead(409).end();
      return send(structure(version));
    }
    return res.writeHead(404).end();
  });

  async function startLearning() {
    const testing = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = testing.createNestApplication();
    await app.listen(learningPort, '127.0.0.1');
    process.env.LEARNING_PUBLIC_URL = await app.getUrl();
    learningPort = Number(new URL(process.env.LEARNING_PUBLIC_URL).port);
    attempts = testing.get(AssessmentAttemptsRepository);
  }

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      !decodeURIComponent(url.pathname).endsWith('_test')
    )
      throw new Error('Use a local *_test PostgreSQL database');
    source = createLearningDataSource(databaseUrl);
    await source.initialize();
    await source.runMigrations();
    await new Promise<void>((resolve, reject) => {
      providersServer.once('error', reject);
      providersServer.listen(0, '127.0.0.1', resolve);
    });
    process.env.NODE_ENV = 'test';
    process.env.MOCK_AUTH = 'true';
    process.env.DATABASE_URL = databaseUrl;
    delete process.env.RABBITMQ_URL;
    process.env.COURSE_URL = `http://127.0.0.1:${(providersServer.address() as AddressInfo).port}`;
    process.env.IDENTITY_URL = process.env.COURSE_URL;
    process.env.COURSE_SERVICE_TOKEN = token;
    await startLearning();
  }, 20000);

  beforeEach(() => {
    courseId = randomUUID();
    enrollmentIds = {
      1: randomUUID(),
      [nextEnrollment.contentVersion]: randomUUID(),
    };
    publishedVersion = 1;
    enrolledVersion = 1;
    issuedVersionEnabled = true;
    emptyRequirements = false;
    uppercaseEnrollment = false;
    changeAssessmentVersions = true;
    retakeStartedAt = undefined;
    identityId = userId;
    displayName = recipientDisplayName;
    identityGate = undefined;
    snapshots.length = 0;
  });

  afterEach(async () => {
    if (!source?.isInitialized || !courseId) return;
    await source.getRepository(Certificate).delete({ courseId });
    await source.getRepository(AssessmentSyncReceipt).delete({ courseId });
    await source.getRepository(AssessmentAttempt).delete({ courseId });
    for (const enrollmentId of Object.values(enrollmentIds)) {
      await source.getRepository(ItemCompletion).delete({ enrollmentId });
      await source.getRepository(LessonCompletion).delete({ enrollmentId });
    }
  });

  afterAll(async () => {
    try {
      await app?.close();
      if (providersServer.listening)
        await new Promise<void>((resolve) =>
          providersServer.close(() => resolve()),
        );
      if (source?.isInitialized) await source.destroy();
    } finally {
      process.env = env;
    }
  });

  const http = () => request(app!.getHttpServer());
  const issuePath = () => `/api/v1/learning/courses/${courseId}/certificate`;
  const issue = (key: string, actor = 'studentB') =>
    http()
      .post(issuePath())
      .set('Idempotency-Key', key)
      .set('X-Mock-User', actor);
  const verify = (code: string) =>
    http().get(`/api/v1/certificates/verify/${code}`);
  const revoke = (
    id: string,
    actor: string | null = 'adminA',
    reason = revocationReason,
  ) => {
    const req = http().put(`/api/v1/admin/certificates/${id}/revocation`);
    if (actor) req.set('X-Mock-User', actor);
    return req.send({ reason });
  };
  const revokedVerification = {
    valid: false,
    status: 'REVOKED',
    courseTitle: null,
    recipientName: null,
    issuedAt: null,
  };
  const download = (id: string, actor?: string) => {
    const req = http().get(`/api/v1/learning/me/certificates/${id}/download`);
    return actor ? req.set('X-Mock-User', actor) : req;
  };
  const list = (actor = 'studentB') =>
    http()
      .get('/api/v1/learning/me/certificates?limit=1')
      .set('X-Mock-User', actor);

  async function grade(
    template: typeof providers.quiz.attemptGraded,
    version: number,
    when = new Date(),
  ) {
    const gradedAt = when.toISOString();
    const event = parseContract('AttemptGradedV2Event', {
      ...template,
      eventId: randomUUID(),
      occurredAt: gradedAt,
      payload: {
        ...template.payload,
        attemptId: randomUUID(),
        assessmentVersion:
          template.payload.assessmentVersion +
          (changeAssessmentVersions ? version - 1 : 0),
        courseId,
        gradedAt,
      },
    });
    expect(await attempts.record(event)).toBe('SYNCED');
  }

  async function completeLessons(version: number) {
    await grade(providers.quiz.chapterAttempt80, version);
    for (const { lessons } of providers.course.structure.outline.chapters) {
      for (const { id, items } of lessons) {
        for (const item of items.filter(({ required }) => required))
          await http()
            .put(`/api/v1/learning/items/${item.id}/completion`)
            .set('X-Mock-User', 'studentB')
            .send({ completed: true, contentVersion: version })
            .expect(200);
        await http()
          .put(`/api/v1/learning/lessons/${id}/completion`)
          .set('X-Mock-User', 'studentB')
          .send({ completed: true, contentVersion: version })
          .expect(200);
      }
    }
  }

  async function expectIneligible(key: string) {
    const response = await issue(key).expect(409);
    expect(response.body).toMatchObject({
      error: { code: 'CERTIFICATE_NOT_ELIGIBLE' },
    });
  }

  function certificate(body: unknown): CertificateData {
    return parseContract('CertificateData', (body as { data: unknown }).data);
  }

  it('CERT-02/03 stores the PDF with its original recipient and only lets the owner download', async () => {
    await completeLessons(1);
    await grade(providers.quiz.attemptGraded, 1);
    identityId = providers.identity.studentA.id;
    await issue('pdf').expect(503);
    expect(await source!.getRepository(Certificate).countBy({ courseId })).toBe(
      0,
    );
    identityId = userId;

    const data = certificate((await issue('pdf').expect(201)).body);
    const saved = await source!
      .getRepository(CertificateDocument)
      .findOneByOrFail({ certificateId: data.id });
    expect(saved.recipientName).toBe(recipientDisplayName);
    expect(new URL(data.downloadUrl).pathname).toBe(
      `/api/v1/learning/me/certificates/${data.id}/download`,
    );
    displayName = 'Tên đã đổi sau khi cấp';
    const response = await download(data.id, 'studentB')
      .expect(200)
      .expect('Content-Type', 'application/pdf')
      .expect(
        'Content-Disposition',
        `attachment; filename="chung-chi-${data.id}.pdf"`,
      )
      .expect('Cache-Control', 'private, no-store');
    expect(response.body).toEqual(saved.pdf);
    expect(saved.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await download(data.id).expect(401);
    await download(data.id, 'studentA').expect(404);
    await download(randomUUID(), 'studentB').expect(404);
    await download('bad-id', 'studentB').expect(400);
  });

  async function saveLegacyCertificate() {
    const id = randomUUID();
    await source!.getRepository(Certificate).insert({
      id,
      userId,
      courseId,
      enrollmentId: enrollmentIds[1],
      contentVersion: 1,
      courseTitle: providers.course.publishedCourse.title,
      verificationCode: randomBytes(24).toString('base64url'),
      issuedAt: new Date('2026-01-15T09:10:01Z'),
      status: 'ACTIVE',
      supersededAt: null,
    });
    return id;
  }

  it('CERT-02 backfills a pre-existing certificate document without issuing a new certificate', async () => {
    const id = await saveLegacyCertificate();
    const downloads = await Promise.all([
      download(id, 'studentB').expect(200),
      download(id, 'studentB').expect(200),
    ]);
    expect(downloads[0].body).toEqual(downloads[1].body);
    const documents = source!.getRepository(CertificateDocument);
    expect(await documents.countBy({ certificateId: id })).toBe(1);
    expect(certificate((await issue('legacy').expect(201)).body).id).toBe(id);
  });

  it('CERT-03/07 rejects a legacy PDF download still waiting on Identity when revocation commits', async () => {
    const id = await saveLegacyCertificate();
    let identityRequested!: () => void;
    let releaseIdentity!: () => void;
    const waiting = new Promise<void>((resolve) => {
      identityRequested = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    identityGate = () => {
      identityRequested();
      return release;
    };
    const pending = download(id, 'studentB').then((response) => response);
    try {
      await Promise.race([
        waiting,
        pending.then(({ status }) => {
          throw new Error(
            `Download completed before reaching Identity (${status})`,
          );
        }),
      ]);
      await revoke(id).expect(200);
    } finally {
      releaseIdentity();
    }
    const response = await pending;
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'CERTIFICATE_REVOKED' },
    });
    expect(
      await source!
        .getRepository(CertificateDocument)
        .countBy({ certificateId: id }),
    ).toBe(0);
  });

  it('CERT-01 does not issue a certificate when the snapshot contains no completion requirements', async () => {
    emptyRequirements = true;
    const response = await issue('empty-policy').expect(503);
    expect(response.body).toMatchObject({
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    expect(await source!.getRepository(Certificate).countBy({ courseId })).toBe(
      0,
    );
  });

  it('CERT-06 requires quiz evidence from the new enrollment even when the quiz version is unchanged', async () => {
    changeAssessmentVersions = false;
    await completeLessons(1);
    const cutoff = Date.now() - 60000;
    await grade(providers.quiz.attemptGraded, 1, new Date(cutoff - 1000));
    const first = certificate(
      (await issue('v1-unchanged-quiz').expect(201)).body,
    );

    publishedVersion = enrolledVersion = nextEnrollment.contentVersion;
    retakeStartedAt = new Date(cutoff).toISOString();
    await completeLessons(enrolledVersion);
    await expectIneligible('v2-unchanged-quiz');
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { status: 'ACTIVE' } });
    await grade(providers.quiz.attemptGraded, enrolledVersion);
    const second = certificate(
      (await issue('v2-unchanged-quiz').expect(201)).body,
    );
    expect(second.contentVersion).toBe(enrolledVersion);
    expect(second.id).not.toBe(first.id);
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { status: 'SUPERSEDED' } });
  });

  it('CERT-06 rejects replacement for a reused enrollment without a new retake time', async () => {
    changeAssessmentVersions = false;
    await completeLessons(1);
    await grade(providers.quiz.attemptGraded, 1);
    const first = certificate(
      (await issue('reused-enrollment-v1').expect(201)).body,
    );

    publishedVersion = enrolledVersion = nextEnrollment.contentVersion;
    enrollmentIds[enrolledVersion] = enrollmentIds[1];
    await completeLessons(enrolledVersion);
    await expectIneligible('reused-enrollment-v2');
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({
      data: { status: 'ACTIVE' },
    });

    retakeStartedAt = new Date(Date.parse(first.issuedAt) + 1).toISOString();
    await completeLessons(enrolledVersion);
    await expectIneligible('reused-enrollment-v2');
    await grade(providers.quiz.attemptGraded, enrolledVersion);
    const second = certificate(
      (await issue('reused-enrollment-v2').expect(201)).body,
    );
    expect(second).toMatchObject({
      contentVersion: enrolledVersion,
      enrollmentId: first.enrollmentId,
    });
    expect(second.id).not.toBe(first.id);
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({
      data: { status: 'SUPERSEDED' },
    });
  });

  (pdfRenderer ? it : it.skip)(
    'CERT-05/06/07 reads both PDF QRs after replacement and the original QR after revocation',
    async () => {
      await completeLessons(1);
      await grade(providers.quiz.attemptGraded, 1);
      const data = certificate((await issue('qr').expect(201)).body);
      const response = await download(data.id, 'studentB').expect(200);
      const temp = await mkdtemp(join(tmpdir(), 'lms-certificate-'));
      const files: string[] = [];
      const readQr = async (id: string, content: Buffer) => {
        const rendered = join(temp, id);
        const pdf = `${rendered}.pdf`;
        files.push(pdf, `${rendered}.png`);
        await writeFile(pdf, content);
        await run(pdfRenderer!, [
          '-png',
          '-r',
          '150',
          '-singlefile',
          pdf,
          rendered,
        ]);
        const page = PNG.sync.read(await readFile(`${rendered}.png`));
        const qr = jsQR(
          new Uint8ClampedArray(page.data),
          page.width,
          page.height,
        );
        if (!qr) throw new Error(`Unable to decode certificate QR for ${id}`);
        return qr.data;
      };
      const scan = (decoded: string) => {
        const url = new URL(decoded);
        return request(url.origin)
          .get(url.pathname + url.search)
          .set('Connection', 'close')
          .expect(200);
      };
      try {
        const originalQr = await readQr(data.id, response.body as Buffer);
        expect(originalQr).toBe(
          `${process.env.LEARNING_PUBLIC_URL}/api/v1/certificates/verify/${data.verificationCode}`,
        );
        const verification = await scan(originalQr);
        expect(verification.body).toMatchObject({
          data: { valid: true, status: 'ACTIVE', issuedAt: data.issuedAt },
        });
        publishedVersion = enrolledVersion = nextEnrollment.contentVersion;
        await completeLessons(enrolledVersion);
        await grade(providers.quiz.attemptGraded, enrolledVersion);
        const replacement = certificate(
          (await issue('qr-next').expect(201)).body,
        );
        const originalPdf = await download(data.id, 'studentB').expect(200);
        expect(originalPdf.body).toEqual(response.body);
        const replacementPdf = await download(
          replacement.id,
          'studentB',
        ).expect(200);
        const replacementQr = await readQr(
          replacement.id,
          replacementPdf.body as Buffer,
        );
        expect(replacementQr).toBe(
          `${process.env.LEARNING_PUBLIC_URL}/api/v1/certificates/verify/${replacement.verificationCode}`,
        );
        const historical = await scan(originalQr);
        expect(historical.body).toMatchObject({
          data: {
            valid: true,
            status: 'SUPERSEDED',
            courseTitle: providers.course.publishedCourse.title,
            recipientName: null,
            issuedAt: data.issuedAt,
          },
        });
        await revoke(data.id).expect(200);
        const revokedDownload = await download(data.id, 'studentB').expect(409);
        expect(revokedDownload.body).toMatchObject({
          error: { code: 'CERTIFICATE_REVOKED' },
        });
        const after = await scan(originalQr);
        expect(after.headers['cache-control']).toBe('no-store');
        expect(after.body).toEqual({
          data: revokedVerification,
          meta: { requestId: expect.any(String) },
        });
        const current = await scan(replacementQr);
        expect(current.body).toMatchObject({
          data: {
            valid: true,
            status: 'ACTIVE',
            issuedAt: replacement.issuedAt,
          },
        });
        const sample = process.env.TEST_CERTIFICATE_SAMPLE_PATH;
        if (sample) await writeFile(sample, response.body as Buffer);
      } finally {
        await Promise.all(files.map((file) => rm(file, { force: true })));
        await rmdir(temp);
      }
    },
    45000,
  );

  it('CERT-07 permits only Admin and permanently records the first revocation', async () => {
    await completeLessons(1);
    await grade(providers.quiz.attemptGraded, 1);
    const first = certificate((await issue('before-revoke').expect(201)).body);
    const certificates = source!.getRepository(Certificate);
    await revoke(first.id, null).expect(401);
    for (const actor of ['studentB', 'instructorA']) {
      await revoke(first.id, actor).set('X-User-Role', 'ADMIN').expect(403);
    }
    await revoke(first.id, 'adminA', '   ').expect(400);
    await revoke(first.id, 'adminA', 'a'.repeat(501)).expect(400);
    await revoke(first.id, 'adminA', 'sai\u0000lý do').expect(400);
    await revoke(first.id, 'adminA', '\ud800').expect(400);
    await revoke(randomUUID()).expect(404);
    await expect(
      certificates.update(first.id, { status: 'REVOKED' }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { status: 'ACTIVE' } });

    const reason = `${revocationReason} 🔍`;
    const results = await Promise.all([
      revoke(first.id, 'adminA', reason).expect(200),
      revoke(first.id, 'adminA', reason).expect(200),
    ]);
    const audit = parseContract(
      'CertificateRevocationData',
      (results[0].body as { data: unknown }).data,
    );
    expect(audit).toMatchObject({
      certificateId: first.id,
      status: 'REVOKED',
      revokedBy: providers.identity.adminA.id,
      reason,
    });
    expect(results[1].body).toMatchObject({ data: audit });
    expect(
      (await revoke(first.id, 'adminA', 'Lý do gửi lại').expect(200)).body,
    ).toMatchObject({ data: audit });
    expect(await certificates.findOneByOrFail({ id: first.id })).toMatchObject({
      status: 'REVOKED',
      revokedAt: new Date(audit.revokedAt),
      revokedBy: audit.revokedBy,
      revocationReason: reason,
    });
    expect(
      await source!
        .getRepository(CertificateDocument)
        .countBy({ certificateId: first.id }),
    ).toBe(1);
    expect((await verify(first.verificationCode).expect(200)).body).toEqual({
      data: revokedVerification,
      meta: { requestId: expect.any(String) },
    });
    expect(
      (await download(first.id, 'studentB').expect(409)).body,
    ).toMatchObject({ error: { code: 'CERTIFICATE_REVOKED' } });
    await download(first.id, 'studentA').expect(404);
    for (const key of ['before-revoke', 'new-key-after-revoke']) {
      expect((await issue(key).expect(409)).body).toMatchObject({
        error: { code: 'CERTIFICATE_REVOKED' },
      });
    }
    expect(await certificates.countBy({ courseId })).toBe(1);
    expect(
      await source!
        .getRepository(CertificateIssuanceReceipt)
        .countBy({ courseId, key: 'new-key-after-revoke' }),
    ).toBe(0);

    publishedVersion = enrolledVersion = nextEnrollment.contentVersion;
    await expectIneligible('after-retake');
    await completeLessons(2);
    await grade(providers.quiz.attemptGraded, 2);
    const second = certificate((await issue('after-retake').expect(201)).body);
    expect(second.contentVersion).toBe(nextEnrollment.contentVersion);
    expect(
      (await verify(second.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { valid: true, status: 'ACTIVE' } });
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({ data: revokedVerification });
  }, 20000);

  it('CERT-01/04/06 checks completion and policy, then issues once across concurrent requests and retries', async () => {
    await http().post(issuePath()).expect(401);
    await http().post(issuePath()).set('X-Mock-User', 'studentB').expect(400);
    const foreign = await issue('first', 'studentA').expect(403);
    expect(foreign.body).toMatchObject({
      error: { code: 'ENROLLMENT_REQUIRED' },
    });
    await issue('first').send({ contentVersion: 2 }).expect(400);

    await completeLessons(1);
    const progress = await http()
      .get(`/api/v1/learning/courses/${courseId}/progress`)
      .set('X-Mock-User', 'studentB')
      .expect(200);
    expect(progress.body).toMatchObject({
      data: { lessonProgressPercent: 100, status: 'IN_PROGRESS' },
    });
    await grade(
      providers.quiz.attemptGraded,
      1,
      new Date(Date.now() + 3600000),
    );
    const beforeGrade = await http()
      .get(`/api/v1/learning/courses/${courseId}/progress`)
      .set('X-Mock-User', 'studentB')
      .expect(200);
    expect(beforeGrade.body).toMatchObject({
      data: { status: 'IN_PROGRESS', passedRequiredAssessments: 0 },
    });
    await expectIneligible('first');

    await grade(providers.quiz.attemptGraded, 1);
    issuedVersionEnabled = false;
    await expectIneligible('first');
    expect(await source!.getRepository(Certificate).countBy({ courseId })).toBe(
      0,
    );
    issuedVersionEnabled = true;

    uppercaseEnrollment = true;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        issue(index < 6 ? 'first' : `other-${index}`).expect(201),
      ),
    );
    const data = certificate(results[0].body);
    expect(data).toMatchObject({
      courseId,
      userId,
      enrollmentId: enrollmentIds[1],
      contentVersion: 1,
    });
    for (const result of results)
      expect(certificate(result.body)).toEqual(data);
    const certificates = source!.getRepository(Certificate);
    expect(await certificates.countBy({ courseId })).toBe(1);
    const row = await certificates.findOneByOrFail({ id: data.id });
    const duplicate = certificates.create(row);
    Object.assign(duplicate, {
      id: randomUUID(),
      enrollmentId: randomUUID(),
      verificationCode: randomBytes(24).toString('base64url'),
      status: 'REVOKED',
      revokedAt: row.issuedAt,
      revokedBy: providers.identity.adminA.id,
      revocationReason: revocationReason,
    });
    await expect(certificates.insert(duplicate)).rejects.toMatchObject({
      code: '23505',
    });
    const base = certificates.create(row);
    base.id = randomUUID();
    base.verificationCode = randomBytes(24).toString('base64url');
    base.contentVersion = 2;
    await expect(certificates.insert(base)).rejects.toMatchObject({
      code: '23505',
      constraint: 'learning_certificates_one_active',
    });
    base.userId = randomUUID();
    base.verificationCode = row.verificationCode;
    await expect(certificates.insert(base)).rejects.toMatchObject({
      code: '23505',
    });

    const receipts = source!.getRepository(CertificateIssuanceReceipt);
    const receipt = await receipts.findOneByOrFail({
      courseId,
      userId,
      key: 'first',
    });
    expect(
      receipt.expiresAt.getTime() - Date.parse(data.issuedAt),
    ).toBeGreaterThanOrEqual(86400000);
    await receipts.update(
      { courseId, userId, key: 'first' },
      { expiresAt: new Date(0) },
    );
    expect(certificate((await issue('first').expect(201)).body)).toEqual(data);
    await issue('first', 'studentA').expect(403);

    expect((await list().expect(200)).body).toMatchObject({
      data: { total: 1, items: [data] },
    });
    expect((await list('studentA').expect(200)).body).toMatchObject({
      data: { total: 0, items: [] },
    });
    expect(
      (await verify(data.verificationCode).expect(200)).body,
    ).toMatchObject({
      data: {
        valid: true,
        courseTitle: providers.course.publishedCourse.title,
        recipientName: null,
        issuedAt: data.issuedAt,
      },
    });
  }, 20000);

  it('CERT-06 keeps version 1 valid until the selected version 2 is completed and committed', async () => {
    await completeLessons(1);
    await grade(providers.quiz.attemptGraded, 1);
    const first = certificate((await issue('v1').expect(201)).body);
    publishedVersion = nextEnrollment.contentVersion;
    expect(
      certificate((await issue('published-only').expect(201)).body),
    ).toEqual(first);
    expect(snapshots).not.toContain(2);

    enrolledVersion = nextEnrollment.contentVersion;
    await expectIneligible('v2');
    expect(snapshots).toContain(2);
    await completeLessons(2);
    // The earlier final quiz still belongs to version 1 of that assessment.
    await expectIneligible('v2');
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { valid: true } });
    await grade(providers.quiz.attemptGraded, 2);

    const failureConstraint = `cert_test_${courseId.replaceAll('-', '')}`;
    displayName = 'PDF storage failure fixture';
    await source!
      .query(`ALTER TABLE learning_certificate_documents ADD CONSTRAINT ${failureConstraint}
      CHECK (recipient_name <> 'PDF storage failure fixture')`);
    try {
      await issue('v2').expect(503);
      expect(
        (await verify(first.verificationCode).expect(200)).body,
      ).toMatchObject({ data: { valid: true } });
      expect(
        await source!.getRepository(Certificate).countBy({ courseId }),
      ).toBe(1);
      expect(
        await source!
          .getRepository(CertificateIssuanceReceipt)
          .countBy({ courseId, key: 'v2' }),
      ).toBe(0);
    } finally {
      await source!.query(
        `ALTER TABLE learning_certificate_documents DROP CONSTRAINT ${failureConstraint}`,
      );
      displayName = recipientDisplayName;
    }

    const results = await Promise.all(
      ['v2', 'v2', 'other-v2'].map((key) => issue(key).expect(201)),
    );
    const second = certificate(results[0].body);
    expect(second).toMatchObject({
      courseId,
      contentVersion: 2,
      enrollmentId: enrollmentIds[2],
      status: 'ACTIVE',
      supersededByCertificateId: null,
    });
    expect(second.id).not.toBe(first.id);
    expect(second.verificationCode).not.toBe(first.verificationCode);
    for (const result of results)
      expect(certificate(result.body)).toEqual(second);
    const enrollmentId = enrollmentIds[2];
    enrollmentIds[2] = randomUUID();
    try {
      expect(
        certificate((await issue('same-version-reenrolled').expect(201)).body),
      ).toEqual(second);
    } finally {
      enrollmentIds[2] = enrollmentId;
    }
    const rows = await source!
      .getRepository(Certificate)
      .find({ where: { courseId }, order: { contentVersion: 'ASC' } });
    expect(rows).toMatchObject([
      {
        id: first.id,
        status: 'SUPERSEDED',
        supersededAt: new Date(second.issuedAt),
        supersededByCertificateId: second.id,
      },
      {
        id: second.id,
        status: 'ACTIVE',
        supersededAt: null,
        supersededByCertificateId: null,
      },
    ]);

    await app!.close();
    app = undefined;
    await startLearning();
    expect((await list().expect(200)).body).toMatchObject({
      data: { total: 2, items: [second] },
    });
    const historical = {
      ...first,
      status: 'SUPERSEDED',
      supersededByCertificateId: second.id,
    };
    const page = await http()
      .get('/api/v1/learning/me/certificates?page=2&limit=1')
      .set('X-Mock-User', 'studentB')
      .expect(200);
    expect(page.body).toMatchObject({
      data: { total: 2, items: [historical] },
    });
    expect(certificate((await issue('v1').expect(201)).body)).toEqual(
      historical,
    );
    enrolledVersion = 1;
    expect(certificate((await issue('late-v1').expect(201)).body)).toEqual(
      historical,
    );
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({
      data: {
        valid: true,
        status: 'SUPERSEDED',
        courseTitle: providers.course.publishedCourse.title,
        recipientName: null,
        issuedAt: first.issuedAt,
      },
    });
    expect(
      (await verify(second.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { valid: true } });
    expect(
      (await verify(randomBytes(24).toString('base64url')).expect(200)).body,
    ).toMatchObject({ data: { valid: false, status: null } });
    await revoke(first.id).expect(200);
    expect(
      (await verify(first.verificationCode).expect(200)).body,
    ).toMatchObject({ data: revokedVerification });
    expect(
      (await verify(second.verificationCode).expect(200)).body,
    ).toMatchObject({ data: { valid: true, status: 'ACTIVE' } });
  }, 20000);

  it('CERT-06 backfills replacement links for certificates issued before the contract update', async () => {
    const runner = source!.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new LinkCertificateReplacements1794528000013();
      await migration.down(runner);
      const first = randomUUID();
      const second = randomUUID();
      const older = '2026-01-15T09:10:01Z';
      const newer = '2026-02-15T09:10:01Z';
      await runner.query(
        `INSERT INTO learning_certificates
        (id, user_id, course_id, enrollment_id, content_version, course_title,
         verification_code, issued_at, status, superseded_at)
        VALUES ($1, $3, $4, $5, 1, 'Course', $7, $9, 'SUPERSEDED', $10),
               ($2, $3, $4, $6, 2, 'Course', $8, $10, 'ACTIVE', NULL)`,
        [
          first,
          second,
          userId,
          courseId,
          enrollmentIds[1],
          enrollmentIds[2],
          randomBytes(24).toString('base64url'),
          randomBytes(24).toString('base64url'),
          older,
          newer,
        ],
      );
      await migration.up(runner);
      await runner.query(
        'SET CONSTRAINTS learning_certificates_replacement_fk IMMEDIATE',
      );
      expect(
        await runner.query(
          `SELECT id, superseded_by_certificate_id FROM learning_certificates
        WHERE course_id = $1 ORDER BY content_version`,
          [courseId],
        ),
      ).toEqual([
        { id: first, superseded_by_certificate_id: second },
        { id: second, superseded_by_certificate_id: null },
      ]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
