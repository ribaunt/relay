import { Resend } from 'resend';
import { defaults } from '@relay/services';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.EMAIL_FROM ?? `Relay <verification@${new URL(defaults.id.origin).hostname}>`;

export interface SendVerificationEmailOptions {
  to: string; // plaintext email — used only in transit, never logged
  verificationCode: string;
  displayName?: string;
}

export interface SendRecoveryVerificationEmailOptions {
  to: string;
  verificationCode: string;
  displayName?: string;
}

export interface SendEmailChangeVerificationEmailOptions {
  to: string;
  verificationCode: string;
  displayName?: string;
}

const baseStyles = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #f9fafb;
    color: #111827;
    line-height: 1.6;
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 40px auto;
    background-color: #ffffff;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }
  .header {
    background-color: #111827;
    color: #ffffff;
    padding: 24px;
    text-align: center;
    font-weight: 600;
    font-size: 20px;
    letter-spacing: -0.025em;
  }
  .content {
    padding: 32px;
  }
  .greeting {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 24px;
    color: #111827;
  }
  .code-container {
    background-color: #f3f4f6;
    border: 1px dashed #d1d5db;
    border-radius: 6px;
    padding: 24px;
    text-align: center;
    margin: 32px 0;
  }
  .code {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.25em;
    color: #111827;
    margin: 0;
  }
  .footer {
    padding: 24px 32px;
    background-color: #f9fafb;
    border-top: 1px solid #e5e7eb;
    font-size: 14px;
    color: #6b7280;
    text-align: center;
  }
  .warning {
    color: #dc2626;
    font-weight: 500;
  }
  p {
    margin-top: 0;
    margin-bottom: 16px;
  }
  p:last-child {
    margin-bottom: 0;
  }
`;

/**
 * Sends a verification email via Resend.
 * The verification code is generated server-side and only its SHA-256 hash
 * is stored in Convex (email_verifications.code_hash).
 */
export const sendVerificationEmail = async ({
  to,
  verificationCode,
  displayName
}: SendVerificationEmailOptions): Promise<void> => {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">Verify your email</div>
          <div class="content">
            <div class="greeting">${greeting}</div>
            <p>Welcome to Relay! Please use the verification code below to complete your registration.</p>
            <div class="code-container">
              <p class="code">${verificationCode}</p>
            </div>
            <p>This code expires in 24 hours.</p>
            <p>If you did not request this email, you can safely ignore it.</p>
          </div>
          <div class="footer">
            &mdash; The Relay Team
          </div>
        </div>
      </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your Relay account',
    text: [
      greeting,
      '',
      'Your verification code is:',
      '',
      `  ${verificationCode}`,
      '',
      'This code expires in 24 hours.',
      '',
      'If you did not create a Relay account, you can safely ignore this email.',
      '',
      '— The Relay team'
    ].join('\n'),
    html
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
};

export interface SendPasswordChangedEmailOptions {
  to: string;
  displayName?: string;
}

/**
 * Sends a security notification when the user changes their password.
 * No codes or links — informational only.
 */
export const sendPasswordChangedEmail = async ({
  to,
  displayName
}: SendPasswordChangedEmailOptions): Promise<void> => {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">Relay Security Alert</div>
          <div class="content">
            <div class="greeting">${greeting}</div>
            <p>Your Relay account password was just changed.</p>
            <p>If you made this change, no further action is required.</p>
            <p class="warning">If you did not make this change, please use your recovery key immediately to regain access to your account and secure it.</p>
          </div>
          <div class="footer">
            &mdash; The Relay Team
          </div>
        </div>
      </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Your Relay password was changed',
    text: [
      greeting,
      '',
      'Your Relay account password was just changed.',
      '',
      'If this was you, no action is needed.',
      '',
      'If you did not make this change, use your recovery key immediately',
      'to regain access to your account.',
      '',
      '— The Relay team'
    ].join('\n'),
    html
  });

  if (error) {
    throw new Error(`Failed to send password changed email: ${error.message}`);
  }
};

export const sendEmailChangeVerificationEmail = async ({
  to,
  verificationCode,
  displayName
}: SendEmailChangeVerificationEmailOptions): Promise<void> => {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">Confirm your new email</div>
          <div class="content">
            <div class="greeting">${greeting}</div>
            <p>Use the code below to confirm this email address for your Relay account.</p>
            <div class="code-container">
              <p class="code">${verificationCode}</p>
            </div>
            <p>This code expires in 24 hours.</p>
            <p>If you did not request this change, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            &mdash; The Relay Team
          </div>
        </div>
      </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Confirm your new Relay email',
    text: [
      greeting,
      '',
      'Your Relay email change verification code is:',
      '',
      `  ${verificationCode}`,
      '',
      'This code expires in 24 hours.',
      '',
      'If you did not request this change, ignore this email.',
      '',
      '— The Relay team'
    ].join('\n'),
    html
  });

  if (error) {
    throw new Error(`Failed to send email change verification: ${error.message}`);
  }
};

export const sendRecoveryVerificationEmail = async ({
  to,
  verificationCode,
  displayName
}: SendRecoveryVerificationEmailOptions): Promise<void> => {
  const greeting = displayName ? `Hi ${displayName},` : 'Hi,';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>${baseStyles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">Account recovery code</div>
          <div class="content">
            <div class="greeting">${greeting}</div>
            <p>Use the code below to verify your email and continue account recovery.</p>
            <div class="code-container">
              <p class="code">${verificationCode}</p>
            </div>
            <p>This code expires in 15 minutes.</p>
            <p>If you did not request account recovery, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            &mdash; The Relay Team
          </div>
        </div>
      </body>
    </html>
  `;

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: 'Relay account recovery code',
    text: [
      greeting,
      '',
      'Your Relay account recovery code is:',
      '',
      `  ${verificationCode}`,
      '',
      'This code expires in 15 minutes.',
      '',
      'If you did not request account recovery, ignore this email.',
      '',
      '— The Relay team'
    ].join('\n'),
    html
  });

  if (error) {
    throw new Error(`Failed to send recovery email: ${error.message}`);
  }
};
