import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type TrialExpiredReminderParams = {
  userName: string;
  companyName?: string;
  shortlistCount?: number;
  ctaUrl?: string;
  preheader?: string;
};

export const buildTrialExpiredReminderEmail = ({
  userName,
  companyName = 'your company',
  shortlistCount = 0,
  ctaUrl = `${appBaseUrl}/subscription`,
  preheader,
}: TrialExpiredReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const countText = shortlistCount === 1 ? '1 investor' : `${shortlistCount} investors`;
  const computedPreheader =
    preheader || 'Your VentureStrat trial ended. Upgrade in 60 seconds to keep your investor list';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">Your trial ended yesterday, and we've paused your access to VentureStrat AI.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's what you're missing right now:</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0;">
          <li style="margin-bottom:8px;">Access to over 120,000 investors</li>
          <li style="margin-bottom:8px;">${countText} you hand-picked for ${company}</li>
          <li style="margin-bottom:8px;">AI-generated outreach emails ready to send</li>
          <li style="margin-bottom:8px;">Reply tracking and follow-up automation</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Fundraising is hard enough. Don't let a great tool sit on the sidelines.</p>
        <p style="${paragraphStyle} margin:0 0 12px 0;">Upgrade today and pick up exactly where you left off.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Reactivate Your Account →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Still on the fence? Reply and let's talk.</p>
        <p style="${paragraphStyle} margin:16px 0 0 0;">Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: `${name}, your VentureStrat access has expired`,
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildTrialExpiredReminderEmail;
