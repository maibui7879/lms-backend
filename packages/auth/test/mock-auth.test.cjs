const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { MockAuthGuard, getMockUser } = require('../dist');
const ids = require('@lms/contracts/fixtures/ids.json');
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  MOCK_AUTH: process.env.MOCK_AUTH,
};
afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function run(header, environment = 'test', enabled = 'true', type = 'http') {
  process.env.NODE_ENV = environment;
  process.env.MOCK_AUTH = enabled;
  const request = {
    headers: { 'x-mock-user': header },
    user: { role: 'ADMIN' },
  };
  new MockAuthGuard().canActivate({
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request }),
  });
  return request;
}
test('all fixture identities map to expected roles and UUIDs', () => {
  for (const [name, id] of Object.entries(ids.users)) {
    const user = run(name).user;
    assert.equal(user.id, id);
    assert.equal(
      user.role,
      name.startsWith('student')
        ? 'STUDENT'
        : name.startsWith('instructor')
          ? 'INSTRUCTOR'
          : 'ADMIN',
    );
  }
});
test('fails closed outside explicitly enabled development/test', () => {
  for (const env of ['production', 'staging', ''])
    assert.throws(() => run('adminA', env));
  for (const enabled of ['false', '', 'TRUE'])
    assert.throws(() => run('adminA', 'test', enabled));
});
test('rejects missing, unknown, inherited or repeated headers and non HTTP contexts', () => {
  for (const value of [
    undefined,
    '',
    'toString',
    '__proto__',
    'unknown',
    ['studentA', 'adminA'],
  ])
    assert.throws(() => run(value));
  assert.throws(() => run('studentA', 'test', 'true', 'rpc'));
});
test('users are fresh objects; callers cannot mutate future identities', () => {
  getMockUser('studentA').role = 'ADMIN';
  assert.equal(getMockUser('studentA').role, 'STUDENT');
});
