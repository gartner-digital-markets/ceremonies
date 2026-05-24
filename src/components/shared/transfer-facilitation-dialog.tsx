"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Participant {
  readonly id: string;
  readonly name: string;
}

interface TransferFacilitationDialogProps {
  readonly participants: ReadonlyArray<Participant>;
  readonly myId: string;
  readonly onTransfer: (targetId: string) => void;
  /** "primary" for estimation rooms, "coffee" for retro rooms */
  readonly accent?: "primary" | "coffee";
}

export function TransferFacilitationDialog({
  participants,
  myId,
  onTransfer,
  accent = "primary",
}: TransferFacilitationDialogProps) {
  const [open, setOpen] = useState(false);

  const others = participants.filter((p) => p.id !== myId);
  if (others.length === 0) return null;

  const accentClass =
    accent === "coffee"
      ? "text-coffee hover:text-coffee/80"
      : "text-primary hover:text-primary/80";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={`text-[10px] font-bold uppercase tracking-[0.12em] underline underline-offset-2 transition-colors ${accentClass}`}
      >
        Transfer
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display tracking-ceremony">
            Transfer Facilitation
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Choose who becomes the new facilitator. You can ask them to pass it
          back at any time.
        </p>
        <ul className="mt-2 space-y-2">
          {others.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border-2 border-border bg-card px-4 py-3 shadow-hard-sm"
            >
              <span className="text-sm font-bold">{p.name}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onTransfer(p.id);
                  setOpen(false);
                }}
              >
                Make facilitator
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
