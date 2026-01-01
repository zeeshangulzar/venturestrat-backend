import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type GmailReminderParams = {
  userName: string;
  companyName?: string;
  shortlistCount?: number;
  ctaUrl?: string;
  preheader?: string;
};

export const buildGmailReminderEmail = ({
  userName,
  companyName = 'your company',
  shortlistCount = 1,
  ctaUrl = `${appBaseUrl}/settings`,
  preheader,
}: GmailReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const countText = shortlistCount === 1 ? '1 investor' : `${shortlistCount} investors`;
  const computedPreheader =
    preheader || 'Connect Gmail to send your outreach emails. Takes 30 seconds. Connect now.';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">Great work! You've shortlisted ${countText} for ${company}. Now let's get your outreach emails sent.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">To send emails, you need to connect Gmail.</p>
        <p style="${paragraphStyle} margin:0 0 12px 0;">It takes 30 seconds and lets you:</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0; color:#0C2143;">
          <li style="margin-bottom:8px;">Send personalized emails directly from VentureStrat</li>
          <li style="margin-bottom:8px;">Track opens, clicks, and replies in real time</li>
          <li style="margin-bottom:8px;">Auto-send follow-ups if investors don't reply</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Everything stays in your inbox. We just make it smarter.</p>
        <p style="${headingStyle} margin:0 0 16px 0;">Ready to connect?</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Connect Gmail in 30 Seconds →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Still have questions? Reply here - we're founders too.</p>
        <p style="${paragraphStyle} margin:16px 0 0 0;">Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: 'Connect Gmail to send your first outreach',
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildGmailReminderEmail;
