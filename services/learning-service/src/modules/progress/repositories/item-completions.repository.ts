import { Injectable } from '@nestjs/common';
import { LearningDatabase } from '../../../database/learning-database';
import { ItemCompletion } from '../entities/item-completion.entity';

@Injectable()
export class ItemCompletionsRepository {
  constructor(private readonly database: LearningDatabase) {}

  async list(
    enrollmentId: string,
    contentVersion: number,
  ): Promise<ItemCompletion[]> {
    return this.database.run((database) =>
      database
        .getRepository(ItemCompletion)
        .findBy({ enrollmentId, contentVersion }),
    );
  }

  async complete(
    enrollmentId: string,
    contentVersion: number,
    learningItemId: string,
  ): Promise<ItemCompletion> {
    const key = { enrollmentId, contentVersion, learningItemId };
    return this.database.run(async (database) => {
      const repository = database.getRepository(ItemCompletion);
      await repository
        .createQueryBuilder()
        .insert()
        .values(key)
        .orIgnore()
        .updateEntity(false)
        .execute();
      return repository.findOneByOrFail(key);
    });
  }
}
