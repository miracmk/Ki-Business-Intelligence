// FAZ 5.5: email action handler. Inline nodemailer transport, matching the pattern already
// used in src/api/routes/auth.ts (no shared email helper exists in this codebase yet).
import nodemailer from 'nodemailer'
import { env } from '../../../config/env.js'

export interface EmailJobData {
  to: string
  subject: string
  body: string
  moduleKey: string
  recordId: string
}

export async function emailHandler(data: EmailJobData): Promise<void> {
  if (!data.to) throw new Error('email: to eksik')
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  })
  await transport.sendMail({
    from: env.SMTP_FROM,
    to: data.to,
    subject: data.subject,
    text: data.body,
  })
}
