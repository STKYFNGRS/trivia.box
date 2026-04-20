import { Suspense } from "react";
import { SoloSetupClient } from "./SoloSetupClient";

export const dynamic = "force-dynamic";

export default function SoloSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--stage-bg)] p-6 text-sm text-white/70">
          Loading...
        </div>
      }
    >
      <SoloSetupClient />
    </Suspense>
  );
}
