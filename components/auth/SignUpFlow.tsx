"use client";

import { SignUp } from "@clerk/nextjs";
import { useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";

type Kind = "host" | "venue";

export function SignUpFlow(props: { defaultKind: Kind; inviteToken?: string }) {
  const [kind, setKind] = useState<Kind>(props.defaultKind);
  const [step, setStep] = useState<"form" | "clerk">("form");

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [venueBand, setVenueBand] = useState("3-5");
  const [hasHost, setHasHost] = useState(false);
  const [hostEmail, setHostEmail] = useState("");

  const unsafeMetadata = useMemo(
    () => ({
      account_type: kind,
      name: name.trim(),
      city: city.trim(),
      address: kind === "venue" ? address.trim() : "",
      has_host: kind === "venue" ? hasHost : false,
      host_email: kind === "venue" && hasHost ? hostEmail.trim().toLowerCase() : "",
      invite_token: props.inviteToken ?? "",
      venue_band: kind === "host" ? venueBand : "",
    }),
    [kind, name, city, address, hasHost, hostEmail, props.inviteToken, venueBand]
  );

  const canContinue =
    name.trim().length > 1 &&
    city.trim().length > 1 &&
    (kind === "host" || address.trim().length > 1) &&
    (!hasHost || hostEmail.includes("@"));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your trivia.box account</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          $50/month for hosts and venues. Same features, no tiers.
        </p>
      </div>

      {step === "form" ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>Account type</Label>
            <Select
              value={kind}
              onValueChange={(v) => v && setKind(v as Kind)}
              disabled={Boolean(props.inviteToken)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="venue">Venue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">{kind === "host" ? "Stage / host name" : "Venue name"}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </div>

          {kind === "venue" ? (
            <div className="grid gap-2">
              <Label htmlFor="address">Street address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          ) : null}

          {kind === "host" ? (
            <div className="grid gap-2">
              <Label>How many venues do you currently host at?</Label>
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
          ) : null}

          {kind === "venue" ? (
            <div className="flex flex-col gap-3 rounded-md border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">Do you already have a host?</div>
                  <div className="text-muted-foreground text-sm">
                    We will email them an invite link after you sign up.
                  </div>
                </div>
                <Switch checked={hasHost} onCheckedChange={setHasHost} />
              </div>
              {hasHost ? (
                <div className="grid gap-2">
                  <Label htmlFor="hostEmail">Host email</Label>
                  <Input
                    id="hostEmail"
                    type="email"
                    value={hostEmail}
                    onChange={(e) => setHostEmail(e.target.value)}
                    placeholder="host@example.com"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <Button type="button" disabled={!canContinue} onClick={() => setStep("clerk")}>
            Continue to email verification
          </Button>
        </div>
      ) : (
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          unsafeMetadata={unsafeMetadata}
          forceRedirectUrl="/dashboard"
        />
      )}
    </div>
  );
}
