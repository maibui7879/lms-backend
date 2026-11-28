const assert = require('node:assert/strict');
const { test } = require('node:test');
const document = require('../openapi/course.json');

test('course content lists return arrays inside the response envelope', () => {
  for (const [path, schema] of [
    ['/api/v1/courses/{id}/chapters', 'ChapterData'],
    ['/api/v1/chapters/{id}/lessons', 'LessonData'],
    ['/api/v1/lessons/{id}/learning-items', 'LearningItemData'],
  ]) {
    const operation = document.paths[path].get;
    assert.ok(operation.security.length);
    const response =
      operation.responses['200'].content['application/json'].schema;
    assert.equal(response.properties.data.type, 'array');
    assert.equal(
      response.properties.data.items.$ref,
      `#/components/schemas/${schema}`,
    );
    assert.ok(response.properties.meta);
  }
});
