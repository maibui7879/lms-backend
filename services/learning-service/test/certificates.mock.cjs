const { randomBytes, randomUUID } = require('node:crypto');
const { nextEnrollment } = require('./fixtures/certificates.mock.json');

const retentionMs = 24 * 60 * 60 * 1000;
const fixtureEvents = [
  'certificatePublishVersion2',
  'certificateStartRetake',
  'certificateCompleteRetake',
  'certificateDisableIssuance',
];

function createCertificateMock({
  enrollment,
  policy,
  title,
  progress,
  error,
  now,
}) {
  const byVersion = new Map();
  const byCode = new Map();
  const byId = new Map();
  const receipts = new Map();
  let current;
  let published = false;
  let retake = 'NOT_STARTED';
  let issuanceEnabled = true;

  function requireOwner(actor) {
    if (actor?.role !== 'STUDENT' || actor.status !== 'ACTIVE')
      throw error('FORBIDDEN', 'An active student account is required');
    if (actor.id !== enrollment.userId || enrollment.status === 'CANCELLED')
      throw error('ENROLLMENT_REQUIRED', 'Course access is required');
  }

  function apply(event, actor) {
    requireOwner(actor);
    if (event === 'certificatePublishVersion2') published = true;
    if (event === 'certificateStartRetake' && retake === 'NOT_STARTED') {
      if (!published || progress().status !== 'COMPLETED')
        throw error(
          'CERTIFICATE_NOT_ELIGIBLE',
          'Complete the original course and publish version 2 first',
        );
      retake = 'IN_PROGRESS';
    }
    if (event === 'certificateCompleteRetake') {
      if (retake === 'NOT_STARTED')
        throw error(
          'CERTIFICATE_NOT_ELIGIBLE',
          'The learner must start the version 2 retake',
        );
      retake = 'COMPLETED';
    }
    if (event === 'certificateDisableIssuance') issuanceEnabled = false;
    return {
      publishedContentVersion: published
        ? nextEnrollment.contentVersion
        : enrollment.contentVersion,
      retake,
    };
  }

  function issue(actor, key, downloadBase) {
    requireOwner(actor);
    if (typeof key !== 'string' || !key.trim() || key.length > 128)
      throw error(
        'VALIDATION_ERROR',
        'Idempotency-Key must contain 1 to 128 characters',
      );

    const time = now();
    const replay = receipts.get(key);
    if (replay?.expiresAt > time) return issuable(replay.entry);
    if (replay) receipts.delete(key);
    const target = retake === 'NOT_STARTED' ? enrollment : nextEnrollment;
    let entry = byVersion.get(target.contentVersion);
    if (!entry) {
      const allowed =
        target === enrollment
          ? policy.certificateEnabled && progress().status === 'COMPLETED'
          : target.certificateEnabled && retake === 'COMPLETED';
      if (!issuanceEnabled || !allowed)
        throw error(
          'CERTIFICATE_NOT_ELIGIBLE',
          'Complete all requirements of the certificate version first',
        );

      const id = randomUUID();
      let verificationCode;
      do {
        verificationCode = randomBytes(24).toString('base64url');
      } while (byCode.has(verificationCode));
      entry = {
        data: {
          id,
          userId: enrollment.userId,
          courseId: enrollment.courseId,
          enrollmentId: target.enrollmentId,
          contentVersion: target.contentVersion,
          status: 'ACTIVE',
          supersededByCertificateId: null,
          issuedAt: new Date(time).toISOString(),
          verificationCode,
          downloadUrl: `${downloadBase}/api/v1/learning/me/certificates/${id}/download`,
        },
      };
      if (current?.data.status === 'ACTIVE') {
        current.data.status = 'SUPERSEDED';
        current.data.supersededByCertificateId = id;
      }
      current = entry;
      byVersion.set(target.contentVersion, entry);
      byCode.set(verificationCode, entry);
      byId.set(id, entry);
    }
    const data = issuable(entry);
    receipts.set(key, { entry, expiresAt: time + retentionMs });
    return data;
  }

  function issuable(entry) {
    if (entry.data.status === 'REVOKED')
      throw error('CERTIFICATE_REVOKED', 'Certificate has been revoked');
    return entry.data;
  }

  function revoke(id, { reason }, actor) {
    const entry = byId.get(id);
    if (!entry) throw error('NOT_FOUND', 'Certificate was not found');
    if (entry.revocation) return entry.revocation;
    entry.data.status = 'REVOKED';
    entry.revocation = {
      certificateId: id,
      status: 'REVOKED',
      revokedAt: new Date(now()).toISOString(),
      revokedBy: actor.id,
      reason: reason.trim(),
    };
    return entry.revocation;
  }

  function list({ page, limit }, actor) {
    const items =
      actor.id === enrollment.userId
        ? [...byVersion.values()].reverse().map(({ data }) => data)
        : [];
    const start = (page - 1) * limit;
    return {
      items: items.slice(start, start + limit),
      page,
      limit,
      total: items.length,
    };
  }

  function verify(code) {
    const entry = byCode.get(code);
    const status = entry?.data.status ?? null;
    const valid = status === 'ACTIVE' || status === 'SUPERSEDED';
    return {
      valid,
      status,
      courseTitle: valid ? title : null,
      issuedAt: valid ? entry.data.issuedAt : null,
      recipientName: null,
    };
  }

  return { apply, issue, list, verify, revoke };
}

module.exports = { createCertificateMock, fixtureEvents };
