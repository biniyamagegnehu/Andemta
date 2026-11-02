import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { environmentValidationSchema } from './validation.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
      envFilePath: ['.env', '../../.env'],
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}

