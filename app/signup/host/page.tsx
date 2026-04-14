import { redirect } from "next/navigation";

export default async function Page(props: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await props.searchParams;
  const q = new URLSearchParams({ kind: "host" });
  if (sp.invite) q.set("invite", sp.invite);
  redirect(`/sign-up?${q.toString()}`);
}
