import { wrapWithShell } from './layout.js';
import { headingStyle, paragraphStyle } from './styles.js';

const appBaseUrl = process.env.APP_URL || 'https://venturestrat.ai';

export type OnboardingReminderParams = {
  userName: string;
  companyName?: string;
  ctaUrl?: string;
  preheader?: string;
};

export const buildOnboardingReminderEmail = ({
  userName,
  companyName = 'your company',
  ctaUrl = `${appBaseUrl}/onboarding`,
  preheader,
}: OnboardingReminderParams) => {
  const name = userName?.trim() || 'there';
  const company = companyName?.trim() || 'your company';
  const computedPreheader =
    preheader || `Hey ${name}! Finish your profile to see investors who match ${company}. Takes 2 min.`;

  const content = `
    <tr>
      <td style="padding:40px 30px; ${paragraphStyle}">
        <p style="${paragraphStyle} margin:0 0 14px 0;">Hi ${name},</p>
        <p style="${paragraphStyle} margin:0 0 14px 0;">We noticed you started setting up but haven't finished your profile yet. No worries - it only takes 2 minutes.</p>
        <p style="${headingStyle} margin:0 0 12px 0;">Here's why it matters:</p>
        <ul style="${paragraphStyle} margin:0 0 16px 18px; padding:0;">
          <li style="margin-bottom:8px;">Match you with investors who've backed startups like ${companyName}</li>
          <li style="margin-bottom:8px;">Generate outreach emails that sound authentically like you</li>
          <li style="margin-bottom:8px;">Highlight the right traction, metrics, and milestones</li>
        </ul>
        <p style="${paragraphStyle} margin:0 0 16px 0;">Without a complete profile, our AI is working blind. With it? We'll show you exactly who to talk to - and exactly what to say.</p>
        <p style="${paragraphStyle} margin:0 0 16px 0;">You've still got your full 3-day trial waiting.</p>
        <div style="margin:0 0 24px 0;">
          <a href="${ctaUrl}" style="background:#1e63f4; color:#fff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700; display:inline-block;">Finish Your Profile in 2 Minutes →</a>
        </div>
        <p style="${paragraphStyle} margin:0;">Stuck on something? Just reply — we're here to help.</p>
        <p style="${paragraphStyle} margin:16px 0 0 0;">Best,<br/><strong>The VentureStrat Team</strong></p>
      </td>
    </tr>
  `;

  return {
    subject: `${name}, help us personalize your investor matches`,
    preheader: computedPreheader,
    html: wrapWithShell({ content, preheader: computedPreheader }),
  };
};

export default buildOnboardingReminderEmail;
