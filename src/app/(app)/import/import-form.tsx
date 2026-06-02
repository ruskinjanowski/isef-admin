"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Mirrors ImportReport from src/lib/candidates/import.ts (kept local so the
// client bundle doesn't pull in the server-only import module).
type ImportReport = {
  totalRows: number;
  skippedNoEmail: number;
  duplicatesDropped: number;
  uniqueCandidates: number;
  inserted: number;
  updated: number;
};

const SUMMARY_ROWS: { label: string; key: keyof ImportReport }[] = [
  { label: "Rows read", key: "totalRows" },
  { label: "Skipped (no email)", key: "skippedNoEmail" },
  { label: "Duplicate submissions dropped", key: "duplicatesDropped" },
  { label: "Unique candidates", key: "uniqueCandidates" },
  { label: "Inserted", key: "inserted" },
  { label: "Updated", key: "updated" },
];

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setPending(true);
    setReport(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/import/candidates", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Import failed.");
      }
      setReport(json.report as ImportReport);
      toast.success(
        `Imported ${json.report.uniqueCandidates} candidates ` +
          `(${json.report.inserted} new, ${json.report.updated} updated).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import candidates from CSV</CardTitle>
          <CardDescription>
            Upload the Google Form responses export. Candidates are matched by
            email — resubmissions collapse to the latest, and existing pipeline
            status and notes are left untouched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv">CSV file</Label>
              <Input
                id="csv"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={pending}
              />
            </div>
            <Button type="submit" disabled={!file || pending}>
              <Upload className="size-4" />
              {pending ? "Importing…" : "Import"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
            <CardDescription>Summary of the last run.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {SUMMARY_ROWS.map(({ label, key }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium tabular-nums">{report[key]}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
