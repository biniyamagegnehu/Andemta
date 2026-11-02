import { Injectable } from '@nestjs/common';
import { CreateExampleDto } from './dto/create-example.dto';
import { PaginatedResult } from '../common/interfaces/api-response.interface';

export interface ExampleEntity {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

@Injectable()
export class ExampleService {
  private readonly items: ExampleEntity[] = [
    {
      id: 'ex-001',
      name: 'Sample Participant',
      email: 'sample@andemta.et',
      role: 'participant',
      createdAt: new Date().toISOString(),
    },
  ];

  create(dto: CreateExampleDto): ExampleEntity {
    const newItem: ExampleEntity = {
      id: `ex-${Date.now()}`,
      name: dto.name,
      email: dto.email,
      role: dto.role || 'participant',
      createdAt: new Date().toISOString(),
    };
    this.items.push(newItem);
    return newItem;
  }

  findAll(): PaginatedResult<ExampleEntity> {
    return {
      data: this.items,
      meta: {
        page: 1,
        limit: 10,
        total: this.items.length,
        totalPages: 1,
      },
      message: 'Records retrieved successfully',
    };
  }

  findGuarded(requestId: string): { message: string; verifiedRequestId: string } {
    return {
      message: 'Guarded foundation endpoint accessed successfully',
      verifiedRequestId: requestId,
    };
  }
}

