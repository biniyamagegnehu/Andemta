import { SetMetadata } from '@nestjs/common';
import { BYPASS_TRANSFORM_METADATA } from '../constants';

/**
 * Decorator to bypass the global response transformation interceptor.
 * Useful for raw binary streams, file downloads, or health probes if needed.
 */
export const BypassTransform = () => SetMetadata(BYPASS_TRANSFORM_METADATA, true);

