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

test('authoring read APIs document the existing response schemas and ownership', () => {
  for (const [path, schema] of [
    ['/api/v1/instructor/courses/{id}', 'CourseData'],
    ['/api/v1/course-revisions/{id}/outline', 'CourseOutlineData'],
  ]) {
    const operation = document.paths[path].get;
    assert.ok(operation.security.length);
    assert.equal(
      operation.responses['200'].content['application/json'].schema.properties
        .data.$ref,
      `#/components/schemas/${schema}`,
    );
  }
});

test('delete/reorder content requests accept revisionId and lesson reorder returns an array', () => {
  assert.ok(
    document.components.schemas.DomainErrorCode.anyOf.some(
      (entry) => entry.const === 'CONTENT_NOT_EMPTY',
    ),
  );
  for (const [method, path, schema] of [
    ['delete', '/api/v1/chapters/{id}', 'RevisionVersionRequest'],
    ['delete', '/api/v1/lessons/{id}', 'RevisionVersionRequest'],
    ['delete', '/api/v1/learning-items/{id}', 'RevisionVersionRequest'],
    ['put', '/api/v1/courses/{id}/chapters/order', 'RevisionReorderRequest'],
    ['put', '/api/v1/chapters/{id}/lessons/order', 'RevisionReorderRequest'],
    ['put', '/api/v1/lessons/{id}/items/order', 'RevisionReorderRequest'],
  ]) {
    assert.equal(
      document.paths[path][method].requestBody.content['application/json']
        .schema.$ref,
      `#/components/schemas/${schema}`,
    );
  }
  const data =
    document.paths['/api/v1/chapters/{id}/lessons/order'].put.responses['200']
      .content['application/json'].schema.properties.data;
  assert.equal(data.type, 'array');
  assert.equal(data.items.$ref, '#/components/schemas/LessonData');
});
