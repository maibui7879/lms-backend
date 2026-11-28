import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DataSource) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'course-service' };
  }

  @Get()
  async readiness() {
    try {
      await this.database.query('SELECT 1 FROM courses LIMIT 1');
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok', service: 'course-service', database: 'up' };
  }
}
