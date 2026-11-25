import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse as SwaggerApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get current authenticated user's full profile",
    description:
      'Retrieves safe self-service profile fields for the authenticated user without exposing secrets or session internals.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @ResponseMessage('User profile retrieved successfully')
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getMyProfile(user.id);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update current authenticated user's profile",
    description:
      'Updates permitted self-service profile fields (fullName, phoneNumber, preferredLanguage, bio). Rejects unknown or security-sensitive properties.',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'User profile updated successfully',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Validation failed or unauthorized property supplied',
  })
  @SwaggerApiResponse({ status: 401, description: 'Unauthorized' })
  @ResponseMessage('User profile updated successfully')
  async updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.id, dto);
  }
}
