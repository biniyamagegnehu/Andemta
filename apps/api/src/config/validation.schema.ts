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

  // Email / Brevo SMTP configuration (Phase 3.3)
  EMAIL_PROVIDER: Joi.string().valid('nodemailer').default('nodemailer'),
  EMAIL_HOST: Joi.string().default('smtp-relay.brevo.com'),
  EMAIL_PORT: Joi.number().port().default(587),
  EMAIL_SECURE: Joi.boolean().default(false),
  EMAIL_USER: Joi.string().optional().allow('').default(''),
  EMAIL_PASSWORD: Joi.string().optional().allow('').default(''),
  EMAIL_FROM: Joi.string().default('Andemta <no-reply@andemta.et>'),
  EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: Joi.number()
    .integer()
    .min(1)
    .default(30),
  FRONTEND_EMAIL_VERIFICATION_URL: Joi.string()
    .uri()
    .default('http://localhost:3000/verify-email'),
});
