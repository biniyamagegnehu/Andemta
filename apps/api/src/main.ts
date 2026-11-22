import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createGlobalValidationPipe } from './common/pipes/validation.pipe';
import { API_PREFIX, SWAGGER_DOCS_PATH } from './common/constants';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Attach structured Pino logger
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Retrieve configuration service
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('nodeEnv') === 'production';
  const port = configService.get<number>('port') || 4000;
  const frontendUrl =
    configService.get<string>('frontendUrl') || 'http://localhost:3000';
  const swaggerEnabled = Boolean(configService.get<boolean>('swagger.enabled'));
  const trustProxy = configService.get<string | boolean>('trustProxy', false);

  // Configure reverse proxy IP trust deliberately to prevent IP header spoofing
  if (trustProxy && trustProxy !== 'false') {
    app.set('trust proxy', trustProxy === 'true' ? true : trustProxy);
  }

  // 1. Security: Helmet HTTP Headers with deliberate production Content Security Policy
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? swaggerEnabled
          ? undefined // Allows Swagger UI when explicitly enabled in production
          : {
              directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'none'"],
              },
            }
        : false, // Allows inline scripts/styles for Swagger in development
      crossOriginEmbedderPolicy: isProduction ? true : false,
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

  // 1b. Security: Cookie Parser Middleware for HttpOnly Refresh Tokens (Phase 3.5)
  app.use(cookieParser());

  // 2. Security: CORS configuration (restrict localhost origins to development / test only)
  const allowedOrigins = isProduction
    ? [frontendUrl]
    : [frontendUrl, 'http://localhost:3000', 'http://127.0.0.1:3000'];

  app.enableCors({
    origin: allowedOrigins,
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

  // 8. Swagger / OpenAPI Documentation (disabled by default in production)
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
