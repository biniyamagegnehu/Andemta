export interface AppConfiguration {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  frontendUrl: string;
  swagger: {
    enabled: boolean;
  };
  database: {
    url?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
}

export default (): AppConfiguration => ({
  nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

