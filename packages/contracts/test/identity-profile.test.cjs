const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseContract,
  ContractValidationError,
  ENDPOINTS,
} = require('../dist');

test('extended profile update is versioned and rejects unsupported fields', () => {
  parseContract('UpdateProfileRequest', {
    expectedVersion: 1,
    firstName: 'Mai',
    lastName: 'Bui',
    phoneNumber: null,
    gender: 'OTHER',
    githubUrl: 'https://github.com/example',
    dateOfBirth: '2000-01-01',
  });
  for (const value of [
    { firstName: 'Mai' },
    { expectedVersion: 1, gender: 'UNKNOWN' },
    { expectedVersion: 1, role: 'ADMIN' },
  ]) {
    assert.throws(
      () => parseContract('UpdateProfileRequest', value),
      ContractValidationError,
    );
  }
});

test('password change retains minimum twelve characters for new passwords', () => {
  parseContract('ChangePasswordRequest', {
    currentPassword: 'old-pass',
    newPassword: 'new-password-123',
  });
  assert.throws(
    () =>
      parseContract('ChangePasswordRequest', {
        currentPassword: 'old-pass',
        newPassword: 'short123',
      }),
    ContractValidationError,
  );
  assert.equal(
    ENDPOINTS.find((e) => e.operationId === 'deactivateMyAccount').success,
    204,
  );
  assert.equal(
    ENDPOINTS.find((e) => e.operationId === 'clearOptionalProfile').response,
    'UserProfile',
  );
});
