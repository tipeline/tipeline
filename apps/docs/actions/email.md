<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Email Actions

## General

### `send`

Sends an email via an SMTP transporter using the provided credentials and message fields.

**Returns:** `true` when the message is accepted by the SMTP server.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `host` | string | ✓ | — | SMTP server hostname or IP address. |
| `port` | number | ✓ | — | SMTP server port (e.g. 465, 587). |
| `secure` | boolean |  | — | Use TLS for the connection. True for port 465, false for STARTTLS. |
| `user` | string | ✓ | — | SMTP authentication username. |
| `pass` | string | ✓ | — | SMTP authentication password. |
| `from` | string | ✓ | — | Sender email address. |
| `to` | string \| string[] | ✓ | — | Recipient email address or list of addresses. |
| `cc` | string \| string[] |  | — | Carbon copy recipient email address or list. |
| `bcc` | string \| string[] |  | — | Blind carbon copy recipient email address or list. |
| `subject` | string | ✓ | — | Email subject line. |
| `text` | string |  | — | Plain-text body of the email. |
| `html` | string |  | — | HTML body of the email (takes precedence over text for HTML-capable clients). |
| `attachments` | any |  | — | File attachments to include with the email. |

```yaml
# Send a plain-text and HTML email with an optional file attachment
- group: email
  name: send
  params:
    host: '{{ smtpHost }}'
    port: 587
    secure: false
    user: '{{ smtpUser }}'
    pass: '{{ smtpPass }}'
    from: 'sender@example.com'
    to: 'recipient@example.com'
    subject: 'Daily Report — Sales Pipeline'
    text: 'Pipeline run completed. See attached report for details.'
    html: '<strong>Pipeline run completed.</strong>'
```
