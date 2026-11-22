import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotCommonPassword } from '../validators/is-not-common-password.validator';

export class ResetPasswordDto {
  @ApiProperty({
    description:
      'Cryptographically secure one-time password reset token received via email',
    example: 'E1dY9_X1Qo0Q1s_wYx7u3A9-V1b-1234567890abcdef',
  })
  @IsNotEmpty({ message: 'token should not be empty' })
  @IsString({ message: 'token must be a string' })
  token!: string;

  @ApiProperty({
    description:
      'New user password (minimum 12 characters, maximum 128 characters). Unicode characters and spaces are supported.',
    example: 'NewSecurePassw0rd!2026',
    minLength: 12,
    maxLength: 128,
  })
  @IsNotEmpty({ message: 'newPassword should not be empty' })
  @IsString({ message: 'newPassword must be a string' })
  @MinLength(12, { message: 'newPassword must be at least 12 characters long' })
  @MaxLength(128, { message: 'newPassword must be at most 128 characters long' })
  @IsNotCommonPassword()
  newPassword!: string;
}
