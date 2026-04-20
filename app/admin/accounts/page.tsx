"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";

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
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/accounts");
      const data = (await res.json()) as { accounts?: Account[] };
      if (!res.ok) {
        toast.error("Failed to load accounts");
        return;
      }
      setAccounts(data.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Accounts"
        description="Subscription status across hosts, venues, and players."
        actions={
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <SkeletonList rows={5} rowHeight="h-14" />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={<Users2 className="size-6" />}
          title="No accounts"
          description="Signed-up accounts will appear here."
        />
      ) : (
        <div className="grid gap-3">
          {accounts.map((a) => (
            <Card key={a.id} className="ring-1 ring-border shadow-[var(--shadow-card)]">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-base font-semibold tracking-tight">{a.name}</CardTitle>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {a.accountType} · {a.city} · {a.email}
                  </div>
                </div>
                <StatusPill tone={a.subscriptionActive ? "success" : "neutral"} dot>
                  {a.subscriptionActive ? "Active" : "Inactive"}
                </StatusPill>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Subscription status reflects the latest Stripe sync.
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
