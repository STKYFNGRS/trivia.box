import { redirect } from "next/navigation";

export default function QuestionTaxonomyRedirect() {
  redirect("/admin/questions?view=taxonomy");
}
