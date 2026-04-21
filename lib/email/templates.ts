/**
 * Hand-rolled HTML + plain-text email templates. No external template
 * engine — the amount of variation is small, every mail client is happier
 * with inline styles, and this keeps the server bundle tiny.
 *
 * Every template returns `{ subject, html, text }`. The outer chrome
 * (`layout`) centralises footer / unsubscribe link so a new template only
 * has to produce the body.
 */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(input: {
  title: string;
  preheader: string;
  bodyHtml: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  siteUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): { html: string; text: string } {
  const cta =
    input.ctaLabel && input.ctaUrl
      ? `
      <tr><td align="center" style="padding:16px 0 8px 0;">
        <a href="${input.ctaUrl}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#22e0ff;color:#0a0a14;font-weight:700;text-decoration:none;font-family:Inter,ui-sans-serif,system-ui;font-size:14px;letter-spacing:0.02em;">
          ${escapeHtml(input.ctaLabel)}
        </a>
      </td></tr>`
      : "";
  const html = `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a14;color:#e7e7ef;font-family:Inter,ui-sans-serif,system-ui,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0a0a14;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#11111d;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px 24px;">
      <tr><td style="padding-bottom:12px;">
        <a href="${input.siteUrl}" style="text-decoration:none;color:#22e0ff;font-weight:700;font-size:18px;letter-spacing:0.08em;">TRIVIA.BOX</a>
      </td></tr>
      <tr><td style="color:#e7e7ef;font-size:15px;line-height:1.6;">
        ${input.bodyHtml}
      </td></tr>
      ${cta}
      <tr><td style="padding-top:28px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(231,231,239,0.55);font-size:12px;line-height:1.5;">
        You're getting this because you have a Trivia.Box account.
        <br/>
        <a href="${input.manageUrl}" style="color:#22e0ff;text-decoration:none;">Manage email preferences</a>
        &nbsp;·&nbsp;
        <a href="${input.unsubscribeUrl}" style="color:rgba(231,231,239,0.7);text-decoration:none;">Unsubscribe from all</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  const text = `${input.bodyText}

---
Manage preferences: ${input.manageUrl}
Unsubscribe from all: ${input.unsubscribeUrl}`;
  return { html, text };
}

export function renderPrizeWonEmail(input: {
  username: string;
  venueName: string;
  rankLabel: string;
  prizeLabel: string;
  claimCode: string;
  expiresAt: string | null;
  claimUrl: string;
  siteUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): RenderedEmail {
  const subject = `You won a prize at ${input.venueName} — show your claim code`;
  const preheader = `Claim code ${input.claimCode}. Show it at the venue to redeem.`;
  const expiryLine = input.expiresAt
    ? `Expires ${new Date(input.expiresAt).toLocaleDateString()}.`
    : "Redeem next time you're in.";
  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Nice round, <strong>${escapeHtml(input.username)}</strong>.</p>
    <p style="margin:0 0 16px 0;">You finished <strong>${escapeHtml(input.rankLabel)}</strong> at ${escapeHtml(input.venueName)} and earned:</p>
    <p style="margin:0 0 16px 0;font-size:17px;color:#22e0ff;"><strong>${escapeHtml(input.prizeLabel)}</strong></p>
    <p style="margin:0 0 8px 0;">Show the host this code at the venue to redeem:</p>
    <p style="margin:0 0 16px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;letter-spacing:0.4em;color:#ff4ed8;">
      ${escapeHtml(input.claimCode)}
    </p>
    <p style="margin:0 0 16px 0;color:rgba(231,231,239,0.7);font-size:13px;">${escapeHtml(expiryLine)}</p>
  `;
  const bodyText = `Nice round, ${input.username}.

You finished ${input.rankLabel} at ${input.venueName} and earned:

  ${input.prizeLabel}

Claim code: ${input.claimCode}
${expiryLine}

View the claim: ${input.claimUrl}`;
  return {
    subject,
    ...layout({
      title: subject,
      preheader,
      bodyHtml,
      bodyText,
      ctaLabel: "View claim",
      ctaUrl: input.claimUrl,
      siteUrl: input.siteUrl,
      unsubscribeUrl: input.unsubscribeUrl,
      manageUrl: input.manageUrl,
    }),
  };
}

export function renderWeeklyDigestEmail(input: {
  username: string;
  weekLabel: string;
  totals: {
    games: number;
    correct: number;
    points: number;
    xpGained: number;
    dailyStreak: number;
    longestStreak: number;
  };
  newAchievements: Array<{ title: string; description: string }>;
  nextHouseGameAt: string | null;
  dailyUrl: string;
  siteUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): RenderedEmail {
  const subject = `Your Trivia.Box week — ${input.weekLabel}`;
  const preheader =
    input.totals.games > 0
      ? `You played ${input.totals.games} game${input.totals.games === 1 ? "" : "s"} this week.`
      : `Haven't played this week — keep your streak alive.`;

  const achievementsHtml = input.newAchievements.length
    ? `<ul style="margin:8px 0 16px 18px;padding:0;">${input.newAchievements
        .map(
          (a) =>
            `<li style="margin-bottom:6px;"><strong>${escapeHtml(a.title)}</strong> — <span style="color:rgba(231,231,239,0.75);">${escapeHtml(a.description)}</span></li>`
        )
        .join("")}</ul>`
    : `<p style="margin:0 0 16px 0;color:rgba(231,231,239,0.7);">No new trophies this week.</p>`;

  const achievementsText = input.newAchievements.length
    ? input.newAchievements
        .map((a) => `  - ${a.title} — ${a.description}`)
        .join("\n")
    : "  (no new trophies this week)";

  const nextHouseHtml = input.nextHouseGameAt
    ? `<p style="margin:0 0 16px 0;">Next free house game: <strong>${escapeHtml(new Date(input.nextHouseGameAt).toLocaleString())}</strong>.</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 8px 0;">Hey ${escapeHtml(input.username)},</p>
    <p style="margin:0 0 16px 0;">Here's the rundown of your trivia week.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
      <tr>
        <td style="padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
          <div style="font-size:12px;color:rgba(231,231,239,0.55);text-transform:uppercase;letter-spacing:0.12em;">Games</div>
          <div style="font-size:24px;font-weight:700;">${input.totals.games}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
          <div style="font-size:12px;color:rgba(231,231,239,0.55);text-transform:uppercase;letter-spacing:0.12em;">Correct</div>
          <div style="font-size:24px;font-weight:700;">${input.totals.correct}</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
          <div style="font-size:12px;color:rgba(231,231,239,0.55);text-transform:uppercase;letter-spacing:0.12em;">Points</div>
          <div style="font-size:24px;font-weight:700;">${input.totals.points.toLocaleString()}</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px 0;"><strong>Daily streak:</strong> ${input.totals.dailyStreak} day${input.totals.dailyStreak === 1 ? "" : "s"} &nbsp; · &nbsp; <strong>Best answer streak:</strong> ${input.totals.longestStreak}</p>
    <p style="margin:0 0 16px 0;"><strong>XP gained this week:</strong> ${input.totals.xpGained.toLocaleString()}</p>
    <p style="margin:0 0 4px 0;"><strong>New trophies</strong></p>
    ${achievementsHtml}
    ${nextHouseHtml}
  `;
  const bodyText = `Hey ${input.username},

Here's your Trivia.Box week — ${input.weekLabel}.

Games played: ${input.totals.games}
Correct answers: ${input.totals.correct}
Points: ${input.totals.points.toLocaleString()}
XP gained: ${input.totals.xpGained.toLocaleString()}
Daily streak: ${input.totals.dailyStreak} day(s)
Best answer streak: ${input.totals.longestStreak}

New trophies this week:
${achievementsText}
${input.nextHouseGameAt ? `\nNext free house game: ${new Date(input.nextHouseGameAt).toLocaleString()}\n` : ""}
Keep the flame alive — today's daily: ${input.dailyUrl}`;

  return {
    subject,
    ...layout({
      title: subject,
      preheader,
      bodyHtml,
      bodyText,
      ctaLabel: "Play today's daily",
      ctaUrl: input.dailyUrl,
      siteUrl: input.siteUrl,
      unsubscribeUrl: input.unsubscribeUrl,
      manageUrl: input.manageUrl,
    }),
  };
}

export function renderUpcomingSessionEmail(input: {
  username: string;
  venueName: string;
  startsAtIso: string;
  theme: string | null;
  joinUrl: string;
  hasPrize: boolean;
  prizeDescription: string | null;
  siteUrl: string;
  unsubscribeUrl: string;
  manageUrl: string;
}): RenderedEmail {
  const when = new Date(input.startsAtIso);
  const dateLabel = when.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const subject = `Live game at ${input.venueName} — ${dateLabel}`;
  const preheader = `Join code link inside. ${input.theme ? input.theme : "Fresh round of trivia."}`;

  const themeHtml = input.theme
    ? `<p style="margin:0 0 16px 0;"><strong>Theme:</strong> ${escapeHtml(input.theme)}</p>`
    : "";
  const prizeHtml =
    input.hasPrize && input.prizeDescription
      ? `<p style="margin:0 0 16px 0;"><strong>Prize:</strong> ${escapeHtml(input.prizeDescription)}</p>`
      : "";

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hey ${escapeHtml(input.username)},</p>
    <p style="margin:0 0 16px 0;">You've been to <strong>${escapeHtml(input.venueName)}</strong> before — they've got a live Trivia.Box round coming up:</p>
    <p style="margin:0 0 16px 0;font-size:17px;color:#22e0ff;"><strong>${escapeHtml(dateLabel)}</strong></p>
    ${themeHtml}
    ${prizeHtml}
    <p style="margin:0 0 16px 0;color:rgba(231,231,239,0.7);">Tap the button to open the lobby and grab the join code.</p>
  `;
  const bodyText = `Hey ${input.username},

Live Trivia.Box round at ${input.venueName} — ${dateLabel}.
${input.theme ? `Theme: ${input.theme}\n` : ""}${input.hasPrize && input.prizeDescription ? `Prize: ${input.prizeDescription}\n` : ""}
Join: ${input.joinUrl}`;

  return {
    subject,
    ...layout({
      title: subject,
      preheader,
      bodyHtml,
      bodyText,
      ctaLabel: "Open lobby",
      ctaUrl: input.joinUrl,
      siteUrl: input.siteUrl,
      unsubscribeUrl: input.unsubscribeUrl,
      manageUrl: input.manageUrl,
    }),
  };
}
