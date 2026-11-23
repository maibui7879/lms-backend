import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  identityKeys,
  serviceKeys,
  serveIdentityAccess,
} from './fixtures/identity-auth';

const environment = { ...process.env };
const identity = createServer((request, response) => {
  if (!serveIdentityAccess(request, response)) response.writeHead(404).end();
});

beforeAll(async () => {
  await new Promise<void>((resolve) =>
    identity.listen(0, '127.0.0.1', resolve),
  );
  process.env.IDENTITY_URL = `http://127.0.0.1:${(identity.address() as AddressInfo).port}`;
  process.env.JWT_ISSUER = 'identity-service';
  process.env.JWT_PUBLIC_KEY = identityKeys.publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
  process.env.IDENTITY_INTERNAL_JWT_PRIVATE_KEY = serviceKeys.privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
});

afterAll(async () => {
  identity.closeAllConnections();
  await new Promise<void>((resolve) => identity.close(() => resolve()));
  process.env = environment;
});
