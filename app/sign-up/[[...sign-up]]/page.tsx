import { SignUpFlow } from "@/components/auth/SignUpFlow";

export default async function Page(props: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await props.searchParams;

  return (
    <div className="bg-background flex min-h-screen items-start justify-center py-10">
      <SignUpFlow inviteToken={sp.invite} />
    </div>
  );
}
