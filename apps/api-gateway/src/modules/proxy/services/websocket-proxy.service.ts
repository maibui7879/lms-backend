import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import httpProxy from 'http-proxy';
import { gatewayError } from '../../../common/http/gateway-error';
import { allowedOrigin, targetFor } from '../../../config/gateway.config';

@Injectable()
export class WebsocketProxyService implements OnModuleDestroy {
  private readonly sockets = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: false,
  });

  constructor() {
    this.sockets.on('error', (_error, _request, response) => {
      if ('writeHead' in response)
        gatewayError(
          response as ServerResponse,
          503,
          'SERVICE_UNAVAILABLE',
          'Notification service unavailable',
          randomUUID(),
        );
      else (response as Duplex).destroy();
    });
  }

  onModuleDestroy(): void {
    this.sockets.close();
  }

  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (
      !/^\/socket\.io\/?(?:\?|$)/.test(req.url ?? '') ||
      !allowedOrigin(req.headers.origin)
    ) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    try {
      const target = targetFor('notification');
      delete req.headers['x-mock-user'];
      delete req.headers['x-user-id'];
      delete req.headers['x-user-role'];
      this.sockets.ws(req, socket, head, {
        target: target.origin,
        timeout: 65000,
        proxyTimeout: 65000,
      });
    } catch {
      socket.destroy();
    }
  }
}
