"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function JoinClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = useMemo(() => (searchParams.get("code") ?? "").toUpperCase(), [searchParams]);

  const [joinCode, setJoinCode] = useState(initialCode);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/players/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: joinCode.trim().toUpperCase(), username: username.trim() }),
      });
      const data = (await res.json()) as { playerId?: string; error?: unknown };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not join");
      }
      if (!data.playerId) {
        throw new Error("Missing player id");
      }
      const code = joinCode.trim().toUpperCase();
      router.push(`/game/${code}/play?playerId=${encodeURIComponent(data.playerId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join a game</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="code">Join code</Label>
              <Input
                id="code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                autoCapitalize="characters"
                inputMode="text"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <Button type="submit" disabled={loading || joinCode.length !== 6 || username.trim().length < 2}>
              {loading ? "Joining…" : "Enter game"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
