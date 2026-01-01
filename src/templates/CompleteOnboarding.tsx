import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type CompleteOnboardingParams = {
  userName: string;
  ctaUrl?: string;
  preheader?: string;
};

export const buildCompleteOnboardingEmail = ({
  userName,
  ctaUrl = `${appBaseUrl}/onboarding`,
  preheader = 'Finish setting up VentureStrat to unlock investor discovery.',
}: CompleteOnboardingParams) => {
  const name = userName?.trim() || 'there';

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${headingStyle} margin:0 0 14px 0;">Finish onboarding to unlock investor discovery, outreach, and tracking.</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0; color:#0C2143;">
          <li style="margin-bottom:8px;">- Add your startup profile details</li>
          <li style="margin-bottom:8px;">- Set your stage and target industries</li>
          <li style="margin-bottom:8px;">- Connect Gmail to send and track replies</li>
        </ul>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Complete onboarding →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Need help? Reply to this email and we'll assist.</p>
      </td>
    </tr>
  `;

  return {
    subject: 'Finish your VentureStrat onboarding',
    preheader,
    html: wrapWithShell({ content, preheader }),
  };
};

export default buildCompleteOnboardingEmail;
