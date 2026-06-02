"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Mirrors RACE_OPTIONS from src/lib/screening (kept local so the client bundle
// doesn't pull in the server-only module).
const RACE_OPTIONS = ["white", "coloured", "indian", "black", "other"] as const;
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Mirrors Screening from src/lib/screening (kept local so the client bundle
// doesn't pull in the server-only module).
type Screening = {
  appearance: number | null;
  race: string | null;
  notes: string | null;
  manualAdjustment: number | null;
  updatedAt: string | null;
};

export function ScreeningForm({
  candidateId,
  initial,
}: {
  candidateId: string;
  initial: Screening;
}) {
  // Form fields are strings (empty = unset); coerced server-side on save.
  const [appearance, setAppearance] = useState(
    initial.appearance?.toString() ?? "",
  );
  const [race, setRace] = useState(initial.race ?? "");
  const [manualAdjustment, setManualAdjustment] = useState(
    initial.manualAdjustment?.toString() ?? "",
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState(initial.updatedAt);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch(`/api/screening/${candidateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appearance: appearance === "" ? null : Number(appearance),
          race,
          notes,
          manualAdjustment:
            manualAdjustment === "" ? null : Number(manualAdjustment),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save screening.");
      }
      setSavedAt((json.screening as Screening).updatedAt);
      toast.success("Screening saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Screening</CardTitle>
        <CardDescription>
          Reviewer fields. Saved separately from the registration data; the tier
          recalculates automatically on save.
          {savedAt && (
            <> Last saved {new Date(savedAt).toLocaleString("en-US")}.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appearance">Appearance score (1–10)</Label>
              <Input
                id="appearance"
                type="number"
                min={1}
                max={10}
                step={1}
                value={appearance}
                onChange={(e) => setAppearance(e.target.value)}
                disabled={pending}
                placeholder="—"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="race">Race</Label>
              <Select
                id="race"
                value={race}
                onChange={(e) => setRace(e.target.value)}
                disabled={pending}
              >
                <option value="">—</option>
                {RACE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualAdjustment">Manual adjustment (±)</Label>
              <Input
                id="manualAdjustment"
                type="number"
                min={-100}
                max={100}
                step={1}
                value={manualAdjustment}
                onChange={(e) => setManualAdjustment(e.target.value)}
                disabled={pending}
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Reasoning for manual adjustment</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={4}
              placeholder="Why the tier score was nudged up or down."
            />
          </div>
          <Button type="submit" disabled={pending}>
            <Save className="size-4" />
            {pending ? "Saving…" : "Save screening"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
