import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  IsOptional,
  IsIn,
} from 'class-validator';

export class CreateExampleDto {
  @ApiProperty({
    description: 'Name of the sample research subject or entry',
    example: 'Abebe Bikila',
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name!: string;

  @ApiProperty({
    description: 'Valid email address for contact or notification',
    example: 'abebe@example.com',
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({
    description: 'Role classification for demonstration',
    example: 'participant',
    required: false,
    enum: ['participant', 'researcher', 'organization'],
  })
  @IsOptional()
  @IsIn(['participant', 'researcher', 'organization'], {
    message: 'Role must be one of: participant, researcher, organization',
  })
  role?: string;
}

