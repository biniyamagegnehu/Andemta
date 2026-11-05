import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Unique account identifier (UUID)',
    example: 'a0b1c2d3-e4f5-4a5b-8c9d-0e1f2a3b4c5d',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Normalized user email address',
    example: 'researcher@andemta.et',
  })
  email!: string;

  @ApiProperty({
    description: 'Timestamp when email was verified, or null if unverified',
    example: null,
    nullable: true,
  })
  emailVerifiedAt!: Date | null;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2026-11-05T18:00:00.000Z',
  })
  createdAt!: Date;
}

