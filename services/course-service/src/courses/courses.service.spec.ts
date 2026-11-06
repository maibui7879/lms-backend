import { ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { getMockUser } from '@lms/auth';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';

it('rejects inactive Instructor before reaching persistence', async () => {
  const create = jest.fn();
  const service = new CoursesService({
    create,
  } as unknown as Repository<Course>);
  await expect(
    service.create(
      { title: 'Course', description: '' },
      { ...getMockUser('instructorA'), status: 'INACTIVE' },
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(create).not.toHaveBeenCalled();
});
