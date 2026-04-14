import { GameSetup } from "@/components/dashboard/GameSetup";

export default function NewGamePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New game</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure rounds, pull vetted questions, preview swaps, then launch.
        </p>
      </div>
      <GameSetup />
    </div>
  );
}
