import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address for account identification and notifications',
    example: 'researcher@andemta.et',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsNotEmpty({ message: 'email should not be empty' })
  @IsString({ message: 'email must be a string' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255, { message: 'email must be at most 255 characters long' })
  email!: string;

  @ApiProperty({
    description:
      'User password (minimum 12 characters, maximum 128 characters). Unicode characters and spaces are supported.',
    example: 'SecurePassw0rd!2026',
    minLength: 12,
    maxLength: 128,
  })
  @IsNotEmpty({ message: 'password should not be empty' })
  @IsString({ message: 'password must be a string' })
  @MinLength(12, { message: 'password must be at least 12 characters long' })
  @MaxLength(128, { message: 'password must be at most 128 characters long' })
  password!: string;
}

