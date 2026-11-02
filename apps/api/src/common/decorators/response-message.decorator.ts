import { SetMetadata } from '@nestjs/common';
import { RESPONSE_MESSAGE_METADATA } from '../constants';

/**
 * Decorator to assign a custom success message to the response envelope.
 * E.g., @ResponseMessage('Example resource created successfully')
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_METADATA, message);

