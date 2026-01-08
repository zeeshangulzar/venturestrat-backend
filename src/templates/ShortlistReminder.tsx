import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type ShortlistReminderParams = {
  userName: string;
  companyName?: string;
  ctaUrl?: string;
  preheader?: string;
};

export const buildShortlistReminderEmail = ({
  userName,
  companyName = 'your company',
  ctaUrl = `${appBaseUrl}/fundraising/investors`,
  preheader = "Let's build your investor list today.",
}: ShortlistReminderParams) => {
  const name = userName?.trim() || 'there';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">You're officially set up in VentureStrat - great work! Now comes the fun part: finding investors who actually match ${companyName}.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's what to do next:</p>
        <ol style="${paragraphStyle} margin:0 0 16px 18px; padding:0;">
          <li style="margin-bottom:8px;">Browse our database of 100,000+ investors filtered by stage, industry, and geography</li>
          <li style="margin-bottom:8px;">Shortlist 10–20 investors you want to reach out to</li>
          <li style="margin-bottom:8px;">Let our AI draft personalized outreach emails for each one</li>
        </ol>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Most founders shortlist their first investors in under 10 minutes. Once you do, we'll generate your outreach emails automatically.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">You've got 2 days left in your trial. Let's make them count.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Start Building Your List →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Need help filtering? Reply here anytime.</p>
        <p style="${paragraphStyle} margin:16px 0 0 0;">Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: `${name}, let's build your investor list today`,
    preheader,
    html: wrapWithShell({ content, preheader }),
  };
};

export default buildShortlistReminderEmail;
