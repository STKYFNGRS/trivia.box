import { notFound } from "next/navigation";
import { SoloPlayClient } from "./SoloPlayClient";

export const dynamic = "force-dynamic";

export default async function SoloPlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Basic validation; the API does proper auth + ownership checks.
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }
  return <SoloPlayClient sessionId={id} />;
}
