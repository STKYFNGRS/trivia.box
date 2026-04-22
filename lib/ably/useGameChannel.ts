"use client";

import * as Ably from "ably";
import { useEffect, useMemo, useRef, useState } from "react";

export type GameChannelMessage = {
  id: string;
  name: string;
  data: unknown;
};

export function useGameChannel(joinCode: string | null) {
  const [messages, setMessages] = useState<GameChannelMessage[]>([]);
  const [connectionState, setConnectionState] = useState<string>("initialized");
  const counter = useRef(0);

  const code = useMemo(() => joinCode?.toUpperCase() ?? null, [joinCode]);

  useEffect(() => {
    if (!code) return;

    // `cancelled` lets us swallow late promise resolutions from the auth
    // callback, channel subscribe, and connection-state listener after the
    // effect is torn down (unmount, `code` change, StrictMode re-run). Without
    // this, closing the Ably client while an auth fetch or initial connect is
    // still in flight surfaces an "Connection closed" ErrorInfo through the
    // Next.js dev overlay as an unhandled runtime error.
    let cancelled = false;

    const realtime = new Ably.Realtime({
      authCallback: async (_tokenParams, callback) => {
        try {
          const res = await fetch("/api/ably/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ joinCode: code }),
          });
          if (cancelled) {
            callback("cancelled", null);
            return;
          }
          const tokenRequest = await res.json();
          if (cancelled) {
            callback("cancelled", null);
            return;
          }
          if (!res.ok) {
            callback(res.statusText, null);
            return;
          }
          callback(null, tokenRequest);
        } catch (e) {
          if (cancelled) {
            callback("cancelled", null);
            return;
          }
          callback(e instanceof Error ? e.message : "Auth error", null);
        }
      },
    });

    realtime.connection.on((stateChange) => {
      if (cancelled) return;
      setConnectionState(stateChange.current);
    });

    // `rewind` asks Ably to replay the last ~2 minutes of messages to a newly
    // attaching client, so a player or display that refreshes mid-round
    // still gets the current `question_started`, `answers_locked`, and
    // `answer_revealed` events without waiting for the host to publish again.
    const channel = realtime.channels.get(`game:${code}`, {
      params: { rewind: "2m" },
    });
    const handler = (msg: Ably.Message) => {
      if (cancelled) return;
      counter.current += 1;
      const name = msg.name ?? "message";
      setMessages((prev) => [
        ...prev,
        { id: `${msg.timestamp}-${counter.current}`, name, data: msg.data },
      ]);
    };

    // `channel.subscribe` returns a promise in newer Ably SDKs. If we unmount
    // before the initial attach resolves, that promise rejects with
    // "Connection closed" / "Channel detached" — harmless here, but Next.js
    // surfaces unhandled rejections in the dev overlay.
    void Promise.resolve(channel.subscribe(handler)).catch(() => {});

    return () => {
      cancelled = true;
      try {
        channel.unsubscribe(handler);
      } catch {
        // Unsubscribing a channel that's already detached is benign.
      }
      // `close()` can reject in-flight internal promises (e.g. the initial
      // token auth or connect) with an ErrorInfo whose message is
      // "Connection closed". Those rejections are safe to ignore — we're
      // deliberately tearing the connection down — but if they leak to
      // `window` they trigger Next.js' runtime-error overlay in dev.
      try {
        realtime.close();
      } catch {
        // no-op: already closed / in a terminal state
      }
    };
  }, [code]);

  return { messages, connectionState };
}
