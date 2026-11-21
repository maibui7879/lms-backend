import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
  keyByEmail?: boolean;
}

export const RATE_LIMIT_KEY = 'rate_limit_rule';
export const RateLimit = (rule: RateLimitRule) =>
  SetMetadata(RATE_LIMIT_KEY, rule);

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rule) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const now = Date.now();

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    const rawEmail =
      rule.keyByEmail &&
      req.body &&
      typeof (req.body as Record<string, unknown>).email === 'string'
        ? (req.body as { email: string }).email.trim().toLowerCase()
        : '';

    const routeKey = `${req.method}:${req.route?.path ?? req.path}`;
    const bucketKey = rawEmail
      ? `${routeKey}:ip:${ip}:email:${rawEmail}`
      : `${routeKey}:ip:${ip}`;

    this.cleanupExpired(now);

    const existing = this.buckets.get(bucketKey);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(bucketKey, {
        count: 1,
        resetAt: now + rule.windowSeconds * 1000,
      });
      return true;
    }

    if (existing.count >= rule.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfterSeconds));

      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
    return true;
  }

  private cleanupExpired(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
