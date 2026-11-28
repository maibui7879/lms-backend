import { createPublicKey, verify } from 'node:crypto';
import { parseContract } from '@lms/contracts';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export function authorizeGateway(authorization: string | undefined): void {
  const match =
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
      authorization ?? '',
    );
  if (!match)
    throw new UnauthorizedException('Missing or malformed bearer token');

  let key: ReturnType<typeof createPublicKey>;
  try {
    const pem = process.env.JWT_PUBLIC_KEY;
    if (!pem) throw new Error('Missing public key');
    key = createPublicKey(pem.replace(/\\n/g, '\n'));
    if (key.asymmetricKeyType !== 'rsa') throw new Error('Expected RSA key');
  } catch {
    throw new ServiceUnavailableException('JWT verification is not configured');
  }

  try {
    const [header, payload, signature] = match[1].split('.');
    const metadata: unknown = JSON.parse(
      Buffer.from(header, 'base64url').toString('utf8'),
    );
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      !('alg' in metadata) ||
      metadata.alg !== 'RS256'
    )
      throw new Error('Invalid algorithm');
    if (
      !verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        key,
        Buffer.from(signature, 'base64url'),
      )
    )
      throw new Error('Invalid signature');
    const claims = parseContract(
      'JwtClaims',
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== 'identity-service' ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.iat > now ||
      claims.exp <= claims.iat ||
      claims.exp <= now
    )
      throw new Error('Invalid claims');
  } catch {
    throw new UnauthorizedException('Invalid or expired bearer token');
  }
}
