import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type TrialReminderParams = {
  userName: string;
  companyName?: string;
  shortlistCount?: number;
  ctaUrl?: string;
  preheader?: string;
};

export const buildTrialReminderEmail = ({
  userName,
  companyName = 'your company',
  shortlistCount = 0,
  ctaUrl = `${appBaseUrl}/subscription`,
  preheader,
}: TrialReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const countText = shortlistCount === 1 ? '1 investor' : `${shortlistCount} investors`;
  const computedPreheader =
    preheader || '⏰ 1 day left in your trial! Send your first investor email today.';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${headingStyle} margin:0 0 14px 0;">You're halfway through your trial! Here's what founders who convert do in their first 48 hours:</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0; color:#0C2143; list-style-type: none;">
          <li style="margin-bottom:8px;">✅ Shortlist 10-20 investors (you've added ${countText})</li>
          <li style="margin-bottom:8px;">✅ Connect Gmail and send their first outreach</li>
          <li style="margin-bottom:8px;">✅ Set up auto follow-ups (we'll remind investors if they don't reply)</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">You've got 1 day left to test everything for free.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">The best part? Once you send emails, you'll see replies come into VentureStrat's CRM - no more juggling inboxes or spreadsheets.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Ready to finish strong?</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Send Your First Outreach →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Need a hand? Reply here anytime.<br/>Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: `${name}, you've got 1 day left in your trial.`,
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildTrialReminderEmail;
