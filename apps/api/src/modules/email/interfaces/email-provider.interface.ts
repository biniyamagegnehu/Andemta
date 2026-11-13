export interface SendVerificationEmailOptions {
  recipientEmail: string;
  verificationUrl: string;
  expiresInMinutes: number;
}

export interface EmailProvider {
  sendVerificationEmail(options: SendVerificationEmailOptions): Promise<void>;
}

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

