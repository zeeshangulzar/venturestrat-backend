import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://app.venturestrat.ai';

export type UpgradePlanReminderParams = {
  userName: string;
  planName: string;
  companyName?: string;
  ctaUrl?: string;
  preheader?: string;
};

export const buildUpgradePlanReminderEmail = ({
  userName,
  planName,
  companyName = 'your company',
  ctaUrl = `${appBaseUrl}/fundraising/investors`,
  preheader,
}: UpgradePlanReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const plan = planName?.trim() || 'your plan';
  const computedPreheader =
    preheader || `Congrats on upgrading to ${plan}. Let's keep your outreach moving.`;

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">Congratulations! You just upgraded to VentureStrat AI ${plan}. That's a big step, and we're excited to be part of your fundraising journey.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's what matters now: keep pushing.</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0; color:#0C2143; list-style-type: none;">
          <li style="margin-bottom:8px;">✅ Shortlist investors who match ${company}</li>
          <li style="margin-bottom:8px;">✅Send outreach emails (even if they're not perfect)</li>
          <li style="margin-bottom:8px;">✅ Stay persistent - fundraising is a numbers game</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">The founders who raise are the ones who show up every day and keep moving forward. You've got the tools. Now it's time to use them.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">We're always here to help.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Stuck on something? Not sure what to say in an email? Just reply to this message - we'll get back to you fast.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Open CRM -></a>
        </div>
        <p style="${paragraphStyle} margin:0;">Let's do this,<br/><strong>The VentureStrat Team</strong><br/>P.S. Your receipt and billing details are attached.</p>
      </td>
    </tr>
  `;

  return {
    subject: `Congrats on upgrading to ${plan}, ${name}!`,
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildUpgradePlanReminderEmail;
