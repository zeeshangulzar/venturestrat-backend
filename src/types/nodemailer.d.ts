declare module 'nodemailer' {
  export interface SendMailOptions {
    to?: string | string[];
    from?: string;
    cc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }

  export interface SentMessageInfo {
    messageId?: string;
    [key: string]: unknown;
  }

  export interface Transporter {
    sendMail(mailOptions: SendMailOptions): Promise<SentMessageInfo>;
  }

  export function createTransport(options: unknown): Transporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}

