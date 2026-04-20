import { Suspense } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { JoinClient } from "./JoinClient";

export default function JoinPage() {
  return (
    <MarketingShell wide>
      <Suspense fallback={<div className="p-6 text-sm text-white/60">Loading…</div>}>
        <JoinClient />
      </Suspense>
    </MarketingShell>
  );
}
