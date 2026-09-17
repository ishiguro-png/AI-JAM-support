import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER / GMAIL_APP_PASSWORD が設定されていません。.env を確認してください。"
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  return transporter;
}

export async function sendSupportEmail(params: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}) {
  const from = process.env.GMAIL_USER;
  const t = getTransporter();
  await t.sendMail({
    from,
    to: params.to,
    cc: params.cc || undefined,
    subject: params.subject,
    text: params.body,
  });
}
