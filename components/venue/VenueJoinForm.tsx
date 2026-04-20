"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Join form shown on the venue lobby when a game is live. The join code is the
 * sole "at the venue" gate, which is exactly the flow the host wants — display
 * screen shows the code, lobby sends players to `/join` after they enter it.
 */
export function VenueJoinForm() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    router.push(`/join?code=${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
        placeholder="Join code"
        autoComplete="off"
        autoCapitalize="characters"
        autoFocus
        maxLength={32}
        className="flex-1 bg-white/90 font-mono text-lg uppercase tracking-widest text-slate-900 placeholder:text-slate-400"
      />
      <Button type="submit" disabled={busy || code.trim().length === 0} size="lg">
        Join game
      </Button>
    </form>
  );
}
