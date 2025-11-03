// server-only
import { Resend } from "resend";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const apiKey = process.env.RESEND_API_KEY || "";
const from =
  process.env.RESEND_FROM ||
  process.env.EMAIL_FROM ||
  `no-reply@${new URL(siteUrl).hostname}`;

// Resend client may be absent if no key
export const resend = apiKey ? new Resend(apiKey) : null;
export const EMAIL_FROM = from;
export const BASE_URL = siteUrl;

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendInviteEmail(to: string, joinUrl: string): Promise<SendResult> {
  if (!resend) return { ok: false, error: "RESEND_API_KEY not configured" };

  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM, // for dev: onboarding@resend.dev
      to,
      subject: "You're invited to join Schedule-It",
      html: `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
          <p>You have been invited to join a business on Schedule-It.</p>
          <p><a href="${joinUrl}">Accept invite</a></p>
          <p>If the link does not open, copy and paste this URL:<br>${joinUrl}</p>
        </div>
      `,
      text: `Join: ${joinUrl}`,
    });

    if (result?.error) return { ok: false, error: result.error.message ?? "Resend error" };
    const id = result?.data?.id;
    if (!id) return { ok: false, error: "No id returned from Resend" };
    return { ok: true, id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
