import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PageQuery } from '@lms/contracts';
import { LessThanOrEqual, MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { apiError } from '../../../common/api-error';
import { LearningDatabase } from '../../../database/learning-database';
import { CertificateDocument } from '../entities/certificate-document.entity';
import { CertificateIssuanceReceipt } from '../entities/certificate-issuance-receipt.entity';
import { Certificate } from '../entities/certificate.entity';

type ReceiptKey = Pick<
  CertificateIssuanceReceipt,
  'userId' | 'courseId' | 'key'
>;
type CertificateSnapshot = Pick<
  Certificate,
  'enrollmentId' | 'contentVersion' | 'courseTitle'
> & { enrolledAt: string };
type CertificateScope = Pick<Certificate, 'userId' | 'courseId'>;

const receiptRetentionMs = 24 * 60 * 60 * 1000;
type PrepareDocument = (
  certificate: Certificate,
) => Promise<CertificateDocument>;

@Injectable()
export class CertificatesRepository {
  constructor(private readonly database: LearningDatabase) {}

  replay(key: ReceiptKey) {
    return this.database.run(({ manager }) => this.findReceipt(manager, key));
  }

  findVersion(userId: string, courseId: string, contentVersion: number) {
    return this.database.run((db) =>
      db
        .getRepository(Certificate)
        .findOneBy({ userId, courseId, contentVersion }),
    );
  }

  issue(
    key: ReceiptKey,
    snapshot: CertificateSnapshot,
    eligible: (manager: EntityManager) => Promise<boolean>,
    prepareDocument: PrepareDocument,
  ) {
    const { userId, courseId } = key;
    const scope = { userId, courseId };
    return this.database.run((db) =>
      db.transaction(async (manager) => {
        await this.lockIssuance(manager, scope);
        const replay = await this.findReceipt(manager, key);
        if (replay) return replay;
        const certificates = manager.getRepository(Certificate);
        const existing = await certificates.findOneBy({
          ...scope,
          contentVersion: snapshot.contentVersion,
        });
        if (existing?.status === 'REVOKED')
          throw apiError('CERTIFICATE_REVOKED', 'Certificate has been revoked');
        const certificate =
          existing ??
          (await this.issueNew(
            manager,
            snapshot,
            scope,
            eligible,
            prepareDocument,
          ));
        const now = new Date();
        const receipts = manager.getRepository(CertificateIssuanceReceipt);
        await receipts.delete({ ...scope, expiresAt: LessThanOrEqual(now) });
        await receipts.insert({
          ...key,
          certificateId: certificate.id,
          expiresAt: new Date(now.getTime() + receiptRetentionMs),
        });
        return certificate;
      }),
    );
  }

  async list(userId: string, { page, limit }: Required<PageQuery>) {
    const [items, total] = await this.database.run((db) =>
      db.getRepository(Certificate).findAndCount({
        where: { userId },
        order: { issuedAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    );
    return { items, total, page, limit };
  }

  findByCode(verificationCode: string) {
    return this.database.run((db) =>
      db.getRepository(Certificate).findOne({
        where: { verificationCode },
        select: { status: true, courseTitle: true, issuedAt: true },
      }),
    );
  }

  revoke(id: string, adminId: string, reason: string) {
    return this.database.run((db) =>
      db.transaction(async (manager) => {
        const certificates = manager.getRepository(Certificate);
        const scope = await certificates.findOne({
          where: { id },
          select: { userId: true, courseId: true },
        });
        if (!scope) return null;
        await this.lockIssuance(manager, scope);
        const certificate = await certificates.findOneByOrFail({ id });
        if (certificate.status === 'REVOKED') return certificate;

        const revocation = {
          status: 'REVOKED' as const,
          revokedAt: new Date(),
          revokedBy: adminId,
          revocationReason: reason,
        };
        await certificates.update(id, revocation);
        return Object.assign(certificate, revocation);
      }),
    );
  }

  findOwned(id: string, userId: string) {
    return this.database.run((db) =>
      db.getRepository(Certificate).findOneBy({ id, userId }),
    );
  }

  hasDocument(certificateId: string) {
    return this.database.run((db) =>
      db.getRepository(CertificateDocument).existsBy({ certificateId }),
    );
  }

  findDocument(certificateId: string) {
    return this.database.run((db) =>
      db.getRepository(CertificateDocument).findOneBy({ certificateId }),
    );
  }

  saveMissingDocument(certificate: Certificate, document: CertificateDocument) {
    return this.database.run((db) =>
      db.transaction(async (manager) => {
        // The profile lookup and rendering can finish after an Admin revokes this certificate.
        await this.lockIssuance(manager, certificate);
        const current = await manager
          .getRepository(Certificate)
          .findOneByOrFail({ id: certificate.id });
        if (current.status === 'REVOKED')
          throw apiError('CERTIFICATE_REVOKED', 'Certificate has been revoked');
        await manager
          .getRepository(CertificateDocument)
          .createQueryBuilder()
          .insert()
          .values(document)
          .orIgnore()
          .execute();
      }),
    );
  }

  private async findReceipt(manager: EntityManager, key: ReceiptKey) {
    const receipt = await manager
      .getRepository(CertificateIssuanceReceipt)
      .findOneBy({
        ...key,
        expiresAt: MoreThan(new Date()),
      });
    return receipt
      ? manager
          .getRepository(Certificate)
          .findOneByOrFail({ id: receipt.certificateId })
      : null;
  }

  private async lockIssuance(
    manager: EntityManager,
    { userId, courseId }: CertificateScope,
  ) {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`certificate:${userId}:${courseId}`],
    );
  }

  private async issueNew(
    manager: EntityManager,
    { enrolledAt, ...snapshot }: CertificateSnapshot,
    scope: CertificateScope,
    eligible: (manager: EntityManager) => Promise<boolean>,
    prepareDocument: PrepareDocument,
  ): Promise<Certificate> {
    const certificates = manager.getRepository(Certificate);
    const latest = await certificates.findOne({
      where: scope,
      order: { contentVersion: 'DESC' },
    });
    // A reused enrollment ID must carry the start time of the new retake.
    const staleRetake =
      latest?.enrollmentId === snapshot.enrollmentId &&
      Date.parse(enrolledAt) <= latest.issuedAt.getTime();
    if (
      (latest && latest.contentVersion >= snapshot.contentVersion) ||
      staleRetake ||
      !(await eligible(manager))
    ) {
      throw apiError(
        'CERTIFICATE_NOT_ELIGIBLE',
        'The enrolled course version is not eligible for a certificate',
      );
    }
    const issuedAt = new Date();
    const certificate: Certificate = {
      ...scope,
      ...snapshot,
      id: randomUUID(),
      verificationCode: randomBytes(24).toString('base64url'),
      issuedAt,
      status: 'ACTIVE',
      supersededAt: null,
      supersededByCertificateId: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
    };
    const document = await prepareDocument(certificate);
    if (latest?.status === 'ACTIVE') {
      await certificates.update(latest.id, {
        status: 'SUPERSEDED',
        supersededAt: issuedAt,
        supersededByCertificateId: certificate.id,
      });
    }
    await certificates.insert(certificate);
    await manager.getRepository(CertificateDocument).insert(document);
    return certificate;
  }
}
