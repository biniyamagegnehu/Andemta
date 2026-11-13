import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { NodemailerEmailProvider } from './nodemailer-email.provider';

jest.mock('nodemailer');

describe('NodemailerEmailProvider', () => {
  let provider: NodemailerEmailProvider;
  let mockTransporter: {
    sendMail: jest.Mock;
    verify: jest.Mock;
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        'email.host': 'smtp-relay.brevo.com',
        'email.port': 587,
        'email.secure': false,
        'email.user': 'test-smtp-user',
        'email.password': 'test-smtp-password',
        'email.from': 'Andemta <no-reply@andemta.et>',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: '<test-message-id>' }),
      verify: jest.fn().mockResolvedValue(true),
    };

    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodemailerEmailProvider,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    provider = module.get<NodemailerEmailProvider>(NodemailerEmailProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should configure Nodemailer transporter with STARTTLS settings and timeouts', () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test-smtp-user',
          pass: 'test-smtp-password',
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      }),
    );
  });

  describe('sendVerificationEmail', () => {
    const options = {
      recipientEmail: 'participant@andemta.et',
      verificationUrl: 'http://localhost:3000/verify-email?token=mock-token-xyz',
      expiresInMinutes: 30,
    };

    it('should successfully compose and send verification email with HTML and text fallbacks', async () => {
      await provider.sendVerificationEmail(options);

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockTransporter.sendMail.mock.calls[0][0];

      expect(callArgs.to).toBe(options.recipientEmail);
      expect(callArgs.from).toBe('Andemta <no-reply@andemta.et>');
      expect(callArgs.subject).toBe('Verify your email address — Andemta');
      expect(callArgs.text).toContain(options.verificationUrl);
      expect(callArgs.text).toContain('30 minutes');
      expect(callArgs.html).toContain(options.verificationUrl);
      expect(callArgs.html).toContain('30 minutes');
      expect(callArgs.html).toContain('Andemta');
    });

    it('should propagate error when SMTP transport fails', async () => {
      mockTransporter.sendMail.mockRejectedValueOnce(
        new Error('SMTP connection timeout: smtp-relay.brevo.com:587'),
      );

      await expect(provider.sendVerificationEmail(options)).rejects.toThrow(
        'SMTP connection timeout: smtp-relay.brevo.com:587',
      );
    });
  });

  describe('verifyConnection', () => {
    it('should return true when SMTP verify succeeds', async () => {
      mockTransporter.verify.mockResolvedValueOnce(true);
      const result = await provider.verifyConnection();
      expect(result).toBe(true);
    });

    it('should return false when SMTP verify fails without throwing', async () => {
      mockTransporter.verify.mockRejectedValueOnce(
        new Error('Authentication failed (535)'),
      );
      const result = await provider.verifyConnection();
      expect(result).toBe(false);
    });
  });
});

