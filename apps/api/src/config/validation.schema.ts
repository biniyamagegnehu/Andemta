import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  // PostgreSQL Database URL (Local Windows native installation)
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .default(
      'postgresql://postgres:postgres@localhost:5432/andemta_db?schema=public',
    ),

  // Redis configuration (Local WSL2 Ubuntu instance accessible on localhost)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow('').default(''),

  // Swagger documentation availability flag
  SWAGGER_ENABLED: Joi.boolean().default(true),
});
