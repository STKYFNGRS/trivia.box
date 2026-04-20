import Link from "next/link";
import { DeckListClient } from "@/components/dashboard/decks/DeckListClient";
import { SectionHeader } from "@/components/ui/section-header";

export default function DecksPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="Library"
        title="My decks"
        description={
          <>
            A deck is a reusable set of questions you write. Keep decks private for your own
            games, or submit one for public review so other hosts can use it too.{" "}
            <Link
              href="/dashboard/games/new"
              className="text-foreground underline underline-offset-4"
            >
              Create a game
            </Link>{" "}
            to pull from a deck or from the vetted community pool.
          </>
        }
      />
      <DeckListClient />
    </div>
  );
}
