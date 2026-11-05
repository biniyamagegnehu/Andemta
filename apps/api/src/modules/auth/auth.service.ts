import {
  Injectable,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHashingService } from './services/password-hashing.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashingService: PasswordHashingService,
  ) {}

  /**
   * Normalizes an email address according to project standards:
   * trims leading/trailing whitespace and converts to lowercase.
   *
   * @param email Raw email address
   * @returns Clean normalized email
   */
  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Registers a new user account with email and password.
   * - Normalizes the email address.
   * - Checks for existing accounts to provide clear early feedback.
   * - Hashes the password using Argon2id.
   * - Persists the User record in PostgreSQL.
   * - Catches database race condition unique violations (P2002) and maps to 409 Conflict.
   * - Returns only safe user attributes without exposing hashes or internal fields.
   *
   * @param dto Validated registration data
   * @returns Safe user representation (id, email, emailVerifiedAt, createdAt)
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    // 1. Proactive existing account check
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    // 2. Hash password with Argon2id
    const passwordHash = await this.passwordHashingService.hash(dto.password);

    // 3. Persist user and handle race condition
    try {
      const createdUser = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          emailVerifiedAt: null,
        },
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
      });

      this.logger.log(`User registered successfully (id: ${createdUser.id})`);

      // 4. Return explicit safe response object
      return {
        id: createdUser.id,
        email: createdUser.email,
        emailVerifiedAt: createdUser.emailVerifiedAt,
        createdAt: createdUser.createdAt,
      };
    } catch (error) {
      // Handle concurrent insert race condition violating unique email constraint
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const isEmailTarget =
          Array.isArray(target) && target.includes('email')
            ? true
            : String(target).includes('email');

        if (isEmailTarget) {
          throw new ConflictException(
            'An account with this email already exists',
          );
        }
      }

      // Re-throw any unrelated database error so it reaches centralized filter
      throw error;
    }
  }
}

