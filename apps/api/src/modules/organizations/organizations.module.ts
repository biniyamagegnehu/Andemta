import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationMembersService } from './organization-members.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [OrganizationsController, OrganizationMembersController],
  providers: [OrganizationsService, OrganizationMembersService],
  exports: [OrganizationsService, OrganizationMembersService],
})
export class OrganizationsModule {}
