import { QuestionManager } from "@/components/admin/QuestionManager";

export default function AdminQuestionsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Question manager</h1>
      <QuestionManager />
    </div>
  );
}
