import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Course } from '../modules/courses/entities/course.entity';
import { Chapter } from '../modules/chapters/entities/chapter.entity';
import { Lesson } from '../modules/lessons/entities/lesson.entity';
import { LearningItem } from '../modules/learning-items/entities/learning-item.entity';

/** All outline writers acquire the course row first, then reread their parents.
 * Child creation participates too: a delete-only lock cannot prevent orphans.
 * READ COMMITTED ensures reads after a waiting lock see the committed writer.
 */
export async function contentTransaction<T>(
  source: DataSource,
  target: typeof Course | typeof Chapter | typeof Lesson | typeof LearningItem,
  id: string,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return source.transaction('READ COMMITTED', async (manager) => {
    const row = await manager.findOne(target, { where: { id } });
    if (!row) throw new NotFoundException('Content not found');
    const courseId = target === Course ? row.id : (row as Chapter).courseId;
    const course = await manager.findOne(Course, {
      where: { id: courseId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!course) throw new NotFoundException('Course not found');
    return work(manager);
  });
}
