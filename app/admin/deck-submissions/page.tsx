import { redirect } from "next/navigation";
import { isSiteAdminOperator } from "@/lib/siteAdmin";
import { DeckSubmissionsClient } from "@/components/admin/DeckSubmissionsClient";
import { SectionHeader } from "@/components/ui/section-header";

export default async function DeckSubmissionsPage() {
  const siteOperator = await isSiteAdminOperator();
  if (!siteOperator) {
    redirect("/admin");
  }
  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Deck submissions"
        description="Hosts can submit their decks for public review. Approve to let every host pull from the deck; reject with a note to send the author back to edit."
      />
      <DeckSubmissionsClient />
    </div>
  );
}
