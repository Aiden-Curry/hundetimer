import { Resend } from 'resend';

let resendClient: Resend | null = null;

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

export async function sendTransactionalEmail(options: {
  to: string | null | undefined;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey: string;
}) {
  const resend = getResend();
  if (!resend || !options.to) {
    if (!resend) console.warn(`[email skipped] RESEND_API_KEY mangler: ${options.subject}`);
    return { skipped: true as const };
  }

  const testTo = process.env.EMAIL_TEST_TO?.trim();
  const actualTo = testTo || options.to;
  const subject = testTo && testTo.toLowerCase() !== options.to.toLowerCase()
    ? `[TEST til ${options.to}] ${options.subject}`
    : options.subject;

  const from = process.env.EMAIL_FROM?.trim() || 'Hundetimer <onboarding@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || undefined;

  const { data, error } = await resend.emails.send({
    from,
    to: actualTo,
    subject,
    html: options.html,
    text: options.text,
    replyTo,
  }, { idempotencyKey: options.idempotencyKey });

  if (error) throw new Error(error.message);
  return { skipped: false as const, id: data?.id || null };
}
