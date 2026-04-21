import { NextResponse } from "next/server";
import { applyUnsubscribe } from "@/lib/email/preferences";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe endpoint. One URL handles both:
 *   - Humans clicking the footer link (GET) → render a tiny confirmation
 *     page right in the response body so we don't need a separate app
 *     route for the landing view.
 *   - RFC 8058 one-click unsubscribe (POST) → Gmail / Apple Mail fire this
 *     when the user clicks the native "Unsubscribe" link in the inbox; we
 *     apply the preference change and return 200 JSON.
 *
 * Both paths verify the signed token in `?t=` before doing anything so a
 * URL that leaks into logs can't be replayed against a different account.
 */

function scopeCopy(scope: string): string {
  if (scope === "all") return "all Trivia.Box emails";
  if (scope === "prize_won") return "prize-won notifications";
  if (scope === "weekly_digest") return "the weekly recap";
  if (scope === "upcoming_sessions") return "upcoming session reminders";
  return "marketing emails";
}

function htmlConfirmationBody(opts: { ok: boolean; message: string }) {
  const title = opts.ok ? "You're unsubscribed" : "Link expired";
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Trivia.Box</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; background:#0a0a14; color:#e7e7ef; font-family: Inter,ui-sans-serif,system-ui,sans-serif; }
    .card { max-width: 520px; margin: 15vh auto; padding: 28px; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; background: rgba(255,255,255,0.02); }
    .brand { font-weight: 700; letter-spacing: 0.08em; color: #22e0ff; text-decoration: none; font-size: 14px; text-transform: uppercase; }
    h1 { margin: 16px 0 12px; font-size: 26px; }
    p { color: rgba(231,231,239,0.78); line-height: 1.6; margin: 0 0 8px; }
    a.btn { display:inline-block; margin-top: 16px; padding: 10px 18px; border-radius: 999px; background: #22e0ff; color: #0a0a14; font-weight: 700; text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <a class="brand" href="/">Trivia.Box</a>
    <h1>${title}</h1>
    <p>${opts.message}</p>
    <a class="btn" href="/dashboard/player/notifications">Manage preferences</a>
  </div>
</body></html>`;
}

async function applyOrReject(token: string | null) {
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) return { ok: false as const };
  try {
    await applyUnsubscribe(parsed.accountId, parsed.scope);
    return { ok: true as const, scope: parsed.scope };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const result = await applyOrReject(url.searchParams.get("t"));
  if (!result.ok) {
    return new NextResponse(
      htmlConfirmationBody({
        ok: false,
        message:
          "This unsubscribe link is invalid or has been tampered with. Toggle notifications off from your dashboard instead.",
      }),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  return new NextResponse(
    htmlConfirmationBody({
      ok: true,
      message: `We've stopped sending you ${scopeCopy(result.scope)}.`,
    }),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const result = await applyOrReject(url.searchParams.get("t"));
  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true, scope: result.scope });
}
