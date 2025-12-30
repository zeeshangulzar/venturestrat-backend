import { renderHeader } from './components/Header.js';
import { renderFooter } from './components/Footer.js';

type ShellOptions = {
  content: string;
  preheader: string;
};

export const wrapWithShell = ({ content, preheader }: ShellOptions): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VentureStrat</title>
  </head>
  <body style="margin:0; padding:0; background:#f4f4f4; font-family: Arial, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; visibility:hidden;">${preheader}</div>
    <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style="background:#f4f4f4; margin:0; padding:24px 0;">
      <tbody>
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellPadding="0" cellSpacing="0" style="background:#fff; border-radius:8px; overflow:hidden;">
              <tbody>
                ${renderHeader()}
                ${content}
                ${renderFooter()}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
  </html>
`;
