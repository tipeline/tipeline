import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

const portNumber = () =>
  z.preprocess(
    (val) => (typeof val === 'string' ? Number(val) : val),
    z.number().int().positive()
  );

const emailAddress = z.string().email();
const addressList = z.union([emailAddress, z.array(emailAddress)]);

export const meta = {
  label: 'Email',
  icon: 'Mail'
}

export const validations = {
  send: createValidationPair(
    {
      // Runtime schema is strict — variables have been substituted by this point.
      runtime: z.object({
        host: z.string().min(1),
        port: portNumber(),
        secure: z.boolean().optional(),
        user: z.string().min(1),
        pass: z.string().min(1),
        from: emailAddress,
        to: addressList,
        cc: addressList.optional(),
        bcc: addressList.optional(),
        subject: z.string().min(1),
        text: z.string().optional(),
        html: z.string().optional(),
        attachments: z.any().optional(),
      }),
      // Creation schema is lenient — fields may still be {{ variable }} template strings.
      creation: z.object({
        host: orTemplateString(z.string().min(1)),
        port: orTemplateString(portNumber()),
        secure: orTemplateString(z.boolean()).optional(),
        user: orTemplateString(z.string().min(1)),
        pass: orTemplateString(z.string().min(1)),
        from: orTemplateString(emailAddress),
        to: orTemplateString(addressList),
        cc: orTemplateString(addressList).optional(),
        bcc: orTemplateString(addressList).optional(),
        subject: orTemplateString(z.string().min(1)),
        text: orTemplateString(z.string()).optional(),
        html: orTemplateString(z.string()).optional(),
        attachments: z.any().optional(),
      }),
    },
    {
      label: 'Send Email', icon: '📧', category: 'email', description: 'Send an email via SMTP.',
      returns: 'boolean',
      fieldConfig: {
        host: { description: 'SMTP server hostname or IP address.' },
        port: { description: 'SMTP server port (e.g. 465, 587).', component: 'string' },
        secure: { description: 'Use TLS for the connection. True for port 465, false for STARTTLS.' },
        user: { description: 'SMTP authentication username.' },
        pass: { description: 'SMTP authentication password.' },
        from: { description: 'Sender email address.' },
        to: { description: 'Recipient email address or list of addresses.' },
        cc: { description: 'Carbon copy recipient email address or list.' },
        bcc: { description: 'Blind carbon copy recipient email address or list.' },
        subject: { description: 'Email subject line.' },
        text: { description: 'Plain-text body of the email.' },
        html: { description: 'HTML body of the email (takes precedence over text for HTML-capable clients).' },
        attachments: { description: 'File attachments to include with the email.' },
      },
    }
  ),
};
