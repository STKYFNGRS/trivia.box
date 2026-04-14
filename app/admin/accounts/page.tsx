"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Account = {
  id: string;
  accountType: string;
  name: string;
  email: string;
  city: string;
  subscriptionActive: boolean;
};

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  async function refresh() {
    const res = await fetch("/api/admin/accounts");
    const data = (await res.json()) as { accounts?: Account[] };
    if (!res.ok) {
      toast.error("Failed to load accounts");
      return;
    }
    setAccounts(data.accounts ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <Button type="button" variant="secondary" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">{a.name}</CardTitle>
              <div className="text-muted-foreground text-xs">
                {a.accountType} · {a.city} · {a.email}
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Subscription:{" "}
              <span className="text-foreground font-medium">{a.subscriptionActive ? "active" : "inactive"}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
