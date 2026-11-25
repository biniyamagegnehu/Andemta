import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse as SwaggerApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { CurrentOrganization } from '../decorators/current-organization.decorator';
import { OrganizationAuthGuard } from '../guards/organization-auth.guard';
import { OrganizationContext } from '../interfaces/rbac.interfaces';
import { RolePermissionService } from '../services/role-permission.service';

@ApiTags('Authorization')
@ApiBearerAuth()
@Controller('authorization')
export class AuthorizationContextController {
  constructor(private readonly rolePermissionService: RolePermissionService) {}

  @Get('system')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get authenticated user effective system authorization context',
    description:
      'Returns the authenticated user system roles and active SYSTEM-scoped permissions from the database.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'System authorization context retrieved',
  })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @ResponseMessage('System authorization context retrieved successfully')
  async getSystemAuthorization(@CurrentUser() user: AuthenticatedUser) {
    return this.rolePermissionService.getUserSystemAuthorizationContext(
      user.id,
    );
  }

  @Get('organizations/:organizationId')
  @UseGuards(JwtAuthGuard, OrganizationAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiOperation({
    summary:
      'Get authenticated user effective organization authorization context',
    description:
      'Validates active organization membership via OrganizationAuthGuard and returns only the authenticated user role and active ORGANIZATION-scoped permissions.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Organization authorization context retrieved',
  })
  @SwaggerApiResponse({ status: 400, description: 'Invalid organization ID' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({
    status: 403,
    description: 'Not an active member or organization inactive',
  })
  @SwaggerApiResponse({ status: 404, description: 'Organization not found' })
  @ResponseMessage('Organization authorization context retrieved successfully')
  async getOrganizationAuthorization(
    @CurrentOrganization() org: OrganizationContext,
  ) {
    return {
      organizationId: org.organizationId,
      organizationType: org.organizationType,
      roleCode: org.roleCode,
      membershipStatus: 'ACTIVE',
      permissions: org.permissions,
    };
  }
}
