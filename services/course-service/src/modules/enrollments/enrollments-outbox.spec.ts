import { QueryFailedError, Repository } from 'typeorm';
import type { AuthUser } from '@lms/contracts';
import { Enrollment } from './entities/enrollment.entity';
import { Course } from '../courses/entities/course.entity';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentOutboxService } from '../outbox/enrollment-outbox.service';

describe('Enrollment/outbox atomicity (transaction double)', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const user = { id, role: 'STUDENT', status: 'ACTIVE' } as AuthUser;
  const committed: unknown[] = [];
  let staged: unknown[];
  const save = jest.fn(async (row) => {
    const saved = { ...row, id };
    staged.push(saved);
    return saved;
  });
  const update = jest.fn(async (_where, value) => {
    staged.push(value);
    return { affected: 1 };
  });
  const insert = jest.fn(async (_entity, value) => {
    staged.push(value);
    return {};
  });
  const repository = {
    create: (row: unknown) => row,
    save,
    update,
    findOneBy: jest.fn(),
    findOne: jest.fn(),
  };
  const manager = {
    queryRunner: { isTransactionActive: true },
    insert,
    getRepository: (entity: unknown) =>
      entity === Enrollment
        ? repository
        : {
            findOneBy: async () => ({
              id,
              status: 'PUBLISHED',
              contentVersion: 7,
            }),
          },
  };
  const transaction = jest.fn(async (work) => {
    staged = [];
    const result = await work(manager);
    committed.push(...staged);
    return result;
  });
  const service = new EnrollmentsService(
    { manager: { transaction } } as unknown as Repository<Enrollment>,
    {} as Repository<Course>,
    new EnrollmentOutboxService(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    committed.length = 0;
    repository.findOneBy.mockResolvedValue(null);
    repository.findOne.mockResolvedValue({
      id,
      courseId: id,
      userId: id,
      status: 'ACTIVE',
    });
  });

  it('commits enrollment and its pinned event together', async () => {
    const result = await service.create(id, user, 'request-id');
    expect(committed).toHaveLength(2);
    expect(committed[1]).toMatchObject({
      event: { payload: result, correlationId: 'request-id' },
    });
  });

  it('does not commit enrollment if event insertion fails', async () => {
    insert.mockRejectedValueOnce(new Error('outbox write failed'));
    await expect(service.create(id, user)).rejects.toThrow(
      'outbox write failed',
    );
    expect(save).toHaveBeenCalled();
    expect(committed).toEqual([]);
  });

  it('does not commit cancellation if event insertion fails', async () => {
    insert.mockRejectedValueOnce(new Error('outbox write failed'));
    await expect(service.cancel(id, user)).rejects.toThrow(
      'outbox write failed',
    );
    expect(update).toHaveBeenCalled();
    expect(committed).toEqual([]);
  });

  it('maps a concurrent current-enrollment uniqueness race to ALREADY_ENROLLED', async () => {
    save.mockRejectedValueOnce(
      new QueryFailedError(
        'insert',
        [],
        Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'IDX_enrollments_current_pair',
        }),
      ),
    );
    await expect(service.create(id, user)).rejects.toMatchObject({
      response: { code: 'ALREADY_ENROLLED' },
    });
    expect(insert).not.toHaveBeenCalled();
    expect(committed).toEqual([]);
  });

  it('does not hide unrelated database uniqueness errors', async () => {
    const failure = new QueryFailedError(
      'insert',
      [],
      Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'other_index',
      }),
    );
    save.mockRejectedValueOnce(failure);
    await expect(service.create(id, user)).rejects.toBe(failure);
  });
});
