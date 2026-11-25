import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationType } from '@prisma/client';

/**
 * Permitted fields for updating an organization.
 * Status, ownership, and internal fields cannot be modified through this DTO.
 */
export class UpdateOrganizationDto {
  @ApiPropertyOptional({
    description: 'Updated organization name',
    example: 'Addis Consumer Research Group',
    minLength: 2,
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @MinLength(2, { message: 'name must be at least 2 characters long' })
  @MaxLength(120, { message: 'name must be at most 120 characters long' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated organization classification',
    enum: OrganizationType,
  })
  @IsOptional()
  @IsEnum(OrganizationType, {
    message: 'type must be one of BUSINESS, UNIVERSITY, OTHER',
  })
  type?: OrganizationType;
}
