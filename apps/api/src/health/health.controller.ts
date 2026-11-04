import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';
import {
  HealthService,
  LivenessData,
  ReadinessData,
} from './health.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness health check endpoint',
    description:
      'Non-blocking probe returning service uptime, version, and process status.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Andemta API process is operational',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Andemta API is healthy' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: {
              type: 'string',
              example: '2026-11-04T06:00:00.000Z',
            },
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
  getHealth(): LivenessData {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness health check endpoint',
    description:
      'Actively verifies PostgreSQL and Redis connectivity. Returns 200 when ready, 503 if any dependency is down.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'All infrastructure dependencies are healthy and reachable',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Andemta API infrastructure is ready',
        },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'ok' },
            timestamp: {
              type: 'string',
              example: '2026-11-04T06:00:00.000Z',
            },
            service: { type: 'string', example: 'andemta-api' },
            version: { type: 'string', example: '0.1.0' },
            uptime: { type: 'number', example: 42 },
            environment: { type: 'string', example: 'development' },
            checks: {
              type: 'object',
              properties: {
                database: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'up' },
                    responseTimeMs: { type: 'number', example: 4 },
                  },
                },
                redis: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'up' },
                    responseTimeMs: { type: 'number', example: 1 },
                  },
                },
              },
            },
          },
        },
        meta: { type: 'object', nullable: true, example: null },
      },
    },
  })
  @SwaggerApiResponse({
    status: 503,
    description: 'One or more infrastructure dependencies are unavailable',
  })
  @ResponseMessage('Andemta API infrastructure is ready')
  async getReadiness(): Promise<ReadinessData> {
    const { isReady, data, failingDependencies } =
      await this.healthService.checkReadiness();

    if (!isReady) {
      throw new ServiceUnavailableException({
        message: 'One or more infrastructure services are unavailable',
        errors: failingDependencies.map((dep) => {
          const checkInfo = data.checks[dep as keyof typeof data.checks];
          return {
            field: dep,
            message:
              checkInfo?.error ||
              `Service ${dep} is unhealthy or unreachable`,
          };
        }),
      });
    }

    return data;
  }
}
