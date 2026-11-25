import { IsIn, IsNotEmpty, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const ALLOWED_ORGANIZATION_ROLE_CODES = [
  'OWNER',
  'ADMIN',
  'RESEARCHER',
  'VIEWER',
] as const;

export type OrganizationRoleCode =
  (typeof ALLOWED_ORGANIZATION_ROLE_CODES)[number];

export class AddOrganizationMemberDto {
  @ApiProperty({
    description: 'UUID of the existing user to add to the organization',
    example: '11111111-2222-4333-8444-555555555555',
  })
  @IsNotEmpty({ message: 'userId should not be empty' })
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId!: string;

  @ApiProperty({
    description: 'Organization-scoped role code to assign',
    enum: ALLOWED_ORGANIZATION_ROLE_CODES,
    example: 'RESEARCHER',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'roleCode should not be empty' })
  @IsIn(ALLOWED_ORGANIZATION_ROLE_CODES, {
    message: 'roleCode must be one of OWNER, ADMIN, RESEARCHER, VIEWER',
  })
  roleCode!: OrganizationRoleCode;
}

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: 'New organization-scoped role code',
    enum: ALLOWED_ORGANIZATION_ROLE_CODES,
    example: 'ADMIN',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsNotEmpty({ message: 'roleCode should not be empty' })
  @IsIn(ALLOWED_ORGANIZATION_ROLE_CODES, {
    message: 'roleCode must be one of OWNER, ADMIN, RESEARCHER, VIEWER',
  })
  roleCode!: OrganizationRoleCode;
}
