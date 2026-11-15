/**
 * Safe authenticated user object attached to Request by JwtStrategy.
 * Never exposes password hashes, token secrets, or internal persistence fields.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  emailVerifiedAt: Date;
}
