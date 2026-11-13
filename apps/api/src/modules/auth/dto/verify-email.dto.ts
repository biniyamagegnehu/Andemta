import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Cryptographically secure one-time email verification token',
    example: 'dGhpcy1pcy1hLXZhbGlkLWJhc2U2NHVybC10b2tlbg',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'token should not be empty' })
  @IsString({ message: 'token must be a string' })
  @MaxLength(255, { message: 'token must be at most 255 characters long' })
  token!: string;
}

