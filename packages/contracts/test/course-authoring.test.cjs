const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseContract, ContractValidationError } = require('../dist');
const invalid = (name, value) =>
  assert.throws(() => parseContract(name, value), ContractValidationError);

test('course metadata accepts legacy and enriched create/update payloads', () => {
  const legacy = { title: 'Course', description: 'Description' };
  parseContract('CreateCourseRequest', legacy);
  const metadata = {
    subtitle: 'Introduction',
    category: 'Programming',
    tags: ['TypeScript'],
    level: 'BEGINNER',
    language: 'vi',
    prerequisites: [],
    targetAudience: ['Students'],
    learningOutcomes: ['Build an API'],
    descriptionFormat: 'HTML',
  };
  parseContract('CreateCourseRequest', { ...legacy, ...metadata });
  parseContract('UpdateCourseRequest', { ...metadata, expectedVersion: 1 });
  for (const bad of [
    { level: 'EXPERT' },
    { tags: ['same', 'same'] },
    { category: ' ' },
    { learningOutcomes: [''] },
    { descriptionFormat: 'MARKDOWN' },
  ]) {
    invalid('CreateCourseRequest', { ...legacy, ...bad });
  }
  parseContract('CourseQuery', {
    category: 'Programming',
    tag: 'TypeScript',
    level: 'BEGINNER',
    language: 'vi',
  });
});

test('video attachments and reading HTML are type-specific and optional', () => {
  const base = { title: 'Lesson content', required: true };
  const video = {
    ...base,
    type: 'VIDEO',
    videoUrl: 'https://example.com/video.mp4',
    durationSeconds: 60,
  };
  const file = {
    fileName: 'notes.pdf',
    fileUrl: 'https://example.com/notes.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  };
  parseContract('CreateLearningItemRequest', video);
  parseContract('CreateLearningItemRequest', { ...video, attachments: [file] });
  parseContract('UpdateLearningItemRequest', {
    ...video,
    attachments: [],
    expectedVersion: 1,
  });
  for (const bad of [
    { sizeBytes: 0 },
    { sizeBytes: 1.5 },
    { fileUrl: 'javascript:alert(1)' },
    { fileName: '' },
  ]) {
    invalid('CreateLearningItemRequest', {
      ...video,
      attachments: [{ ...file, ...bad }],
    });
  }
  const reading = {
    ...base,
    type: 'READING',
    body: '<p>Before</p><img src="https://example.com/image.png"><p>After</p>',
  };
  parseContract('CreateLearningItemRequest', reading);
  parseContract('CreateLearningItemRequest', {
    ...reading,
    bodyFormat: 'HTML',
  });
  invalid('CreateLearningItemRequest', { ...reading, bodyFormat: 'MARKDOWN' });
  invalid('CreateLearningItemRequest', { ...reading, attachments: [file] });
  invalid('CreateLearningItemRequest', { ...video, bodyFormat: 'HTML' });
});
