import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),

  // Database URL is optional in Phase 1 (reserved for Phase 2)
  DATABASE_URL: Joi.string().optional().allow(''),

  // Redis configuration is optional in Phase 1 (reserved for Phase 2)
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),

  // Swagger documentation availability flag
  SWAGGER_ENABLED: Joi.boolean().default(true),
});

