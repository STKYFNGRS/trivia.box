import Link from "next/link";
import {
  BarChart3,
  Flag,
  FolderTree,
  Gamepad2,
  Inbox,
  Library,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Users2,
} from "lucide-react";
import { isSiteAdminOperator } from "@/lib/siteAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

type SectionTile = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  operatorOnly?: boolean;
};

const TILES: SectionTile[] = [
  {
    href: "/admin/questions",
    title: "Question studio",
    description: "Filter, edit, retire, or create vetted questions.",
    icon: Library,
  },
  {
    href: "/admin/questions?view=review",
    title: "Draft review",
    description: "Approve or reject AI-generated drafts waiting for you.",
    icon: ListChecks,
    operatorOnly: true,
  },
  {
    href: "/admin/questions?view=generate",
    title: "Generate",
    description: "Queue up AI generation across coverage gaps.",
    icon: Sparkles,
    operatorOnly: true,
  },
  {
    href: "/admin/questions?view=taxonomy",
    title: "Taxonomy",
    description: "Manage categories, subcategories, and coverage targets.",
    icon: FolderTree,
    operatorOnly: true,
  },
  {
    href: "/admin/deck-submissions",
    title: "Deck submissions",
    description: "Approve or reject host-submitted public decks.",
    icon: Inbox,
    operatorOnly: true,
  },
  {
    href: "/admin/house-games",
    title: "House games",
    description: "Schedule, pre-book, or cancel the free platform-hosted games.",
    icon: Gamepad2,
    operatorOnly: true,
  },
  {
    href: "/admin/flags",
    title: "Flag queue",
    description: "Review host-reported problem questions.",
    icon: Flag,
  },
  {
    href: "/admin/accounts",
    title: "Accounts",
    description: "Subscription status and venue roster.",
    icon: Users2,
  },
  {
    href: "/admin/stats",
    title: "Category stats",
    description: "Vetted question counts by category.",
    icon: BarChart3,
  },
  {
    href: "/admin/anti-cheat",
    title: "Anti-cheat",
    description: "Review clustered fingerprints and disqualify suspicious answers.",
    icon: ShieldAlert,
    operatorOnly: true,
  },
];

export default async function AdminHomePage() {
  const siteOperator = await isSiteAdminOperator();
  const visibleTiles = TILES.filter((t) => !t.operatorOnly || siteOperator);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Control room"
        description="Everything to keep the question pool, decks, and operator signals healthy."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full ring-1 ring-border shadow-[var(--shadow-card)] transition-all group-hover:ring-border/80 group-hover:-translate-y-0.5">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted/60 text-foreground ring-1 ring-border">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold tracking-tight text-foreground">
                      {tile.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
