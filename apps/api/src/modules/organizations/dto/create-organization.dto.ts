import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationType } from '@prisma/client';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Human-readable organization name',
    example: 'Addis Consumer Insights PLC',
    minLength: 2,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({ message: 'name should not be empty' })
  @IsString({ message: 'name must be a string' })
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  @MaxLength(120, { message: 'name must be at most 120 characters long' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'URL-friendly unique slug. Auto-generated from name if omitted.',
    example: 'addis-consumer-insights',
    minLength: 2,
    maxLength: 80,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsString({ message: 'slug must be a string' })
  @MinLength(2, { message: 'slug must be at least 2 characters long' })
  @MaxLength(80, { message: 'slug must be at most 80 characters long' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, numbers, and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Organization classification',
    enum: OrganizationType,
    default: OrganizationType.OTHER,
  })
  @IsOptional()
  @IsEnum(OrganizationType, {
    message: 'type must be one of BUSINESS, UNIVERSITY, OTHER',
  })
  type?: OrganizationType;
}
