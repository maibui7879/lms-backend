import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expectedKey =
      this.configService.get<string>('INTERNAL_API_KEY') ||
      'dev-internal-secret-key';

    const providedKey = req.headers['x-internal-api-key'];
    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException({
        code: 'INVALID_SERVICE_CREDENTIAL',
        message: 'Valid internal service credential is required',
      });
    }

    return true;
  }
}