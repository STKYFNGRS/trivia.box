import { redirect } from "next/navigation";

export default async function Page(props: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await props.searchParams;
  const q = sp.invite ? `?invite=${encodeURIComponent(sp.invite)}` : "";
  redirect(`/sign-up${q}`);
}
