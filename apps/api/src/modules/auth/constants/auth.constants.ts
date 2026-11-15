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

/**
 * Pre-computed valid Argon2id hash used for constant-time credential checks
 * when an account does not exist. Mitigates timing side-channel account enumeration.
 */
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$QW5kZW10YUR1bW15U2FsdA$V2/H6XW8N1k391uIcfV9YlXp+R8w1W0k8/E8+5vX8V8';

export const JWT_STRATEGY_NAME = 'jwt';

