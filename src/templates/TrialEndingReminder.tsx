import { wrapWithShell } from './layout.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type TrialEndingReminderParams = {
  userName: string;
  companyName?: string;
  ctaUrl?: string;
  preheader?: string;
};

export const buildTrialEndingReminderEmail = ({
  userName,
  companyName = 'your company',
  ctaUrl = `${appBaseUrl}/subscription`,
  preheader,
}: TrialEndingReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const computedPreheader =
    preheader || 'Trial ends in 12 hours. Upgrade now to keep access.';

  const content = `
    <tr>
      <td style="padding:40px 30px; color:#222; font-size:15px; line-height:1.7;">
        <p style="margin:0 0 14px 0;">Hi ${name},</p>
        <p style="margin:0 0 14px 0;">Your 3-day trial ends tonight at midnight. After that, you'll lose access to:</p>
        <ul style="margin:0 0 16px 18px; padding:0; color:#0c2143; list-style-type: none;">
          <li style="margin-bottom:8px;">❌ Investor discovery and filtering</li>
          <li style="margin-bottom:8px;">❌ AI-generated outreach emails</li>
          <li style="margin-bottom:8px;">❌ Centralized reply tracking and CRM</li>
          <li style="margin-bottom:8px;">❌ Automated follow-up sequences</li>
        </ul>
        <p style="margin:0 0 16px 0;">Upgrade now and keep your momentum going.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Choose the plan that fits ${company} -></a>
        </div>
        <p style="margin:0;">Questions? Reply here - we're standing by.</p>
        <p style="margin:16px 0 0 0;">Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: 'Your trial ends tonight — here\'s what happens next',
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildTrialEndingReminderEmail;
