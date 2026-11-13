import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  EmailProvider,
  SendVerificationEmailOptions,
} from '../interfaces/email-provider.interface';

@Injectable()
export class NodemailerEmailProvider implements EmailProvider {
  private readonly logger = new Logger(NodemailerEmailProvider.name);
  private readonly transporter: Transporter;
  private readonly senderFrom: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>(
      'email.host',
      'smtp-relay.brevo.com',
    );
    const port = this.configService.get<number>('email.port', 587);
    const secure = this.configService.get<boolean>('email.secure', false);
    const user = this.configService.get<string>('email.user', '');
    const pass = this.configService.get<string>('email.password', '');
    this.senderFrom = this.configService.get<string>(
      'email.from',
      'Andemta <no-reply@andemta.et>',
    );

    // Create the persistent SMTP transporter with appropriate timeouts and STARTTLS
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // false for port 587 (uses STARTTLS)
      auth:
        user && pass
          ? {
              user,
              pass,
            }
          : undefined,
      connectionTimeout: 10000, // 10s connection timeout
      greetingTimeout: 10000, // 10s greeting timeout
      socketTimeout: 15000, // 15s socket timeout
      tls: {
        rejectUnauthorized: true,
      },
    });

    this.logger.log(
      `Nodemailer transporter initialized for host: ${host}:${port} (secure: ${secure})`,
    );
  }

  /**
   * Sends an email verification message containing a secure one-time verification link.
   * Never logs raw tokens, complete URLs, or SMTP credentials.
   *
   * @param options Verification email options (recipient, URL, expiration)
   */
  async sendVerificationEmail(
    options: SendVerificationEmailOptions,
  ): Promise<void> {
    const { recipientEmail, verificationUrl, expiresInMinutes } = options;

    const subject = 'Verify your email address — Andemta';

    const textContent = [
      'Welcome to Andemta — Ethiopian Consumer Research Marketplace',
      '',
      'Please verify your email address to activate your account by visiting the following link:',
      verificationUrl,
      '',
      `This verification link will expire in ${expiresInMinutes} minutes.`,
      '',
      'If you did not create an Andemta account, you can safely ignore this email.',
    ].join('\n');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1a202c;
      background-color: #f7fafc;
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background-color: #0f172a;
      padding: 24px 32px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      font-size: 24px;
      margin: 0;
      letter-spacing: 0.5px;
    }
    .header p {
      color: #94a3b8;
      font-size: 13px;
      margin: 4px 0 0;
    }
    .content {
      padding: 32px;
    }
    .button-container {
      text-align: center;
      margin: 28px 0;
    }
    .button {
      display: inline-block;
      background-color: #0284c7;
      color: #ffffff !important;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 15px;
    }
    .link-fallback {
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 4px;
      word-break: break-all;
      font-size: 12px;
      color: #475569;
      border: 1px solid #e2e8f0;
      margin-top: 16px;
    }
    .footer {
      border-top: 1px solid #e2e8f0;
      padding: 20px 32px;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Andemta</h1>
      <p>Ethiopian Consumer Research Marketplace</p>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0; color: #0f172a;">Verify your email address</h2>
      <p>Welcome to Andemta! Please confirm your email address to activate your account and start participating in research activities.</p>
      <div class="button-container">
        <a href="${verificationUrl}" class="button" target="_blank">Verify Email Address</a>
      </div>
      <p style="font-size: 13px; color: #475569;">
        This verification link expires in <strong>${expiresInMinutes} minutes</strong>.
      </p>
      <div class="link-fallback">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${verificationUrl}" style="color: #0284c7;">${verificationUrl}</a>
      </div>
    </div>
    <div class="footer">
      <p style="margin: 0;">If you did not request this verification, please safely ignore this email.</p>
      <p style="margin: 4px 0 0;">&copy; ${new Date().getFullYear()} Andemta. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

    try {
      const info = await this.transporter.sendMail({
        from: this.senderFrom,
        to: recipientEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });

      this.logger.log(
        `Verification email sent to recipient (messageId: ${info.messageId})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to recipient: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Optional connectivity check for manual SMTP verification.
   * Safe: Does not expose secrets or throw uncaught exceptions.
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verification succeeded');
      return true;
    } catch (error) {
      this.logger.warn(
        `SMTP connection verification probe failed: ${(error as Error).message}`,
      );
      return false;
    }
  }
}

