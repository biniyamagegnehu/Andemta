import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PERMISSION, RequirePermissions } from '../rbac';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AdminUsersService } from './admin-users.service';
import {
  AssignSystemRoleDto,
  ListAdminUsersQueryDto,
} from './dto/admin-users.dto';

@ApiTags('Admin Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions(PERMISSION.USERS_READ)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List platform users (Platform Admin)',
    description:
      'Returns paginated users with safe fields and system roles. Requires users.read.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Users retrieved' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @ResponseMessage('Users retrieved successfully')
  async listUsers(@Query() query: ListAdminUsersQueryDto) {
    return this.adminUsersService.listUsers(query);
  }

  @Get(':userId')
  @RequirePermissions(PERMISSION.USERS_READ)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({
    summary: 'Get user details (Platform Admin)',
    description:
      'Returns safe user details, system roles, and organization membership summaries. Requires users.read.',
  })
  @SwaggerApiResponse({ status: 200, description: 'User retrieved' })
  @SwaggerApiResponse({ status: 400, description: 'Invalid user ID' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'User not found' })
  @ResponseMessage('User details retrieved successfully')
  async getUserById(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ) {
    return this.adminUsersService.getUserById(userId);
  }

  @Post(':userId/system-roles')
  @RequirePermissions(PERMISSION.USERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiOperation({
    summary: 'Assign a system role to a user (Platform Admin)',
    description:
      'Assigns PARTICIPANT or ADMIN system role. Requires users.manage. Prevents self-promotion and organization role assignment.',
  })
  @SwaggerApiResponse({ status: 201, description: 'System role assigned' })
  @SwaggerApiResponse({ status: 400, description: 'Invalid input' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'User not found' })
  @SwaggerApiResponse({ status: 409, description: 'Role already assigned' })
  @ResponseMessage('System role assigned successfully')
  async assignSystemRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: AssignSystemRoleDto,
  ) {
    return this.adminUsersService.assignSystemRole(
      actor.id,
      userId,
      dto.roleCode,
    );
  }

  @Delete(':userId/system-roles/:roleCode')
  @RequirePermissions(PERMISSION.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiParam({
    name: 'roleCode',
    description: 'System role code (PARTICIPANT or ADMIN)',
  })
  @ApiOperation({
    summary: 'Revoke a system role from a user (Platform Admin)',
    description:
      'Revokes PARTICIPANT or ADMIN system role. Requires users.manage. Prevents self-revocation and protects the last platform ADMIN.',
  })
  @SwaggerApiResponse({ status: 200, description: 'System role revoked' })
  @SwaggerApiResponse({ status: 400, description: 'Invalid input' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'User or role assignment not found' })
  @SwaggerApiResponse({ status: 409, description: 'Cannot revoke last platform ADMIN' })
  @ResponseMessage('System role revoked successfully')
  async revokeSystemRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Param('roleCode') roleCode: string,
  ) {
    return this.adminUsersService.revokeSystemRole(actor.id, userId, roleCode);
  }
}
