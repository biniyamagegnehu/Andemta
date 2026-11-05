import * as argon2 from 'argon2';

/**
 * Centralized Argon2id configuration adhering to OWASP recommendations.
 * - Type: Argon2id (hybrid defense against side-channel and GPU cracking attacks)
 * - Memory Cost: 19456 KiB (~19 MiB)
 * - Time Cost: 2 iterations
 * - Parallelism: 1 thread
 */
export const ARGON2_CONFIG: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};
