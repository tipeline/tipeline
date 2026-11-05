import { z } from 'zod';
import nodemailer from 'nodemailer';
import { validations } from '@tipeline/schemas';

type SendParams = z.infer<typeof validations.email.send.runtime.schema>;

/**
 * @group Actions
 */
export class GroupEmail {
  /**
   * Sends an email via an SMTP transporter using the provided credentials and message fields.
   *
   * @param params - The input parameters.
   * @returns `true` when the message is accepted by the SMTP server.
   * @example
   * ```yaml
   * # Send a plain-text and HTML email with an optional file attachment
   * - group: email
   *   name: send
   *   params:
   *     host: '{{ smtpHost }}'
   *     port: 587
   *     secure: false
   *     user: '{{ smtpUser }}'
   *     pass: '{{ smtpPass }}'
   *     from: 'sender@example.com'
   *     to: 'recipient@example.com'
   *     subject: 'Daily Report — Sales Pipeline'
   *     text: 'Pipeline run completed. See attached report for details.'
   *     html: '<strong>Pipeline run completed.</strong>'
   * ```
   */
  static async send(params: SendParams): Promise<boolean> {
    const {
      host,
      port,
      secure = false,
      user,
      pass,
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      attachments = [],
    } = validations.email.send.runtime.validate(params);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      attachments,
    });

    return true;
  }
}
