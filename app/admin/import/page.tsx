import { BulkImporter } from "@/components/admin/BulkImporter";

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Bulk importer</h1>
      <BulkImporter />
    </div>
  );
}
