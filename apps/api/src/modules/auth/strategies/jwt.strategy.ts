import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JWT_STRATEGY_NAME } from '../constants/auth.constants';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('jwt.accessSecret');
    const issuer = configService.get<string>('jwt.issuer');
    const audience = configService.get<string>('jwt.audience');

    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer,
      audience,
      algorithms: ['HS256'],
    });
  }

  /**
   * Validates the decoded JWT payload and verifies user account existence and verification state.
   *
   * @param payload Decoded JWT payload passed after signature & expiration checks
   * @returns Safe AuthenticatedUser object attached to request.user
   */
  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Malformed token payload');
    }

    const { sub, tokenVersion } = payload as Partial<JwtPayload>;

    if (!sub || typeof sub !== 'string') {
      throw new UnauthorizedException('Invalid token subject claim');
    }

    // Resolve user from PostgreSQL database
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Email verification is required to access this resource',
      );
    }

    // Immediate access token invalidation: enforce token version match
    if (typeof tokenVersion !== 'number' || tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Access token has been revoked');
    }

    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
    };
  }
}
