"use client";

import { AlertTriangle } from "lucide-react";

export function TaxonomyMissingBanner(props: { migration?: string | null; message?: string | null }) {
  const migration = props.migration ?? "0004_question_taxonomy";
  const msg =
    props.message ??
    "Taxonomy tables are missing. Run the migration to enable Generate + Taxonomy tabs.";
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 shadow-[var(--shadow-card)] dark:text-amber-50">
      <div className="flex items-center gap-2 font-semibold tracking-tight">
        <AlertTriangle className="size-4" />
        Taxonomy not ready
      </div>
      <p className="mt-1 leading-relaxed">{msg}</p>
      <p className="mt-2">
        From the project root run:{" "}
        <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">
          npm run db:migrate
        </code>{" "}
        to apply{" "}
        <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">{migration}</code>.
      </p>
      <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-100/70">
        The Library and Review tabs work without this migration; Generate and Taxonomy are disabled
        until it&apos;s applied.
      </p>
    </div>
  );
}
