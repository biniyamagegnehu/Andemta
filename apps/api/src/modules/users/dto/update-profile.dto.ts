import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_PROFILE_LANGUAGES = ['en', 'am', 'om', 'ti'] as const;
export type ProfileLanguage = (typeof ALLOWED_PROFILE_LANGUAGES)[number];

/**
 * Self-service profile update DTO.
 * Strictly whitelists only safe, non-security-sensitive profile fields.
 * Never accepts id, userId, email, passwordHash, tokenVersion, emailVerifiedAt, roles, or permissions.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User full display name (nullable to clear)',
    example: 'Biniyam Tesfaye',
    minLength: 2,
    maxLength: 120,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'fullName must be a string' })
  @MinLength(2, { message: 'fullName must be at least 2 characters long' })
  @MaxLength(120, { message: 'fullName must be at most 120 characters long' })
  fullName?: string | null;

  @ApiPropertyOptional({
    description: 'Contact phone number in E.164 format (nullable to clear)',
    example: '+251911223344',
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'phoneNumber must be a string' })
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message: 'phoneNumber must be a valid international phone number (7-15 digits)',
  })
  phoneNumber?: string | null;

  @ApiPropertyOptional({
    description: 'Preferred interface language',
    enum: ALLOWED_PROFILE_LANGUAGES,
    example: 'en',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsIn(ALLOWED_PROFILE_LANGUAGES, {
    message: 'preferredLanguage must be one of en, am, om, ti',
  })
  preferredLanguage?: ProfileLanguage;

  @ApiPropertyOptional({
    description: 'Short user biography (nullable to clear)',
    example: 'Consumer market researcher in Addis Ababa.',
    maxLength: 500,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value;
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString({ message: 'bio must be a string' })
  @MaxLength(500, { message: 'bio must be at most 500 characters long' })
  bio?: string | null;
}
