"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Question = {
  id: string;
  body: string;
  correctAnswer: string;
  wrongAnswers: string[] | null;
  category: string;
  subcategory: string;
  difficulty: number;
  vetted: boolean;
  retired: boolean;
};

export function QuestionManager() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<Question | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (category.trim()) qs.set("category", category.trim());
      const res = await fetch(`/api/admin/questions?${qs.toString()}`);
      const data = (await res.json()) as { questions?: Question[]; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed");
      setQuestions(data.questions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useMemo(() => selected, [selected]);

  async function save() {
    if (!editor) return;
    const wrong = (editor.wrongAnswers ?? []).slice(0, 3);
    if (wrong.length !== 3) {
      toast.error("Need exactly 3 wrong answers");
      return;
    }
    const res = await fetch(`/api/admin/questions/${editor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: editor.body,
        correctAnswer: editor.correctAnswer,
        wrongAnswers: wrong,
        category: editor.category,
        subcategory: editor.subcategory,
        difficulty: editor.difficulty,
        vetted: editor.vetted,
        retired: editor.retired,
      }),
    });
    const data = (await res.json()) as { error?: unknown };
    if (!res.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Save failed");
      return;
    }
    toast.success("Saved");
    setSelected(null);
    await refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Questions</CardTitle>
            <div className="text-muted-foreground mt-1 text-sm">Filter and edit.</div>
          </div>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void refresh()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label>Category filter</Label>
            <div className="flex gap-2">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Sports" />
              <Button type="button" onClick={() => void refresh()}>
                Apply
              </Button>
            </div>
          </div>

          <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
            {questions.map((q) => (
              <button
                key={q.id}
                type="button"
                className="hover:bg-muted/50 w-full rounded-md border p-3 text-left"
                onClick={() => setSelected(q)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-medium">{q.body}</div>
                  <div className="flex shrink-0 gap-2">
                    <Badge variant="secondary">d{q.difficulty}</Badge>
                    {q.vetted ? <Badge>Vetted</Badge> : <Badge variant="outline">Unvetted</Badge>}
                  </div>
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {q.category} · {q.subcategory}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editor</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!editor ? (
            <div className="text-muted-foreground text-sm">Select a question.</div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label>Body</Label>
                <Textarea value={editor.body} onChange={(e) => setSelected({ ...editor, body: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Correct answer</Label>
                <Input
                  value={editor.correctAnswer}
                  onChange={(e) => setSelected({ ...editor, correctAnswer: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Wrong answers (one per line, exactly 3)</Label>
                <Textarea
                  value={(editor.wrongAnswers ?? []).join("\n")}
                  onChange={(e) =>
                    setSelected({
                      ...editor,
                      wrongAnswers: e.target.value.split("\n").map((s) => s.trim()),
                    })
                  }
                  rows={4}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Input value={editor.category} onChange={(e) => setSelected({ ...editor, category: e.target.value })} />
                </div>
                <div className="grid gap-2">
                  <Label>Subcategory</Label>
                  <Input
                    value={editor.subcategory}
                    onChange={(e) => setSelected({ ...editor, subcategory: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Difficulty (1-3)</Label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  value={editor.difficulty}
                  onChange={(e) => setSelected({ ...editor, difficulty: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={editor.vetted} onCheckedChange={(v) => setSelected({ ...editor, vetted: v })} />
                  <span className="text-sm">Vetted</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editor.retired} onCheckedChange={(v) => setSelected({ ...editor, retired: v })} />
                  <span className="text-sm">Retired</span>
                </div>
              </div>
              <Button type="button" onClick={() => void save()}>
                Save
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
