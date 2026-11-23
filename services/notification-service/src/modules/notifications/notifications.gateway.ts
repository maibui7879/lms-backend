import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type {
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { OnModuleDestroy } from '@nestjs/common';
import type { AuthUser, CourseNotificationData } from '@lms/contracts';
import { randomUUID } from 'node:crypto';
import type { Namespace, Socket } from 'socket.io';
import { NotificationAuthGuard } from '../../common/notification-auth.guard';

function allowedOrigin(origin: string | undefined): boolean {
  return (
    origin === undefined ||
    (
      process.env.NOTIFICATION_ALLOWED_ORIGINS ??
      'http://localhost:3000,http://localhost:5173'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(origin)
  );
}
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: (origin, callback) => callback(null, allowedOrigin(origin)) },
  allowRequest: (request, callback) =>
    callback(null, allowedOrigin(request.headers.origin)),
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() server: Namespace;
  private readonly identities = new Map<
    Socket,
    {
      user: AuthUser;
      authorization: string;
      expiresAt: number;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(private readonly auth: NotificationAuthGuard) {}
  async handleConnection(client: Socket): Promise<void> {
    try {
      if (!allowedOrigin(client.handshake.headers.origin))
        throw new Error('Origin rejected');
      const token: unknown = client.handshake.auth?.accessToken;
      if (
        typeof token !== 'string' ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
      )
        throw new Error('Access token required');
      const authorization = `Bearer ${token}`;
      const user = await this.auth.authenticate(authorization);
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as { exp?: number };
      const expiresAt = Number(claims.exp) * 1000;
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
        throw new Error('Expired token');
      if (!client.connected) return;
      const expire = () => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          this.handleDisconnect(client);
          client.disconnect(true);
        } else {
          const identity = this.identities.get(client);
          if (identity)
            identity.timer = setTimeout(
              expire,
              Math.min(remaining, 2_147_483_647),
            );
        }
      };
      this.identities.set(client, {
        user,
        authorization,
        expiresAt,
        timer: setTimeout(
          expire,
          Math.min(expiresAt - Date.now(), 2_147_483_647),
        ),
      });
    } catch {
      this.handleDisconnect(client);
      client.disconnect(true);
    }
  }
  handleDisconnect(client: Socket): void {
    const identity = this.identities.get(client);
    if (identity) clearTimeout(identity.timer);
    this.identities.delete(client);
  }
  onModuleDestroy(): void {
    for (const client of this.identities.keys()) {
      this.handleDisconnect(client);
      client.disconnect(true);
    }
  }
  async publish(
    data: CourseNotificationData,
    recipientId: string,
  ): Promise<void> {
    for (const [client, identity] of this.identities) {
      if (identity.user.id !== recipientId) continue;
      try {
        if (!client.connected || identity.expiresAt <= Date.now())
          throw new Error('Expired connection');
        await this.auth.authenticate(identity.authorization);
        if (!client.connected || identity.expiresAt <= Date.now())
          throw new Error('Expired connection');
        client.emit('notification.created', {
          data,
          meta: { requestId: randomUUID() },
        });
      } catch {
        this.handleDisconnect(client);
        client.disconnect(true);
      }
    }
  }
}
