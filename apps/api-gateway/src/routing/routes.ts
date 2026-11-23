import { ENDPOINTS, type EndpointContract } from '@lms/contracts';

type RoutePolicy = Pick<EndpointContract, 'service' | 'access'>;

type Route = RoutePolicy & { method: string; path: string };

const hasUnsafeCharacters = (path: string): boolean =>
  /[?#\\\s]/.test(path) ||
  path.split('').some((character) => character.charCodeAt(0) < 32);

const extra = (
  method: string,
  path: string,
  access: RoutePolicy['access'],
): Route => ({
  method,
  path: `/api/v1/${path}`,
  access,
  service: 'identity',
});

const routes: Route[] = [
  ...ENDPOINTS,
  ...['verify-email', 'resend-otp', 'forgot-password', 'reset-password'].map(
    (path) => extra('post', `auth/${path}`, 'PUBLIC'),
  ),
  ...[
    'public-key',
    'google',
    'google/callback',
    'github',
    'github/callback',
  ].map((path) => extra('get', `auth/${path}`, 'PUBLIC')),
  extra('post', 'auth/logout-all', 'AUTHENTICATED'),
  extra('post', 'users/me/role-requests', 'AUTHENTICATED'),
  extra('get', 'users/me/role-requests', 'AUTHENTICATED'),
  extra('patch', 'admin/users/role-requests/{id}/review', 'ADMIN'),
  extra('get', 'admin/users/role-requests', 'ADMIN'),
];

const compiled = routes
  .map((route) => ({
    ...route,
    segments: route.path.split('/'),
  }))
  .sort((a, b) => {
    for (let i = 0; i < Math.min(a.segments.length, b.segments.length); i++) {
      const difference =
        Number(a.segments[i].startsWith('{')) -
        Number(b.segments[i].startsWith('{'));
      if (difference) return difference;
    }
    return b.segments.length - a.segments.length;
  });

/** Accept a pathname only; never normalize an untrusted path into a public route. */
export function resolveRoute(
  method: string,
  pathname: string,
): RoutePolicy | undefined {
  if (
    !pathname.startsWith('/') ||
    hasUnsafeCharacters(pathname) ||
    /%(?:2f|5c|25)/i.test(pathname)
  )
    return undefined;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (
    decoded.includes('..') ||
    decoded.includes('/api/v1/internal') ||
    hasUnsafeCharacters(decoded)
  )
    return undefined;
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '.')) return undefined;
  const route = compiled.find(
    (candidate) =>
      candidate.access !== 'INTERNAL' &&
      candidate.method === method.toLowerCase() &&
      candidate.segments.length === segments.length &&
      candidate.segments.every((segment, index) =>
        segment.startsWith('{')
          ? segments[index].length > 0
          : segment === segments[index],
      ),
  );
  return route ? { service: route.service, access: route.access } : undefined;
}
