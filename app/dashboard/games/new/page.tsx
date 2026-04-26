import { GameSetup } from "@/components/dashboard/GameSetup";
import { SectionHeader } from "@/components/ui/section-header";

export default function NewGamePage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="New game"
        title="Create a lobby"
        description="Pick a venue and start time, set the game shape, and we'll generate a join code you can share right away. Start the game when everyone's ready."
      />
      <GameSetup />
    </div>
  );
}
