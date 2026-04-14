import { Suspense } from "react";
import { JoinClient } from "./JoinClient";

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <JoinClient />
    </Suspense>
  );
}
