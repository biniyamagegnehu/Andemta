import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationContext,
  PERMISSION,
  RequirePermissions,
} from '../rbac';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new organization',
    description:
      'Creates an organization and assigns the authenticated creator the OWNER role atomically. Requires authentication.',
  })
  @SwaggerApiResponse({ status: 201, description: 'Organization created' })
  @SwaggerApiResponse({ status: 400, description: 'Validation error' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 409, description: 'Slug already exists' })
  @ResponseMessage('Organization created successfully')
  async createOrganization(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.createOrganization(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List organizations for the authenticated user',
    description:
      'Returns paginated active organizations where the authenticated user has an active membership.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Organizations retrieved' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @ResponseMessage('Organizations retrieved successfully')
  async listMyOrganizations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.organizationsService.listMyOrganizations(user.id, query);
  }

  @Get(':organizationId')
  @UseGuards(JwtAuthGuard, OrganizationAuthGuard)
  @RequirePermissions(PERMISSION.ORGANIZATION_READ)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiOperation({
    summary: 'Get organization details',
    description:
      'Returns details for an organization where the user is an active member. Requires organization.read.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Organization retrieved' })
  @SwaggerApiResponse({ status: 400, description: 'Invalid organization ID' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'Organization not found' })
  @ResponseMessage('Organization details retrieved successfully')
  async getOrganizationDetails(@CurrentOrganization() org: OrganizationContext) {
    return this.organizationsService.getOrganizationDetails(
      org.organizationId,
      org.roleCode,
    );
  }

  @Patch(':organizationId')
  @UseGuards(JwtAuthGuard, OrganizationAuthGuard)
  @RequirePermissions(PERMISSION.ORGANIZATION_UPDATE)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'organizationId', description: 'Organization UUID' })
  @ApiOperation({
    summary: 'Update organization details',
    description:
      'Updates permitted organization fields (name, type). Requires organization.update.',
  })
  @SwaggerApiResponse({ status: 200, description: 'Organization updated' })
  @SwaggerApiResponse({ status: 400, description: 'Validation error' })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @SwaggerApiResponse({ status: 403, description: 'Forbidden' })
  @SwaggerApiResponse({ status: 404, description: 'Organization not found' })
  @ResponseMessage('Organization updated successfully')
  async updateOrganization(
    @CurrentOrganization() org: OrganizationContext,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.updateOrganization(
      org.organizationId,
      dto,
      org.roleCode,
    );
  }
}
