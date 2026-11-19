import { getMockUser } from '@lms/auth';
import { CourseRevisionsService } from '../course-revisions/course-revisions.service';

it('allows active Admin to get and list another instructor revision', async () => {
  const now = new Date();
  const revision = { id: 'revision', courseId: 'course', createdAt: now };
  const revisions = {
    findOneBy: jest.fn().mockResolvedValue(revision),
    findAndCount: jest.fn().mockResolvedValue([[revision], 1]),
  };
  const courses = {
    findOneBy: jest.fn().mockResolvedValue({
      id: 'course',
      instructorId: getMockUser('instructorA').id,
    }),
  };
  const service = new CourseRevisionsService(
    courses as never,
    {} as never,
    revisions as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const admin = getMockUser('adminA');
  await expect(service.getRevision('revision', admin)).resolves.toMatchObject({
    id: 'revision',
  });
  await expect(
    service.listRevisions('course', {}, admin),
  ).resolves.toMatchObject({ total: 1 });
  await expect(
    service.getRevision('revision', { ...admin, status: 'INACTIVE' }),
  ).rejects.toThrow('Active admin');
  await expect(
    service.getRevision('revision', getMockUser('instructorB')),
  ).rejects.toThrow('Course ownership');
});
