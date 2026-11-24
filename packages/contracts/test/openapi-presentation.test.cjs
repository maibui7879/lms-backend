const { test } = require('node:test');
const assert = require('node:assert/strict');

for (const name of [
  'openapi',
  'openapi/identity',
  'openapi/course',
  'openapi/quiz',
  'openapi/learning',
  'openapi/notification',
]) {
  test(`${name}: errors remain concise and success schemas stay documented`, () => {
    const document = require(`../${name}.json`);
    assert.ok(document.info.description.includes('Quy ước lỗi dùng chung'));
    assert.ok(document.components.schemas.ApiErrorResponse);

    for (const operations of Object.values(document.paths)) {
      for (const operation of Object.values(operations)) {
        for (const [status, response] of Object.entries(operation.responses)) {
          if (Number(status) >= 400) {
            assert.ok(response.description.length > 0);
            assert.equal(response.content, undefined);
          }
          if (
            Number(status) >= 200 &&
            Number(status) < 300 &&
            status !== '204'
          ) {
            assert.ok(
              response.content,
              `${operation.operationId} must retain success content`,
            );
          }
        }
      }
    }
  });
}
