import { Injectable } from '@nestjs/common';
import type {
  CertificateData,
  CertificateRevocationData,
  CertificateVerificationData,
  PageQuery,
} from '@lms/contracts';
import { apiError } from '../../common/api-error';
import { CourseClient } from '../../integrations/course.client';
import type { CourseRequestContext } from '../../integrations/course.client';
import { IdentityClient } from '../../integrations/identity.client';
import { ProgressService } from '../progress/progress.service';
import type { Certificate } from './entities/certificate.entity';
import { renderCertificatePdf } from './pdf/certificate-pdf';
import { CertificatesRepository } from './repositories/certificates.repository';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly course: CourseClient,
    private readonly progress: ProgressService,
    private readonly certificates: CertificatesRepository,
    private readonly identity: IdentityClient,
  ) {}

  async issue(courseId: string, key: string, context: CourseRequestContext) {
    const receipt = { userId: context.userId, courseId, key };
    const replay = await this.certificates.replay(receipt);
    if (replay) return this.withDocument(replay, context);

    for await (const { enrollment, course } of this.course.enrolledCourses(
      context,
    )) {
      if (enrollment.courseId !== courseId) continue;
      const { enrollmentId, enrolledAt, contentVersion } = enrollment;
      const existing = await this.certificates.findVersion(
        context.userId,
        courseId,
        contentVersion,
      );
      // Course snapshots are fetched before opening the issuance transaction.
      const structure = existing
        ? null
        : await this.course.structure(enrollment, context);
      const certificate = await this.certificates.issue(
        receipt,
        { enrollmentId, enrolledAt, contentVersion, courseTitle: course.title },
        (manager) =>
          structure
            ? this.progress.certificateEligible(enrollment, structure, manager)
            : Promise.resolve(false),
        (certificate) => this.prepareDocument(certificate, context),
      );
      return this.withDocument(certificate, context);
    }
    throw apiError('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  async list(userId: string, query: Required<PageQuery>) {
    const page = await this.certificates.list(userId, query);
    return {
      ...page,
      items: page.items.map((certificate) => this.data(certificate)),
    };
  }

  async verify(code: string): Promise<CertificateVerificationData> {
    const certificate = /^[A-Za-z0-9_-]{32}$/.test(code)
      ? await this.certificates.findByCode(code)
      : null;
    const verified = certificate?.status === 'REVOKED' ? null : certificate;
    return {
      valid: Boolean(verified),
      status: certificate?.status ?? null,
      courseTitle: verified?.courseTitle ?? null,
      recipientName: null,
      issuedAt: verified?.issuedAt.toISOString() ?? null,
    };
  }

  async revoke(
    id: string,
    adminId: string,
    reason: string,
  ): Promise<CertificateRevocationData> {
    const certificate = await this.certificates.revoke(id, adminId, reason);
    if (!certificate) throw apiError('NOT_FOUND', 'Certificate was not found');
    return {
      certificateId: certificate.id,
      status: 'REVOKED',
      revokedAt: certificate.revokedAt!.toISOString(),
      revokedBy: certificate.revokedBy!,
      reason: certificate.revocationReason!,
    };
  }

  async download(id: string, context: CourseRequestContext): Promise<Buffer> {
    const certificate = await this.certificates.findOwned(id, context.userId);
    if (!certificate) throw apiError('NOT_FOUND', 'Certificate was not found');
    this.assertNotRevoked(certificate);
    const document = await this.certificates.findDocument(id);
    if (document) return document.pdf;
    await this.certificates.saveMissingDocument(
      certificate,
      await this.prepareDocument(certificate, context),
    );
    const saved = await this.certificates.findDocument(id);
    if (!saved)
      throw apiError('SERVICE_UNAVAILABLE', 'Certificate PDF is unavailable');
    return saved.pdf;
  }

  private async withDocument(
    certificate: Certificate,
    context: CourseRequestContext,
  ) {
    this.assertNotRevoked(certificate);
    if (!(await this.certificates.hasDocument(certificate.id))) {
      await this.certificates.saveMissingDocument(
        certificate,
        await this.prepareDocument(certificate, context),
      );
    }
    return this.data(certificate);
  }

  private assertNotRevoked(certificate: Certificate) {
    if (certificate.status === 'REVOKED')
      throw apiError('CERTIFICATE_REVOKED', 'Certificate has been revoked');
  }

  private async prepareDocument(
    certificate: Certificate,
    context: CourseRequestContext,
  ) {
    const recipientName = await this.identity.certificateRecipient(context);
    const url = this.publicUrl(
      `/api/v1/certificates/verify/${certificate.verificationCode}`,
    );
    const pdf = await renderCertificatePdf(certificate, recipientName, url);
    return { certificateId: certificate.id, recipientName, pdf };
  }

  private publicUrl(path: string): string {
    const url = new URL(
      path,
      process.env.LEARNING_PUBLIC_URL ?? 'http://127.0.0.1:3004',
    );
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw apiError(
        'SERVICE_UNAVAILABLE',
        'Learning public URL must use HTTP or HTTPS',
      );
    return url.toString();
  }

  private data(certificate: Certificate): CertificateData {
    const {
      id,
      userId,
      courseId,
      enrollmentId,
      contentVersion,
      status,
      supersededByCertificateId,
      issuedAt,
      verificationCode,
    } = certificate;
    return {
      id,
      userId,
      courseId,
      enrollmentId,
      contentVersion,
      status,
      supersededByCertificateId,
      issuedAt: issuedAt.toISOString(),
      verificationCode,
      downloadUrl: this.publicUrl(
        `/api/v1/learning/me/certificates/${id}/download`,
      ),
    };
  }
}
