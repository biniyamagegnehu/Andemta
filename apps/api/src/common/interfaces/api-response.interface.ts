/**
 * Standard Paginated Metadata
 */
export interface ApiPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Standard Success API Response
 */
export interface ApiResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  meta: ApiPaginationMeta | null;
}

/**
 * Individual Error Detail Structure
 */
export interface ApiErrorDetail {
  field?: string;
  message: string;
}

/**
 * Standard Error API Response
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  data: null;
  errors: ApiErrorDetail[];
}

/**
 * Interface for Paginated Service Outputs before transformation
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: ApiPaginationMeta;
  message?: string;
}

