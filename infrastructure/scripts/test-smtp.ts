/**
 * ==============================================================================
 * Andemta - Brevo SMTP Manual Verification Utility
 * ==============================================================================
 * Validates Brevo SMTP connectivity and optionally dispatches a test email.
 * Never prints passwords or secrets to console.
 *
 * Usage:
 *   npm run test:smtp
 *   npm run test:smtp -- [optional-recipient@example.com]
 * ==============================================================================
 */

// CommonJS requires to ensure compatibility across Node 18, 20, and 22 without typeless ESM reparsing warnings
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer');

// Locate apps/api/.env across monorepo directories
const candidates = [
  path.resolve(process.cwd(), 'apps/api/.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../apps/api/.env'),
];
const envPath = candidates.find((p) => fs.existsSync(p)) || candidates[0];
dotenv.config({ path: envPath });

async function main() {
  console.log('=============================================');
  console.log('   Andemta Brevo SMTP Verification Utility   ');
  console.log('=============================================');

  const host = process.env.EMAIL_HOST || 'smtp-relay.brevo.com';
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure = process.env.EMAIL_SECURE === 'true';
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  const from = process.env.EMAIL_FROM;

  console.log(`\nConfigured SMTP Host: ${host}:${port}`);
  console.log(`STARTTLS (secure):   ${secure}`);
  console.log(`Sender Address:      ${from || '[NOT SET]'}`);
  console.log(
    `SMTP Login (user):   ${
      user ? user.substring(0, 3) + '***' : '[NOT SET]'
    }`,
  );
  console.log(
    `SMTP Password (key): ${pass ? '******** (Present)' : '[NOT SET]'}`,
  );

  if (!user || !pass || !from) {
    console.error(
      '\n[ERROR] Missing required SMTP configuration in apps/api/.env.',
    );
    console.error('Ensure EMAIL_USER, EMAIL_PASSWORD, and EMAIL_FROM are set.');
    process.exit(1);
  }

  console.log('\n[1/2] Testing SMTP connection and authentication...');
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: true },
  });

  try {
    await transporter.verify();
    console.log('  -> Connection and authentication SUCCESSFUL! 🚀');
  } catch (error) {
    console.error('  -> [FAILED] Connection or authentication error:');
    console.error(`     ${(error as Error).message}`);
    console.log('\nDiagnostic tips:');
    console.log(
      ' - Error 535 / Invalid credentials: Verify that EMAIL_USER is the SMTP login from Brevo (not account email) and EMAIL_PASSWORD is the generated Standard SMTP key.',
    );
    console.log(
      ' - Connection timeout: Verify port 587 is not blocked by your local network or firewall.',
    );
    process.exit(1);
  }

  // Optional: Send test email if recipient passed as argument
  const recipient = process.argv[2];
  if (recipient) {
    console.log(`\n[2/2] Sending manual test email to ${recipient}...`);
    try {
      const info = await transporter.sendMail({
        from,
        to: recipient,
        subject: 'Andemta — Brevo SMTP Integration Test',
        text: 'This is a test email confirming Brevo SMTP integration for Andemta.',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2 style="color: #0284c7;">Andemta — Ethiopian Consumer Research Marketplace</h2>
            <p>This is a manual verification email confirming that Brevo SMTP is successfully configured and active.</p>
            <p style="color: #64748b; font-size: 12px;">Sent from Andemta Local Infrastructure Verification.</p>
          </div>
        `,
      });
      console.log('  -> Email dispatched successfully! 📧');
      console.log(`  -> Message ID: ${info.messageId}`);
      console.log(
        '\nNext: Check your inbox (or spam) and Brevo Dashboard > Transactional > Logs.',
      );
    } catch (sendError) {
      console.error(
        `  -> [FAILED] Delivery error: ${(sendError as Error).message}`,
      );
      console.log(
        ' - Sender unverified: Ensure EMAIL_FROM exactly matches your verified sender in Brevo.',
      );
      process.exit(1);
    }
  } else {
    console.log(
      '\n[2/2] Skipped email dispatch (no recipient specified).',
    );
    console.log(
      '  To send a test email, run: npm run test:smtp -- your-email@example.com',
    );
  }

  console.log('\nVerification complete.\n');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

