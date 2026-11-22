/**
 * Decoded and verified JWT access token payload structure.
 */
export interface JwtPayload {
  sub: string;
  jti: string;
  iss: string;
  aud: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}
