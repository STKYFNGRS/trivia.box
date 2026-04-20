import Link from "next/link";
import { DeckEditorClient } from "@/components/dashboard/decks/DeckEditorClient";

export default async function DeckEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/decks" className="text-muted-foreground text-xs underline underline-offset-4">
          ← Back to decks
        </Link>
      </div>
      <DeckEditorClient deckId={id} />
    </div>
  );
}
