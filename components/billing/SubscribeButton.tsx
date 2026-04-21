"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SubscribeButton(props: { returnPath?: string }) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: props.returnPath ?? "/dashboard" }),
      });
      // Defensive parse — the route is supposed to always return JSON, but if
      // an infra layer in front (edge, proxy) returns HTML we don't want the
      // user to see a cryptic "Unexpected end of JSON input".
      const raw = await res.text();
      let data: { url?: string; error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Checkout failed (HTTP ${res.status})`);
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("Missing checkout URL");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" onClick={onClick} disabled={loading}>
      {loading ? "Redirecting…" : "Subscribe for $50/month"}
    </Button>
  );
}
