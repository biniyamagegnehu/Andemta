import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { HealthService, HealthData } from './health.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check endpoint',
    description: 'Returns service uptime, version, and running status',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Andemta API is operational',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Andemta API is healthy' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: { type: 'string', example: '2026-11-02T12:00:00.000Z' },
            service: { type: 'string', example: 'andemta-api' },
            version: { type: 'string', example: '0.1.0' },
            uptime: { type: 'number', example: 42 },
            environment: { type: 'string', example: 'development' },
          },
        },
        meta: { type: 'object', nullable: true, example: null },
      },
    },
  })
  @ResponseMessage('Andemta API is healthy')
  getHealth(): HealthData {
    return this.healthService.check();
  }
}
