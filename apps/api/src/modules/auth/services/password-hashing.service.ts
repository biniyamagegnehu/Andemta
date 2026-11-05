import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ARGON2_CONFIG } from '../constants/auth.constants';

@Injectable()
export class PasswordHashingService {
  private readonly logger = new Logger(PasswordHashingService.name);

  /**
   * Hashes a plaintext password using Argon2id with secure centralized parameters.
   *
   * @param password Plaintext password to hash
   * @returns Formatted Argon2id hash string ($argon2id$v=19$...)
   */
  async hash(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    return argon2.hash(password, ARGON2_CONFIG);
  }

  /**
   * Verifies a candidate plaintext password against an existing Argon2id hash.
   * Safely handles malformed, corrupted, or incompatible hashes without throwing exceptions.
   *
   * @param hash Stored password hash
   * @param plain Candidate plaintext password
   * @returns true if candidate matches hash; false otherwise
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    if (
      !hash ||
      !plain ||
      typeof hash !== 'string' ||
      typeof plain !== 'string'
    ) {
      return false;
    }

    try {
      return await argon2.verify(hash, plain);
    } catch (error) {
      // Log generic failure without leaking hash or candidate values
      this.logger.warn(
        `Argon2 verification failed safely: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
