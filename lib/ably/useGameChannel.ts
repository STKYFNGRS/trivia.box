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

    const realtime = new Ably.Realtime({
      authCallback: async (_tokenParams, callback) => {
        try {
          const res = await fetch("/api/ably/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ joinCode: code }),
          });
          const tokenRequest = await res.json();
          if (!res.ok) {
            callback(res.statusText, null);
            return;
          }
          callback(null, tokenRequest);
        } catch (e) {
          callback(e instanceof Error ? e.message : "Auth error", null);
        }
      },
    });

    realtime.connection.on((stateChange) => {
      setConnectionState(stateChange.current);
    });

    const channel = realtime.channels.get(`game:${code}`);
    const handler = (msg: Ably.Message) => {
      counter.current += 1;
      const name = msg.name ?? "message";
      setMessages((prev) => [
        ...prev,
        { id: `${msg.timestamp}-${counter.current}`, name, data: msg.data },
      ]);
    };

    channel.subscribe(handler);

    return () => {
      channel.unsubscribe(handler);
      realtime.close();
    };
  }, [code]);

  return { messages, connectionState };
}
