import Link from "next/link";
import { redirect } from "next/navigation";
import { isClerkAdmin } from "@/lib/admin";
import { isSiteAdminOperator } from "@/lib/siteAdmin";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navLinkClass =
  "text-sm font-medium text-muted-foreground tracking-tight transition-colors hover:text-foreground";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const clerkAdmin = await isClerkAdmin();
  const siteOperator = await isSiteAdminOperator();
  if (!clerkAdmin && !siteOperator) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                trivia.box
              </span>
              <span className="text-sm font-semibold tracking-tight text-foreground">admin</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-4">
              <Link href="/admin" className={navLinkClass}>
                Home
              </Link>
              <Link href="/admin/questions" className={navLinkClass}>
                Questions
              </Link>
              {siteOperator ? (
                <Link href="/admin/deck-submissions" className={navLinkClass}>
                  Deck submissions
                </Link>
              ) : null}
              {siteOperator ? (
                <Link href="/admin/house-games" className={navLinkClass}>
                  House games
                </Link>
              ) : null}
              <Link href="/admin/flags" className={navLinkClass}>
                Flags
              </Link>
              <Link href="/admin/stats" className={navLinkClass}>
                Stats
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Back to dashboard
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}
