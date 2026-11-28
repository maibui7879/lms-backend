import { Injectable } from '@nestjs/common';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requestHeaders, stripHop } from '../../../common/http/proxy-headers';
import { gatewayError } from '../../../common/http/gateway-error';
import { proxyRetries, proxyTimeout } from '../../../config/gateway.config';

@Injectable()
export class HttpProxyService {
  transfer(
    req: IncomingMessage,
    res: ServerResponse,
    target: URL,
    id: string,
    socketRequest: boolean,
  ): void {
    const timeout = socketRequest ? 65000 : proxyTimeout();
    const retries =
      ['GET', 'HEAD'].includes(req.method ?? '') &&
      !socketRequest &&
      !req.headers['content-length'] &&
      !req.headers['transfer-encoding']
        ? proxyRetries()
        : 0;
    const headers = requestHeaders(req, id);
    headers.host = target.host;
    headers['x-forwarded-for'] = req.socket.remoteAddress ?? '';
    const run = (attempt: number): void => {
      if (res.destroyed) return;
      let settled = false;
      let expired = false;
      const upstream = (
        target.protocol === 'https:' ? httpsRequest : httpRequest
      )({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers,
      });
      const timer = setTimeout(() => {
        expired = true;
        upstream.destroy(new Error('Proxy timeout'));
      }, timeout);
      const clientClosed = () => {
        if (!res.writableFinished) upstream.destroy();
      };
      res.on('close', clientClosed);
      const cleanup = () => {
        clearTimeout(timer);
        res.off('close', clientClosed);
      };
      upstream.on('response', (response) => {
        if (
          attempt < retries &&
          (response.statusCode ?? 0) >= 500 &&
          (response.statusCode ?? 0) <= 599
        ) {
          settled = true;
          cleanup();
          response.resume();
          response.destroy();
          run(attempt + 1);
          return;
        }
        settled = true;
        res.statusCode = response.statusCode ?? 502;
        const responseHeaders = stripHop(response.headers);
        for (const [name, value] of Object.entries(responseHeaders))
          if (
            value !== undefined &&
            ![
              'x-request-id',
              'access-control-allow-origin',
              'access-control-allow-credentials',
            ].includes(name)
          )
            res.setHeader(name, value);
        response.on('end', cleanup);
        response.on('error', () => {
          cleanup();
          res.destroy();
        });
        response.pipe(res);
      });
      upstream.on('error', () => {
        cleanup();
        if (settled) {
          if (!res.writableFinished) res.destroy();
          return;
        }
        settled = true;
        if (attempt < retries && !expired) {
          run(attempt + 1);
          return;
        }
        gatewayError(
          res,
          expired ? 504 : 503,
          expired ? 'GATEWAY_TIMEOUT' : 'SERVICE_UNAVAILABLE',
          expired ? 'Upstream timed out' : 'Upstream unavailable',
          id,
        );
      });
      if (
        attempt > 0 ||
        (['GET', 'HEAD'].includes(req.method ?? '') &&
          !req.headers['content-length'] &&
          !req.headers['transfer-encoding'])
      )
        upstream.end();
      else req.pipe(upstream);
    };
    run(0);
  }
}
