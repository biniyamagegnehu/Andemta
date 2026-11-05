import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { ExampleModule } from './example/example.module';
import { AuthModule } from './modules/auth/auth.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { REQUEST_ID_HEADER } from './common/constants';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    JobsModule,
    AuthModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('nodeEnv') === 'production';

        return {
          pinoHttp: {
            genReqId: (req) =>
              (req.headers[REQUEST_ID_HEADER] as string) ||
              (req as { id?: string }).id ||
              'req-init',
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    colorize: true,
                    translateTime: 'SYS:standard',
                  },
                },
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["set-cookie"]',
              'req.body.password',
              'req.body.refreshToken',
            ],
          },
        };
      },
    }),
    HealthModule,
    ExampleModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Register Request ID middleware across all HTTP routes
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
