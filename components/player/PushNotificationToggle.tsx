"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type BrowserState =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "granted-subscribed"
  | "granted-unsubscribed"
  | "default";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const rawData = atob(
    (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  );
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/**
 * Lightweight toggle for Web Push. Handles:
 *   - feature detection (Safari iOS needs the PWA installed first)
 *   - `VAPID_PUBLIC_KEY` not configured → hides the CTA rather than erroring
 *   - revoked permission → explains how to reset it
 *
 * Delivery itself lives in `lib/push/send.ts` and is triggered by cron /
 * game lifecycle code paths.
 */
export function PushNotificationToggle() {
  const [state, setState] = useState<BrowserState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      let keyRes: Response;
      try {
        keyRes = await fetch("/api/push/public-key", { cache: "no-store" });
      } catch {
        setState("unconfigured");
        return;
      }
      const { publicKey: key } = (await keyRes.json()) as {
        publicKey: string | null;
      };
      if (cancelled) return;
      if (!key) {
        setState("unconfigured");
        return;
      }
      setPublicKey(key);

      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        if (Notification.permission === "default") {
          setState("default");
          return;
        }
        setState(sub ? "granted-subscribed" : "granted-unsubscribed");
      } catch (err) {
        console.warn("[push] service worker register failed", err);
        setState("unsupported");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey || busy) return;
    setBusy(true);
    try {
      const perm =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast to BufferSource — newer lib.dom no longer accepts bare Uint8Array.
        applicationServerKey: urlBase64ToUint8Array(publicKey)
          .buffer as ArrayBuffer,
      });
      const raw = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error("Subscription missing keys");
      }
      const res = await fetch("/api/me/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
        }),
      });
      if (!res.ok) throw new Error("Failed to save subscription");
      setState("granted-subscribed");
      toast.success("Push notifications enabled");
    } catch (err) {
      console.warn("[push] enable failed", err);
      toast.error("Could not enable push. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => null);
        await fetch("/api/me/push-subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => null);
      }
      setState("granted-unsubscribed");
      toast.success("Push notifications turned off");
    } catch (err) {
      console.warn("[push] disable failed", err);
      toast.error("Could not turn off push.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unconfigured") return null;

  if (state === "unsupported") {
    return (
      <p className="text-xs text-white/50">
        Push notifications aren&apos;t supported in this browser. On iPhone,
        install Trivia.Box to your home screen to enable them.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-xs text-white/60">
        Push is blocked at the browser level. Update your site permissions for
        Trivia.Box to re-enable it.
      </p>
    );
  }

  if (state === "granted-subscribed") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void disable()}
      >
        <BellOff className="size-4" aria-hidden />
        Turn off push
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={busy}
      onClick={() => void enable()}
    >
      <BellRing className="size-4" aria-hidden />
      Enable push notifications
    </Button>
  );
}
