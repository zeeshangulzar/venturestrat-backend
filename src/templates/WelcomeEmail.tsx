import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type WelcomeEmailParams = {
  userName: string;
  ctaUrl?: string;
  preheader?: string;
};

export const buildWelcomeEmail = ({
  userName,
  ctaUrl = `${appBaseUrl}/fundraising/investors`,
  preheader = 'Welcome! Complete your profile to unlock investor discovery.',
}: WelcomeEmailParams) => {
  const name = userName?.trim() || 'there';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">Welcome to VentureStrat! You just unlocked the fastest way to find investors, craft outreach emails, and manage your fundraising pipeline - all in one place.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's what happens next:</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0; list-style-type: none; color:#0C2143;">
          <li style="margin-bottom:8px;">✅ Complete your startup profile - if you haven't already!</li>
          <li style="margin-bottom:8px;">✅ Browse 100,000+ investors filtered for your stage and industry</li>
          <li style="margin-bottom:8px;">✅ Shortlist investors and generate AI-powered outreach emails</li>
          <li style="margin-bottom:8px;"> Connect Gmail to send and track replies in one dashboard</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">You have <strong>3 days free</strong> to explore everything. No credit card required.</p>
        <p style="${headingStyle} margin:0 0 24px 0;"><strong>Ready? Let's build your investor list.</strong></p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Let's get started -></a>
        </div>
        <p style="${paragraphStyle} margin:0;">Cheers,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: `Welcome to VentureStrat AI, ${name}`,
    preheader,
    html: wrapWithShell({ content, preheader }),
  };
};

export default buildWelcomeEmail;
