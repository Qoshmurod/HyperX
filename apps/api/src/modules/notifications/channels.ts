import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../../config';

export interface OutgoingMessage {
  title: string;
  body: string | null;
  link: string | null;
}

@Injectable()
export class NotificationChannels {
  private mailer?: Transporter;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    if (config.smtp) {
      this.mailer = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
      });
    }
  }

  get emailConfigured() {
    return !!this.mailer;
  }

  get telegramConfigured() {
    return !!this.config.telegram;
  }

  private url(link: string | null) {
    return link ? `${this.config.webBaseUrl}${link}` : null;
  }

  async email(to: string, m: OutgoingMessage): Promise<void> {
    if (!this.mailer) throw new Error('SMTP is not configured');
    const url = this.url(m.link);
    await this.mailer.sendMail({
      from: this.config.smtp!.from,
      to,
      subject: `GovMind: ${m.title}`,
      text: [m.title, m.body, url].filter(Boolean).join('\n\n'),
    });
  }

  async telegram(chatId: string, m: OutgoingMessage): Promise<void> {
    if (!this.config.telegram) throw new Error('Telegram is not configured');
    const url = this.url(m.link);
    const text = [m.title, m.body, url].filter(Boolean).join('\n\n').slice(0, 4000);
    const res = await fetch(`${this.config.telegram.apiBase}/bot${this.config.telegram.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Telegram API ${res.status}`);
  }
}
