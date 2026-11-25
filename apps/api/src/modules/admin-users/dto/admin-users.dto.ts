import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_SYSTEM_ROLE_CODES = ['PARTICIPANT', 'ADMIN'] as const;
export type SystemRoleCode = (typeof ALLOWED_SYSTEM_ROLE_CODES)[number];

export class ListAdminUsersQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must be at most 100' })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Case-insensitive email substring filter',
    example: 'researcher@andemta.et',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'email must be a string' })
  @MaxLength(255, { message: 'email filter must be at most 255 characters' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Filter by whether email has been verified',
    type: Boolean,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsOptional()
  @IsBoolean({ message: 'emailVerified must be a boolean' })
  emailVerified?: boolean;
}

export class AssignSystemRoleDto {
  @ApiProperty({
    description: 'System-scoped role code to assign',
    enum: ALLOWED_SYSTEM_ROLE_CODES,
    example: 'ADMIN',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'roleCode should not be empty' })
  @IsIn(ALLOWED_SYSTEM_ROLE_CODES, {
    message: 'roleCode must be one of PARTICIPANT, ADMIN',
  })
  roleCode!: SystemRoleCode;
}
