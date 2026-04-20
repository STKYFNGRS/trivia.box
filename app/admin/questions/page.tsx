import { Suspense } from "react";
import { isSiteAdminOperator } from "@/lib/siteAdmin";
import { QuestionStudio } from "@/components/admin/QuestionStudio";

export default async function AdminQuestionsPage() {
  const siteOperator = await isSiteAdminOperator();
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading question studio…</p>}>
      <QuestionStudio isSiteOperator={siteOperator} />
    </Suspense>
  );
}
