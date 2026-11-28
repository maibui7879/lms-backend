import { resolveRoute, gatewayRoutes } from './routes';

describe('resolveRoute', () => {
  it('resolves every implemented public controller route', () => {
    for (const endpoint of gatewayRoutes) {
      expect(
        resolveRoute(
          endpoint.method.toUpperCase(),
          endpoint.path.replace(/\{[^}]+\}/g, 'example-id'),
        ),
      ).toEqual({ service: endpoint.service, access: endpoint.access });
    }
  });

  it('does not expose planned Quiz endpoints or course assessment summaries', () => {
    expect(resolveRoute('POST', '/api/v1/quizzes')).toBeUndefined();
    expect(
      resolveRoute('GET', '/api/v1/courses/id/assessments'),
    ).toBeUndefined();
    expect(resolveRoute('GET', '/api/v1/users/me')).toEqual({
      service: 'identity',
      access: 'AUTHENTICATED',
    });
    expect(resolveRoute('POST', '/api/v1/users/me/password')?.service).toBe(
      'identity',
    );
    expect(
      resolveRoute('GET', '/api/v1/learning/courses/id/me/quiz-scores')
        ?.service,
    ).toBe('learning');
  });

  it.each([
    'public-key',
    'google',
    'google/callback',
    'github',
    'github/callback',
  ])('allows public auth GET %s', (path) => {
    expect(resolveRoute('GET', `/api/v1/auth/${path}`)).toEqual({
      service: 'identity',
      access: 'PUBLIC',
    });
  });
  it.each(['verify-email', 'resend-otp', 'forgot-password', 'reset-password'])(
    'allows public auth POST %s',
    (path) => {
      expect(resolveRoute('POST', `/api/v1/auth/${path}`)?.access).toBe(
        'PUBLIC',
      );
    },
  );
  it('includes protected Identity controller routes and prefers literals', () => {
    for (const method of ['GET', 'POST'])
      expect(
        resolveRoute(method, '/api/v1/users/me/role-requests')?.access,
      ).toBe('AUTHENTICATED');
    expect(resolveRoute('POST', '/api/v1/auth/logout-all')?.access).toBe(
      'AUTHENTICATED',
    );
    expect(
      resolveRoute('GET', '/api/v1/admin/users/role-requests')?.access,
    ).toBe('ADMIN');
    expect(
      resolveRoute('PATCH', '/api/v1/admin/users/role-requests/123/review')
        ?.access,
    ).toBe('ADMIN');
    expect(
      resolveRoute('GET', '/api/v1/notifications/unread-count')?.service,
    ).toBe('notification');
  });
  it.each([
    '/api/v1/unknown',
    '/api/v1/internal/users/123',
    '/api/v1/courses/api/v1/internal',
    '/api/v1/auth/../auth/login',
    '/api/v1/auth/%2e%2e/login',
    '/api/v1/auth%2flogin',
    '/api/v1/auth%5clogin',
    '/api/v1/auth/%252e%252e/login',
    '/api/v1/auth%252flogin',
    '/api/v1/auth/login?x=1',
    '/api/v1/auth/%zz',
    '/api/v1/auth/./login',
    '/api/v1/courses/%2e',
    '/api/v1/auth//login',
  ])('rejects unknown or unsafe path %s', (path) =>
    expect(resolveRoute('POST', path)).toBeUndefined(),
  );
  it('rejects wrong methods', () => {
    expect(resolveRoute('DELETE', '/api/v1/auth/login')).toBeUndefined();
    expect(
      resolveRoute('POST', '/api/v1/auth/google/callback'),
    ).toBeUndefined();
  });
});
