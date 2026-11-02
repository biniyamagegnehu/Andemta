import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
} from '@nestjs/swagger';
import { ExampleService, ExampleEntity } from './example.service';
import { CreateExampleDto } from './dto/create-example.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequestId } from '../common/decorators/request-id.decorator';
import { BaseGuard } from '../common/guards/base.guard';
import { PaginatedResult } from '../common/interfaces/api-response.interface';

@ApiTags('Examples')
@Controller('examples')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Demonstrate DTO validation and 201 Created envelope',
    description:
      'Validates body using class-validator and returns standard response envelope',
  })
  @SwaggerApiResponse({
    status: 201,
    description: 'Resource successfully created',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Validation failed',
  })
  @ResponseMessage('Example resource created successfully')
  create(@Body() dto: CreateExampleDto): ExampleEntity {
    return this.exampleService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Demonstrate paginated response envelope with metadata',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Records retrieved successfully',
  })
  @ResponseMessage('Records retrieved successfully')
  findAll(): PaginatedResult<ExampleEntity> {
    return this.exampleService.findAll();
  }

  @Get('guarded')
  @UseGuards(BaseGuard)
  @ApiOperation({
    summary: 'Demonstrate Guard execution and RequestId parameter decorator',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Guarded access successful',
  })
  @ResponseMessage('Guarded endpoint executed successfully')
  findGuarded(
    @RequestId() requestId: string,
  ): { message: string; verifiedRequestId: string } {
    return this.exampleService.findGuarded(requestId);
  }
}

