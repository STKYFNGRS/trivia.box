import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PreviewRow = {
  sessionQuestionId: string;
  questionOrder: number;
  roundNumber: number;
  category: string;
  body: string;
  difficulty: number;
  subcategory: string;
};

export function QuestionPreview(props: { items: PreviewRow[] }) {
  return (
    <div className="grid gap-3">
      {props.items.map((q) => (
        <Card key={q.sessionQuestionId}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">
                R{q.roundNumber} · Q{q.questionOrder}
              </CardTitle>
              <div className="text-muted-foreground mt-1 text-xs">
                {q.category} · {q.subcategory}
              </div>
            </div>
            <Badge variant="secondary">difficulty {q.difficulty}</Badge>
          </CardHeader>
          <CardContent className="text-sm">{q.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}
