import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminHomePage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <Link className="text-primary font-medium underline" href="/admin/questions">
            Open question manager
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Flags</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <Link className="text-primary font-medium underline" href="/admin/flags">
            Review host flags
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <Link className="text-primary font-medium underline" href="/admin/accounts">
            Subscription overview
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Importer</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <Link className="text-primary font-medium underline" href="/admin/import">
            Bulk JSON import
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Category stats</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <Link className="text-primary font-medium underline" href="/admin/stats">
            Vetted counts by category
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
