/** HTTP tests only verify routing; transaction rollback is tested separately. */
export function wireContentTransactionDouble(
  source: { transaction: jest.Mock },
  entries: [unknown, object][],
): void {
  const repositories = new Map(entries);
  const manager = {
    connection: source,
    getRepository: (entity: unknown) => repositories.get(entity),
    findOne: (entity: unknown, options: { where: unknown }) =>
      (
        repositories.get(entity) as { findOneBy: (where: unknown) => unknown }
      ).findOneBy(options.where),
  };
  for (const repository of repositories.values())
    Object.assign(repository, { manager });
  source.transaction.mockImplementation(async (_isolation, work) =>
    work(manager),
  );
}
