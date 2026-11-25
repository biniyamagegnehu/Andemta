import {
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { OrganizationType } from '@prisma/client';
import { CurrentOrganization } from './current-organization.decorator';
import { PERMISSION } from '../constants/permissions';
import { OrganizationContext } from '../interfaces/rbac.interfaces';

function getParamDecoratorFactory(decorator: Function) {
  class TestController {
    test(@decorator() _value: unknown) {}
  }
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestController,
    'test',
  );
  return args[Object.keys(args)[0]].factory;
}

describe('@CurrentOrganization Decorator', () => {
  const sampleContext: OrganizationContext = {
    organizationId: '11111111-2222-4333-8444-555555555555',
    organizationType: OrganizationType.UNIVERSITY,
    userId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    membershipId: 'mem-123',
    roleCode: 'RESEARCHER',
    permissions: [PERMISSION.RESEARCH_READ],
  };

  const makeCtx = (orgContext?: OrganizationContext): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ organizationContext: orgContext }),
      }),
    }) as unknown as ExecutionContext;

  it('returns the full validated OrganizationContext when no key is specified', () => {
    const factory = getParamDecoratorFactory(CurrentOrganization);
    const result = factory(undefined, makeCtx(sampleContext));
    expect(result).toEqual(sampleContext);
  });

  it('returns a specific property when key is specified', () => {
    const factory = getParamDecoratorFactory(CurrentOrganization);
    expect(factory('organizationId', makeCtx(sampleContext))).toBe(
      sampleContext.organizationId,
    );
    expect(factory('roleCode', makeCtx(sampleContext))).toBe('RESEARCHER');
  });

  it('throws InternalServerErrorException if organizationContext was not validated by guard', () => {
    const factory = getParamDecoratorFactory(CurrentOrganization);
    expect(() => factory(undefined, makeCtx(undefined))).toThrow(
      InternalServerErrorException,
    );
  });
});
