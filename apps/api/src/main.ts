import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from './common/pipes/validation.pipe';
import { API_PREFIX, SWAGGER_DOCS_PATH } from './common/constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Attach structured Pino logger
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Retrieve configuration service
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('nodeEnv') === 'production';
  const port = configService.get<number>('port') || 4000;
  const frontendUrl =
    configService.get<string>('frontendUrl') || 'http://localhost:3000';

  // 1. Security: Helmet HTTP Headers
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? undefined
        : false, // Allows inline scripts/styles for Swagger in development
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 2. Security: CORS configuration
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-ID',
      'x-request-id',
    ],
    credentials: true,
  });

  // 3. Global API Prefix: /api/v1 (set exactly once)
  app.setGlobalPrefix(API_PREFIX);

  // 4. Request Lifecycle: Global Validation Pipe with strict DTO rules
  app.useGlobalPipes(createGlobalValidationPipe());

  // 5. Request Lifecycle: Global Response Transformation Interceptor
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformInterceptor(reflector));

  // 6. Request Lifecycle: Global Centralized Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // 7. Lifecycle: Graceful shutdown hooks
  app.enableShutdownHooks();

  // 8. Swagger / OpenAPI Documentation
  const swaggerEnabled = configService.get<boolean>('swagger.enabled');
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Andemta API')
      .setDescription(
        'Consumer Research Marketplace API connecting organizations with participants in Ethiopia.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Health', 'System uptime and operational readiness endpoints')
      .addTag('Auth', 'Authentication and account identity endpoints')
      .addTag('Examples', 'Foundation request lifecycle and validation demonstration endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(SWAGGER_DOCS_PATH, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  // 9. Start Server
  await app.listen(port);

  logger.log(`Andemta API started in ${configService.get<string>('nodeEnv')} mode`);
  logger.log(`API Base URL: http://localhost:${port}/${API_PREFIX}`);
  if (swaggerEnabled) {
    logger.log(`Swagger Docs: http://localhost:${port}/${SWAGGER_DOCS_PATH}`);
  }
}

bootstrap();
