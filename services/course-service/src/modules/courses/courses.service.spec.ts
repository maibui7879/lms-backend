import { ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { getMockUser } from '@lms/auth';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { Enrollment } from '../enrollments/entities/enrollment.entity';

it('rejects inactive Instructor before reaching persistence', async () => {
  const create = jest.fn();
  const service = new CoursesService(
    {
      create,
    } as unknown as Repository<Course>,
    {} as never,
    {} as never,
    {} as never,
    { findOneBy: jest.fn() } as unknown as Repository<Enrollment>,
  );
  await expect(
    service.create(
      { title: 'Course', description: '' },
      { ...getMockUser('instructorA'), status: 'INACTIVE' },
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(create).not.toHaveBeenCalled();
});
