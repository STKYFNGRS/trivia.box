import { notFound } from "next/navigation";
import { SoloRecapClient } from "./SoloRecapClient";

export const dynamic = "force-dynamic";

export default async function SoloRecapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <SoloRecapClient sessionId={id} />;
}
