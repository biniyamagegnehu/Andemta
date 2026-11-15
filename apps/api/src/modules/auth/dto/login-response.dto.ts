import { ApiProperty } from '@nestjs/swagger';

export class LoginUserDto {
  @ApiProperty({
    description: 'Unique user account identifier (UUID v4)',
    example: 'c1f7a049-74d1-4db8-b570-5b5832a52df4',
  })
  id!: string;

  @ApiProperty({
    description: 'User registered email address',
    example: 'researcher@andemta.et',
  })
  email!: string;

  @ApiProperty({
    description: 'Timestamp when the user verified their email address',
    example: '2026-11-14T10:00:00.000Z',
  })
  emailVerifiedAt!: Date | null;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'Signed JSON Web Token for authorizing subsequent requests',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjMWY3YTA0OS03NGQxLTRkYjgtYjU3MC01YjU4MzJhNTJkZjQiLCJqdGkiOiJmMWYyZjNmNCIsImlzcyI6ImFuZGVtdGEtYXBpIiwiYXVkIjoiYW5kZW10YS1jbGllbnQiLCJpYXQiOjE3MzE1NzEyMDAsImV4cCI6MTczMTU3MjEwMH0.signature',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Authorization header token scheme',
    example: 'Bearer',
  })
  tokenType!: string;

  @ApiProperty({
    description: 'Token lifetime duration in seconds',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({
    description: 'Safe user account identity details',
    type: LoginUserDto,
  })
  user!: LoginUserDto;
}
