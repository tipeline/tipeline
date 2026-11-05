import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { GroupEmail } from '@/action/actions/email/actions';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

describe('GroupEmail', () => {
  const baseParams = {
    host: 'smtp.example.com',
    port: 587,
    user: 'smtp-user',
    pass: 'smtp-pass',
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Daily Report',
    text: 'Pipeline run completed.',
  };

  let sendMailMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'abc123' });
    (nodemailer.createTransport as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      sendMail: sendMailMock,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('creates a transporter with the supplied SMTP credentials', async () => {
      await GroupEmail.send(baseParams);

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'smtp-user', pass: 'smtp-pass' },
      });
    });

    it('sends the mail message with the correctly shaped fields', async () => {
      await GroupEmail.send({
        ...baseParams,
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        html: '<strong>Done</strong>',
      });

      expect(sendMailMock).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: 'Daily Report',
        text: 'Pipeline run completed.',
        html: '<strong>Done</strong>',
        attachments: [],
      });
    });

    it('returns true when the message is accepted', async () => {
      const result = await GroupEmail.send(baseParams);
      expect(result).toBe(true);
    });

    it('defaults secure to false and attachments to an empty array when omitted', async () => {
      await GroupEmail.send(baseParams);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ secure: false })
      );
      expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
    });

    it('accepts an array of recipients for to/cc/bcc', async () => {
      await GroupEmail.send({
        ...baseParams,
        to: ['a@example.com', 'b@example.com'],
      });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: ['a@example.com', 'b@example.com'] })
      );
    });

    it('rejects with a validation error when a required field is missing', async () => {
      const { host, ...rest } = baseParams;
      await expect(GroupEmail.send(rest as any)).rejects.toThrow();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('rejects with a validation error when "from" is not a valid email address', async () => {
      await expect(GroupEmail.send({ ...baseParams, from: 'not-an-email' } as any)).rejects.toThrow();
    });

    it('rejects with a validation error when port is not a positive integer', async () => {
      await expect(GroupEmail.send({ ...baseParams, port: -1 } as any)).rejects.toThrow();
    });

    it('propagates the rejection when the SMTP server rejects the message', async () => {
      const smtpError = new Error('SMTP connection refused');
      sendMailMock.mockRejectedValueOnce(smtpError);

      await expect(GroupEmail.send(baseParams)).rejects.toThrow('SMTP connection refused');
    });
  });
});
