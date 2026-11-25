import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as SwaggerApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationContext,
  PERMISSION,
  RequirePermissions,
} from '../rbac';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OrganizationMembersService } from './organization-members.service';
import {
  AddOrganizationMemberDto,
  UpdateMemberRoleDto,
} from './dto/membership.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@ApiTags('Organization Members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrganizationAuthGuard)
@Controller('organizations/:organizationId/members')
export class OrganizationMembersController {
  constructor(private readonly membersService: OrganizationMembersService) {}

  @Get()
  @RequirePermissions(PERMISSION.ORGANIZATION_MEMBERS_READ)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiOperation({
    summary: 'List active organization members',
    description:
      'Returns paginated active members of the organization. Requires organization.members.read.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Members retrieved' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @ResponseMessage('Organization members retrieved successfully')
  async listMembers(
    @CurrentOrganization() org: OrganizationContext,
    @Query() query: PaginationQueryDto,
  ) {
    return this.membersService.listMembers(org.organizationId, query);
  }

  @Post()
  @RequirePermissions(PERMISSION.ORGANIZATION_MEMBERS_INVITE)
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiOperation({
    summary: 'Add an existing user to the organization',
    description:
      'Adds an existing user with an ORGANIZATION-scoped role. Requires organization.members.invite. Only OWNER can assign OWNER.',
  })
  @SwaggerApiResponse({ status: 201, description: 'Member added' })
  @SwaggerApiResponse({ status: 400, description: 'Validation error' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'User or organization not found' })
  @SwaggerApiResponse({ status: 409, description: 'User is already an active member' })
  @ResponseMessage('Organization member added successfully')
  async addMember(
    @CurrentOrganization() org: OrganizationContext,
    @Body() dto: AddOrganizationMemberDto,
  ) {
    return this.membersService.addMember(org, dto);
  }

  @Patch(':membershipId/role')
  @RequirePermissions(PERMISSION.ORGANIZATION_MEMBERS_UPDATE)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiParam({ name: 'membershipId', description: 'Membership UUID' })
  @ApiOperation({
    summary: "Change an organization member's role",
    description:
      'Updates an active member role within the route organization. Requires organization.members.update. Protects last OWNER and prevents self-modification or privilege escalation.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Member role updated' })
  @SwaggerApiResponse({ status: 400, description: 'Validation error' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'Membership not found' })
  @SwaggerApiResponse({ status: 409, description: 'Cannot demote last OWNER' })
  @ResponseMessage('Member role updated successfully')
  async changeMemberRole(
    @CurrentOrganization() org: OrganizationContext,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.changeMemberRole(org, membershipId, dto);
  }

  @Delete(':membershipId')
  @RequirePermissions(PERMISSION.ORGANIZATION_MEMBERS_REMOVE)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiParam({ name: 'membershipId', description: 'Membership UUID' })
  @ApiOperation({
    summary: 'Remove a member from the organization',
    description:
      'Deactivates a membership (preserving historical record) and immediately revokes access. Requires organization.members.remove. Protects last OWNER.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Member removed' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'Membership not found' })
  @SwaggerApiResponse({ status: 409, description: 'Cannot remove last OWNER or already inactive' })
  @ResponseMessage('Organization member removed successfully')
  async removeMember(
    @CurrentOrganization() org: OrganizationContext,
    @Param('membershipId', new ParseUUIDPipe({ version: '4' }))
    membershipId: string,
  ) {
    return this.membersService.removeMember(org, membershipId);
  }
}
