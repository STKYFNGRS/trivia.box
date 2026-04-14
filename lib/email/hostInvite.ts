import { Resend } from "resend";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(key);
}

export async function sendHostInviteEmail(input: {
  to: string;
  venueName: string;
  token: string;
}) {
  const from = process.env.INVITES_FROM_EMAIL;
  if (!from) {
    throw new Error("INVITES_FROM_EMAIL is not set");
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const url = `${base}/signup/host?invite=${encodeURIComponent(input.token)}`;

  await getResend().emails.send({
    from,
    to: input.to,
    subject: `You're invited to host trivia for ${input.venueName}`,
    html: `<p>${input.venueName} invited you to join trivia.box as their host.</p><p><a href="${url}">Create your host account</a></p>`,
  });
}
