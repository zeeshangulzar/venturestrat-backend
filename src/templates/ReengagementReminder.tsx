import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type ReengagementReminderParams = {
  userName: string;
  ctaUrl?: string;
  preheader?: string;
  companyName?: string;
};

export const buildReengagementReminderEmail = ({
  userName,
  ctaUrl = `${appBaseUrl}/sign-in`,
  preheader,
}: ReengagementReminderParams) => {
  const name = userName?.trim() || 'there';
  const computedPreheader =
    preheader || 'We miss you. Log back in and finish your first investor outreach today.';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">It's been a week since we've seen you in VentureStrat. We get it - fundraising can feel overwhelming, and it's easy to put tools aside.</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">But here's the truth: the founders who raise fastest are the ones who stay consistent. Even 10 minutes a day makes a difference.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's what you can do right now:</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0;list-style-type: none;">
          <li style="margin-bottom:8px;">✅ Shortlist 5 investors in under 5 minutes</li>
          <li style="margin-bottom:8px;">✅ Generate your first AI outreach email</li>
          <li style="margin-bottom:8px;">✅ Connect Gmail and send it today</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">You already took the hardest step (signing up). Let's finish what you started.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Log Back In →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Need help? Just reply - we're here to support you.</p>
        <p style="${paragraphStyle} margin:16px 0 0 0;">Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: `${name}, we miss you — here's what's new`,
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildReengagementReminderEmail;
