import { Injectable, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { authorizeGateway } from '../../../common/auth/gateway-auth';
import { gatewayError } from '../../../common/http/gateway-error';
import { resolveRoute } from '../../../routing/routes';
import { allowedOrigin, targetFor } from '../../../config/gateway.config';
import { HttpProxyService } from './http-proxy.service';
import { WebsocketProxyService } from './websocket-proxy.service';

@Injectable()
export class GatewayProxyService {
  constructor(
    private readonly http: HttpProxyService,
    private readonly websocket: WebsocketProxyService,
  ) {}

  handle(req: IncomingMessage, res: ServerResponse): void {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(incoming)
        ? incoming
        : randomUUID();
    res.setHeader('x-request-id', id);
    const rawPath = (req.url ?? '').split('?')[0];
    if (
      !rawPath.startsWith('/api/') &&
      rawPath !== '/socket.io/' &&
      rawPath !== '/socket.io'
    )
      return;
    const socketRequest = /^\/socket\.io\/?$/.test(rawPath);
    try {
      const route = socketRequest
        ? { service: 'notification' as const, access: 'PUBLIC' }
        : resolveRoute(
            req.method === 'HEAD' ? 'GET' : (req.method ?? ''),
            rawPath,
          );
      if (!route || route.access === 'INTERNAL') {
        gatewayError(res, 404, 'NOT_FOUND', 'Route not found', id);
        return;
      }
      if (socketRequest && !allowedOrigin(req.headers.origin)) {
        gatewayError(res, 403, 'FORBIDDEN', 'Origin not allowed', id);
        return;
      }
      if (route.access !== 'PUBLIC')
        authorizeGateway(
          typeof req.headers.authorization === 'string'
            ? req.headers.authorization
            : undefined,
        );
      const target = targetFor(route.service);
      this.http.transfer(req, res, target, id, socketRequest);
    } catch (error) {
      if (error instanceof HttpException)
        gatewayError(
          res,
          error.getStatus(),
          error.getStatus() === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
          error.getStatus() === 401
            ? 'Invalid or missing access token'
            : 'Gateway authentication unavailable',
          id,
        );
      else
        gatewayError(
          res,
          503,
          'SERVICE_UNAVAILABLE',
          'Gateway upstream configuration unavailable',
          id,
        );
    }
  }

  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.websocket.upgrade(req, socket, head);
  }
}
