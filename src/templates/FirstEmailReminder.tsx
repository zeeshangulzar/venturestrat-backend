import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type FirstEmailReminderParams = {
  userName: string;
  companyName?: string;
  shortlistCount?: number;
  ctaUrl?: string;
  preheader?: string;
};

export const buildFirstEmailReminderEmail = ({
  userName,
  companyName = 'your company',
  shortlistCount = 1,
  ctaUrl = `${appBaseUrl}/fundraising/crm`,
  preheader,
}: FirstEmailReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const countText = shortlistCount === 1 ? '1 investor' : `${shortlistCount} investors`;
  const computedPreheader =
    preheader || 'Your first outreach email is ready! Review and send in 2 clicks.';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">You're all set up! Gmail is connected, and you've got ${countText} waiting to hear from ${company}.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's what to do next:</p>
        <ol style="${paragraphStyle} margin:0 0 16px 18px; padding:0;">
          <li style="margin-bottom:8px;">Generate personalized email to the investors</li>
          <li style="margin-bottom:8px;">Personalize it if you'd like (or send as-is)</li>
          <li style="margin-bottom:8px;">Hit send</li>
        </ol>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Most founders send their first outreach within 10 minutes of this step. Once you do, we'll track opens and replies automatically — and even send follow-ups if they don't respond.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Let's get your first email out the door.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Send Your First Email →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">You've got this,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: 'Your first investor email is ready to send',
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildFirstEmailReminderEmail;
