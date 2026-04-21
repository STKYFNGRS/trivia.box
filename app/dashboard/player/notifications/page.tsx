import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { ensureEmailPreferences } from "@/lib/email/preferences";
import { PushNotificationToggle } from "@/components/player/PushNotificationToggle";
import { NotificationPreferencesClient } from "./NotificationPreferencesClient";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  const preferences = await ensureEmailPreferences(account.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/player"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to player dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Email notifications
        </h1>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          Pick which Trivia.Box emails land in your inbox. Toggles take effect
          immediately.
        </p>
      </div>

      <NotificationPreferencesClient
        initial={preferences}
        accountEmail={account.email}
      />

      <div className="border-border/60 flex flex-col gap-3 rounded-lg border bg-white/5 p-4">
        <div>
          <h2 className="text-base font-semibold">Push notifications</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Get a tap on your phone when your venue schedules a new game or
            you&apos;ve won a prize — no email required.
          </p>
        </div>
        <PushNotificationToggle />
      </div>

      <p className="text-muted-foreground max-w-xl text-xs">
        Need to pause everything? Use the{" "}
        <em>Unsubscribe from all</em> link at the bottom of any Trivia.Box
        email, or toggle every switch off here.
      </p>
    </div>
  );
}
