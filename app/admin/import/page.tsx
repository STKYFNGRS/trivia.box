import { BulkImporter } from "@/components/admin/BulkImporter";
import { SectionHeader } from "@/components/ui/section-header";

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Bulk importer"
        description="Paste a JSON array of questions to bulk-insert into the pool."
      />
      <BulkImporter />
    </div>
  );
}
