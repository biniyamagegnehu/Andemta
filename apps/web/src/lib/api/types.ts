/**
 * Standard backend pagination metadata interface.
 */
export interface ApiPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Standard backend successful API response envelope.
 */
export interface ApiResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  meta: ApiPaginationMeta | null;
}

/**
 * Individual field-level error detail structure.
 */
export interface ApiErrorDetail {
  field?: string;
  message: string;
}

/**
 * Standard backend error API response envelope.
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  data: null;
  errors: ApiErrorDetail[];
}

/**
 * Safe authenticated user profile representation returned by GET /api/v1/auth/me.
 * Never includes sensitive backend fields such as passwordHash, token secrets, or session internals.
 */
export interface AuthUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt?: string;
}

/**
 * Payload returned upon successful login or token refresh from POST /api/v1/auth/refresh and /login.
 */
export interface LoginResponseData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

/**
 * Login request payload for POST /api/v1/auth/login.
 */
export interface LoginDto {
  email: string;
  password: string;
}

/**
 * Registration request payload for POST /api/v1/auth/register.
 */
export interface RegisterDto {
  email: string;
  password: string;
}

/**
 * Registration response payload returned by POST /api/v1/auth/register.
 */
export interface RegisterResponseData {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

/**
 * Email verification request payload for POST /api/v1/auth/verify-email.
 */
export interface VerifyEmailDto {
  token: string;
}

/**
 * Email verification response payload returned by POST /api/v1/auth/verify-email.
 */
export interface VerifyEmailResponseData {
  email: string;
  emailVerifiedAt: string;
}

/**
 * Resend verification request payload for POST /api/v1/auth/resend-verification.
 */
export interface ResendVerificationDto {
  email: string;
}

/**
 * Resend verification response payload returned by POST /api/v1/auth/resend-verification.
 */
export interface ResendVerificationResponseData {
  message: string;
}

/**
 * Request payload for POST /api/v1/auth/forgot-password.
 */
export interface ForgotPasswordDto {
  email: string;
}

/**
 * Request payload for POST /api/v1/auth/reset-password.
 */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

/**
 * Request options for API client invocations.
 */
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  skipAuth?: boolean;
  skipRefreshRetry?: boolean;
}

/**
 * Typed client error representation for API communication failures.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errors: ApiErrorDetail[];
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    status = 500,
    errors: ApiErrorDetail[] = [],
    isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.isNetworkError = isNetworkError;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Organization classifications matching backend OrganizationType enum.
 */
export type OrganizationType = 'BUSINESS' | 'UNIVERSITY' | 'OTHER';

/**
 * Organization status matching backend OrganizationStatus enum.
 */
export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

/**
 * Organization summary returned by GET /api/v1/organizations.
 */
export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
  roleCode: string;
}

/**
 * Paginated organizations payload returned by GET /api/v1/organizations.
 */
export interface PaginatedOrganizationsData {
  items: UserOrganization[];
  meta: ApiPaginationMeta;
}

/**
 * Request payload for POST /api/v1/organizations.
 */
export interface CreateOrganizationDto {
  name: string;
  slug?: string;
  type?: OrganizationType;
}

/**
 * Request payload for PATCH /api/v1/organizations/:organizationId.
 */
export interface UpdateOrganizationDto {
  name?: string;
  type?: OrganizationType;
}

/**
 * Effective system-level authorization context returned by GET /api/v1/authorization/system.
 */
export interface SystemAuthorizationContext {
  userId: string;
  systemRoles: string[];
  permissions: string[];
}

/**
 * Effective organization-level authorization context returned by
 * GET /api/v1/authorization/organizations/:organizationId.
 */
export interface OrganizationAuthorizationContext {
  organizationId: string;
  organizationType: OrganizationType;
  roleCode: string;
  membershipStatus: 'ACTIVE';
  permissions: string[];
}

/**
 * Supported user interface languages matching backend UpdateProfileDto.
 */
export type ProfileLanguage = 'en' | 'am' | 'om' | 'ti';

/**
 * Safe self-service user profile returned by GET /api/v1/users/me and PATCH /api/v1/users/me.
 */
export interface UserProfile {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  fullName: string | null;
  phoneNumber: string | null;
  preferredLanguage: ProfileLanguage;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Editable profile payload for PATCH /api/v1/users/me.
 */
export interface UpdateProfileDto {
  fullName?: string | null;
  phoneNumber?: string | null;
  preferredLanguage?: ProfileLanguage;
  bio?: string | null;
}
