"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { VenueProfileDialog } from "@/components/dashboard/venue/VenueProfileDialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tiny client trigger that opens the existing VenueProfileDialog in-place on
 * the stats mirror page. Server components can't hold the open/closed state
 * themselves, so we extract just this shell and reload on save to pick up
 * new copy/address in the surrounding server-rendered hero.
 */
export function EditVenueTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
        )}
      >
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit venue
      </button>
      <VenueProfileDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={() => {
          window.location.reload();
        }}
      />
    </>
  );
}
