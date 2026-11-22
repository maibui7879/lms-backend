import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheck: { check: jest.Mock };
  let db: { pingCheck: jest.Mock };

  beforeEach(async () => {
    healthCheck = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        info: {},
        error: {},
        details: {},
      }),
    };
    db = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheck },
        { provide: TypeOrmHealthIndicator, useValue: db },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('should report the service as healthy', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      info: {},
      error: {},
      details: {},
    });
    expect(healthCheck.check).toHaveBeenCalledWith([expect.any(Function)]);
    const healthChecks = healthCheck.check.mock.calls[0][0] as Array<
      () => unknown
    >;
    await healthChecks[0]();
    expect(db.pingCheck).toHaveBeenCalledWith('database');
  });
});
