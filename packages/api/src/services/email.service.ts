import nodemailer from 'nodemailer'
import { config } from '../config.js'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    })
  }
  return transporter
}

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(opts: EmailOptions): Promise<void> {
  if (!config.smtp.host) {
    console.warn('SMTP not configured — skipping email send')
    return
  }

  await getTransporter().sendMail({
    from: config.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, ''),
  })
}

export async function sendWelcomeEmail(opts: {
  to: string
  username: string
  orgName: string
  loginUrl: string
}) {
  await sendEmail({
    to: opts.to,
    subject: `Welcome to ${opts.orgName} — NexRAD`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">NexRAD</h1>
        </div>
        <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #111827; margin-top: 0;">Welcome to ${opts.orgName}</h2>
          <p style="color: #374151;">Your account has been created.</p>
          <p style="color: #374151;"><strong>Username:</strong> ${opts.username}</p>
          <div style="margin: 24px 0;">
            <a href="${opts.loginUrl}"
               style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px;
                      text-decoration: none; font-weight: 600;">
              Log In to NexRAD
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            If you did not expect this email, please ignore it.
          </p>
        </div>
      </div>
    `,
  })
}

export async function sendTokenBatchEmail(opts: {
  to: string
  orgName: string
  batchId: string
  count: number
  planName: string
  printUrl: string
}) {
  await sendEmail({
    to: opts.to,
    subject: `${opts.count} ${opts.planName} tokens generated — ${opts.orgName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">NexRAD</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <h2 style="color: #111827; margin-top: 0;">Tokens Generated</h2>
          <p style="color: #374151;">
            <strong>${opts.count}</strong> tokens for plan <strong>${opts.planName}</strong>
            have been generated (Batch ID: <code>${opts.batchId.slice(0, 8)}…</code>).
          </p>
          <div style="margin: 24px 0;">
            <a href="${opts.printUrl}"
               style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px;
                      text-decoration: none; font-weight: 600;">
              Print Vouchers (PDF)
            </a>
          </div>
        </div>
      </div>
    `,
  })
}
