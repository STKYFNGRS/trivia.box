import { SignUpFlow } from "@/components/auth/SignUpFlow";

export default async function Page(props: {
  searchParams: Promise<{ kind?: string; invite?: string }>;
}) {
  const sp = await props.searchParams;
  const defaultKind = sp.invite ? "host" : sp.kind === "venue" ? "venue" : "host";

  return (
    <div className="bg-background flex min-h-screen items-start justify-center py-10">
      <SignUpFlow defaultKind={defaultKind} inviteToken={sp.invite} />
    </div>
  );
}
