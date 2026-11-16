import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtAccessPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const rawPublicKey = configService.getOrThrow<string>('JWT_PUBLIC_KEY');
    const publicKey = rawPublicKey.replace(/\\n/g, '\n');
    const issuer = configService.get<string>('JWT_ISSUER', 'lms-identity');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKey: publicKey,
      issuer,
    });
  }

  validate(payload: JwtAccessPayload): JwtAccessPayload {
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Malformed access token payload',
      });
    }
    return payload;
  }
}