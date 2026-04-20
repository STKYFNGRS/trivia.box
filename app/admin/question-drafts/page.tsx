import { redirect } from "next/navigation";

export default async function QuestionDraftsRedirect(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await props.searchParams;
  const status = tab === "rejected" || tab === "approved" ? tab : "pending";
  redirect(`/admin/questions?view=review&status=${status}`);
}
