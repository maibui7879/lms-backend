import type { INestApplication } from '@nestjs/common';
import { GatewayProxyService } from '../modules/proxy/services/gateway-proxy.service';
import { gatewayError } from '../common/http/gateway-error';
import { allowedOrigin } from '../config/gateway.config';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';

export async function configureGateway(app: INestApplication): Promise<void> {
  const proxy = app.get(GatewayProxyService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers.origin && !allowedOrigin(req.headers.origin)) {
      gatewayError(res, 403, 'FORBIDDEN', 'Origin not allowed', randomUUID());
      return;
    }
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Request-Id,Content-Disposition',
      );
    }
    if (req.method === 'OPTIONS') {
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type,X-Request-Id,Idempotency-Key',
      );
      res.status(204).end();
      return;
    }
    const path = req.url.split('?')[0];
    if (path.startsWith('/api/') || /^\/socket\.io\/?$/.test(path)) {
      proxy.handle(req, res);
      return;
    }
    next();
  });
  const server = app.getHttpServer() as Server;
  server.on('upgrade', (req, socket, head) => proxy.upgrade(req, socket, head));
}
