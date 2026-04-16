"use client";

import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FlowStep = "path" | "form" | "clerk";

export function SignUpFlow(props: { inviteToken?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>(() => (props.inviteToken ? "form" : "path"));

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [venueBand, setVenueBand] = useState("3-5");

  const unsafeMetadata = useMemo(
    () => ({
      account_type: "host" as const,
      name: name.trim(),
      city: city.trim(),
      address: "",
      has_host: false,
      host_email: "",
      invite_token: props.inviteToken ?? "",
      venue_band: venueBand,
    }),
    [name, city, props.inviteToken, venueBand]
  );

  const canContinue = name.trim().length > 1 && city.trim().length > 1;

  return (
    <div className="flex flex-col gap-6">
      {step === "path" ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Get started</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Organizers run games with a subscription. Players only need a join code — no account.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" className="flex-1" onClick={() => setStep("form")}>
              Organize trivia nights
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={() => router.push("/join")}>
              I have a join code
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-foreground font-medium underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </>
      ) : null}

      {step === "form" ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {props.inviteToken ? "Complete your host invite" : "Create your organizer account"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {props.inviteToken
                ? "Tell us how to list you, then verify your email."
                : "$50/month for organizers. Same plan whether you work one room or many."}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Shown to teams and on the big screen"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
            </div>

            <div className="grid gap-2">
              <Label>How many locations do you run trivia at?</Label>
              <Select value={venueBand} onValueChange={(v) => v && setVenueBand(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-2">1–2</SelectItem>
                  <SelectItem value="3-5">3–5</SelectItem>
                  <SelectItem value="6-10">6–10</SelectItem>
                  <SelectItem value="10+">10+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {!props.inviteToken ? (
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setStep("path")}>
                  Back
                </Button>
              ) : null}
              <Button type="button" disabled={!canContinue} onClick={() => setStep("clerk")} className="sm:ml-auto">
                Continue to email verification
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {step === "clerk" ? (
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          unsafeMetadata={unsafeMetadata}
          forceRedirectUrl="/dashboard"
        />
      ) : null}
    </div>
  );
}
