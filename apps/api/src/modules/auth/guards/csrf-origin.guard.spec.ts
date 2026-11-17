import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CsrfOriginGuard } from './csrf-origin.guard';

describe('CsrfOriginGuard', () => {
  let guard: CsrfOriginGuard;
  let mockConfigService: {
    get: jest.Mock;
  };

  const createMockContext = (headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'frontendUrl') return 'https://app.andemta.et';
        if (key === 'nodeEnv') return 'development';
        return undefined;
      }),
    };

    guard = new CsrfOriginGuard(mockConfigService as unknown as ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow requests with trusted Origin header', () => {
    const context = createMockContext({
      origin: 'https://app.andemta.et',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow local development origins in non-production environments', () => {
    const context = createMockContext({
      origin: 'http://localhost:3000',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject requests with untrusted Origin header', () => {
    const context = createMockContext({
      origin: 'https://evil-attacker-site.com',
    });

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Untrusted request origin'),
    );
  });

  it('should check Referer when Origin is absent and allow trusted referer', () => {
    const context = createMockContext({
      referer: 'https://app.andemta.et/login?redirect=/dashboard',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject requests with untrusted Referer header', () => {
    const context = createMockContext({
      referer: 'https://malicious-phishing.com/andemta',
    });

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Untrusted request origin'),
    );
  });

  it('should reject malformed Referer header', () => {
    const context = createMockContext({
      referer: 'not-a-valid-url',
    });

    expect(() => guard.canActivate(context)).toThrow(
      new ForbiddenException('Untrusted request origin'),
    );
  });

  it('should allow requests when neither Origin nor Referer is present (e.g. non-browser API clients)', () => {
    const context = createMockContext({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should strictly only allow production frontendUrl in production environment', () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'frontendUrl') return 'https://andemta.et';
      if (key === 'nodeEnv') return 'production';
      return undefined;
    });

    const prodGuard = new CsrfOriginGuard(
      mockConfigService as unknown as ConfigService,
    );

    const allowedContext = createMockContext({
      origin: 'https://andemta.et',
    });
    expect(prodGuard.canActivate(allowedContext)).toBe(true);

    const devContext = createMockContext({
      origin: 'http://localhost:3000',
    });
    expect(() => prodGuard.canActivate(devContext)).toThrow(
      new ForbiddenException('Untrusted request origin'),
    );
  });
});
