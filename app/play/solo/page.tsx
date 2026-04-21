import { Suspense } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SoloSetupClient } from "./SoloSetupClient";

export const dynamic = "force-dynamic";

export default function SoloSetupPage() {
  // Wrapped in MarketingShell so the standard nav + footer frame the solo
  // setup page — previously this route rendered with no chrome, leaving the
  // user stranded with no way back to the site nav on mobile.
  return (
    <MarketingShell>
      <Suspense
        fallback={
          <div className="p-6 text-sm text-white/70">Loading...</div>
        }
      >
        <SoloSetupClient />
      </Suspense>
    </MarketingShell>
  );
}
