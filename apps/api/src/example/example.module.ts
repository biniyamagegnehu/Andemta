import { Module } from '@nestjs/common';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';
import { BaseGuard } from '../common/guards/base.guard';

@Module({
  controllers: [ExampleController],
  providers: [ExampleService, BaseGuard],
  exports: [ExampleService],
})
export class ExampleModule {}

