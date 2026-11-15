/**
 * Decoded and verified JWT access token payload structure.
 */
export interface JwtPayload {
  sub: string;
  jti: string;
  iss: string;
  aud: string;
  iat?: number;
  exp?: number;
}
