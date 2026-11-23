import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@lms/auth';
import { LearningAuthGuard } from '../../common/auth/learning-auth.guard';
import type { AuthUser } from '@lms/contracts';
import type { Response } from 'express';
import { apiError, ApiExceptionFilter } from '../../common/api-error';
import { pageQuery } from '../../common/page-query';
import { requestId } from '../../common/request-context';
import { validateRequest } from '../../common/validate-request';
import { CertificatesService } from './certificates.service';

@Controller('api/v1/learning')
@UseFilters(ApiExceptionFilter)
@UseGuards(LearningAuthGuard)
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post('courses/:id/certificate')
  async issue(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (user.role !== 'STUDENT' || user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active student account is required');
    if (!key?.trim() || key.length > 128)
      throw apiError(
        'VALIDATION_ERROR',
        'Idempotency-Key must contain 1 to 128 characters',
      );
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    )
      throw apiError(
        'VALIDATION_ERROR',
        'Certificate issuance does not accept a request body',
      );
    const request = requestId(response);
    const data = await this.certificates.issue(
      validateRequest('Uuid', id).toLowerCase(),
      key,
      {
        userId: user.id,
        authorization,
        requestId: request,
      },
    );
    return { data, meta: { requestId: request } };
  }

  @Get('me/certificates')
  async list(
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active account is required');
    const data = await this.certificates.list(user.id, pageQuery(query));
    return { data, meta: { requestId: requestId(response) } };
  }

  @Get('me/certificates/:id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active account is required');
    const certificateId = validateRequest('Uuid', id).toLowerCase();
    const pdf = await this.certificates.download(certificateId, {
      userId: user.id,
      authorization,
      requestId: requestId(response),
    });
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="chung-chi-${certificateId}.pdf"`,
    });
  }
}

@Controller('api/v1/admin/certificates')
@UseFilters(ApiExceptionFilter)
@UseGuards(LearningAuthGuard)
export class AdminCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Put(':id/revocation')
  async revoke(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE')
      throw apiError('FORBIDDEN', 'An active admin account is required');
    const certificateId = validateRequest('Uuid', id).toLowerCase();
    const { reason } = validateRequest('RevokeCertificateRequest', body);
    const data = await this.certificates.revoke(
      certificateId,
      user.id,
      reason.trim(),
    );
    return { data, meta: { requestId: requestId(response) } };
  }
}

@Controller('api/v1/certificates/verify')
@UseFilters(ApiExceptionFilter)
export class CertificateVerificationController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get(':code')
  async verify(
    @Param('code') code: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const data = await this.certificates.verify(code);
    response.setHeader('Cache-Control', 'no-store');
    return { data, meta: { requestId: requestId(response) } };
  }
}
