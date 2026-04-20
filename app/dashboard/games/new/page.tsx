import { GameSetup } from "@/components/dashboard/GameSetup";
import { SectionHeader } from "@/components/ui/section-header";

export default function NewGamePage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="New game"
        title="Plan a session"
        description="Set when the event runs (with time zone) and optional prize info for players browsing upcoming games. Then configure rounds, preview, and launch."
      />
      <GameSetup />
    </div>
  );
}
