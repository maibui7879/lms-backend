import type { Socket } from 'socket.io';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationAuthGuard } from '../../common/notification-auth.guard';
import type { CourseNotificationData } from '@lms/contracts';

describe('Notification gateway connection lifecycle', () => {
  const previous = { ...process.env };
  let gateway: NotificationsGateway;
  const authenticate = jest.fn();
  function socket(accessToken: unknown, origin = 'http://localhost:3000') {
    return {
      connected: true,
      handshake: { auth: { accessToken }, headers: { origin }, query: {} },
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Socket;
  }
  const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 2 })).toString('base64url')}.sig`;
  beforeEach(() => {
    jest.useFakeTimers();
    authenticate.mockReset().mockResolvedValue({ id: 'owner' });
    gateway = new NotificationsGateway({
      authenticate,
    } as unknown as NotificationAuthGuard);
    delete process.env.NOTIFICATION_ALLOWED_ORIGINS;
  });
  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
    process.env = { ...previous };
  });
  it.each([undefined, {}, ['token'], 'mock-student', 'Bearer abc.def.ghi'])(
    'rejects malformed handshake auth %p',
    async (value) => {
      const client = socket(value);
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(authenticate).not.toHaveBeenCalled();
    },
  );
  it('rejects origins and query-only credentials', async () => {
    const rejected = socket(token, 'https://untrusted.test');
    await gateway.handleConnection(rejected);
    const query = socket(undefined);
    query.handshake.query.accessToken = token;
    await gateway.handleConnection(query);
    expect(rejected.disconnect).toHaveBeenCalledWith(true);
    expect(query.disconnect).toHaveBeenCalledWith(true);
  });
  it('disconnects at expiry and releases its timer', async () => {
    const client = socket(token);
    await gateway.handleConnection(client);
    expect(client.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2100);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('revalidates Identity before emitting and fails closed', async () => {
    const client = socket(token);
    await gateway.handleConnection(client);
    authenticate.mockRejectedValueOnce(new Error('inactive'));
    await gateway.publish(
      { id: 'notification' } as CourseNotificationData,
      'owner',
    );
    expect(client.emit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
