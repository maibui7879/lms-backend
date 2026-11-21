import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  [x: string]: any;
  sendVerificationOtp(email: string, code: string, ttlMinutes: number) {
    throw new Error('Method not implemented.');
  }
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendOtpEmail(toEmail: string, fullName: string, otpCode: string, ttlMinutes: number) {
    const from = this.config.get<string>('SMTP_USER');
    try {
      await this.transporter.sendMail({
        from: `"LMS Support" <${from}>`,
        to: toEmail,
        subject: `[LMS] Mã xác minh tài khoản của bạn: ${otpCode}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Xin chào ${fullName},</h2>
            <p>Mã OTP xác minh đăng ký tài khoản LMS của bạn là:</p>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #2563eb; margin: 16px 0;">
              ${otpCode}
            </div>
            <p>Mã này có hiệu lực trong <b>${ttlMinutes} phút</b>. Vui lòng không chia sẻ mã cho bất kỳ ai.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${toEmail}`, error);
      throw error;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    displayName: string,
    otpCode: string,
    ttlMinutes: number,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_USER'),
      to,
      subject: '[LMS] Mã xác nhận đặt lại mật khẩu',
      html: `
        <p>Xin chào <b>${displayName}</b>,</p>
        <p>Mã OTP đặt lại mật khẩu của bạn là: <b style="font-size:20px">${otpCode}</b></p>
        <p>Mã có hiệu lực trong <b>${ttlMinutes} phút</b>. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
      `,
    });
  }
}