// Registry of our Meta-approved templates — the single source of truth for what
// this app can send and how each template's positional variables ({{1}}, {{2}},
// …) are filled from a candidate. The UI picks a template by key; messages.ts
// asks this registry to resolve the params for a given candidate at send time.
//
// A template here MUST match an APPROVED template on the WABA exactly (name +
// language + variable count). If Meta requires edits during review, update the
// matching entry's `name`/`languageCode`/`bodyTemplate` to match what cleared.
//
// No Meta API calls and no DB here — this is pure mapping. See CLAUDE.md.

import { type CandidateView } from "@/lib/candidates/view";
import { type TemplateParam } from "./types";

export type WaTemplate = {
  /** Stable app-side key used by the UI and stored in `wa_messages.template_name`. */
  key: string;
  /** Approved template name on the WABA (often equal to `key`). */
  name: string;
  /** BCP-47 language code the template was approved under, e.g. "en". */
  languageCode: string;
  /** Meta billing category — Utility is cheaper than Marketing. */
  category: "utility" | "marketing";
  /** Short label for the UI template picker. */
  label: string;
  /**
   * The approved body copy with `{{1}}`, `{{2}}`, … placeholders. Used to render
   * a human-readable preview/log body — NOT sent to Meta (Meta renders from the
   * approved template by name; we only send the resolved params).
   */
  bodyTemplate: string;
  /** Resolve positional body params for one candidate, in `{{1}}`, `{{2}}`, … order. */
  resolveParams: (c: CandidateView) => TemplateParam[];
};

// ── The registry ─────────────────────────────────────────────────────────────
//
// `welcome` is pending Meta review (see CLAUDE.md "Next steps"). Submit a Utility
// template named `welcome` in language `en` whose body matches `bodyTemplate`
// below; once APPROVED this entry sends as-is. Adjust to match if review edits it.

export const WA_TEMPLATES: WaTemplate[] = [
  {
    key: "welcome",
    // Exact WABA template name (verified 2026-06-25 via
    // scripts/wa-list-templates.ts). Submitted as Utility but Meta re-categorised
    // it Marketing (the copy is promotional/relational — accepted as-is). As of
    // 2026-06-25 it is still PENDING review, so sends will fail until it's
    // APPROVED — re-run the list script to check status.
    name: "isef_registration_welcome",
    languageCode: "en",
    category: "marketing",
    label: "Welcome to ISEF",
    // No variables — the approved copy greets with a generic "Hi there!" (adding
    // a {{1}} first-name variable later means resubmitting for approval).
    bodyTemplate:
      "✨ Welcome to ISEF!\n\nHi there! 👋\n\nThank you for registering with us. We're so excited to be part of your international teaching journey!\n\nYour profile has been successfully created and added to our recruitment database, and our team will begin sharing it with our partner schools for suitable opportunities.\n\nIf a school would like to move forward with your application, we'll send you an interview invitation with all the details via email or WhatsApp.\n\nIn the meantime, if you have any questions you're always welcome to send us a WhatsApp message, we're happy to help!\n\nThank you for choosing ISEF. We can't wait to help you take the next step in your teaching career. 🌍",
    resolveParams: () => [],
  },
  {
    // Meta's onboarding test template — APPROVED on the WABA and (unlike
    // hello_world) sendable from our production number. Kept here so the whole
    // pipeline can be verified end-to-end before the real welcome clears review.
    // Remove once `welcome` is approved and tested. No variables.
    key: "test",
    name: "3p_direct_integration_test_template",
    languageCode: "en_US",
    category: "utility",
    label: "Onboarding test message",
    bodyTemplate:
      "Welcome! This is a test message from the WhatsApp Business Platform. You have successfully configured your WhatsApp Business account and completed onboarding. You can now start sending messages to your customers.",
    resolveParams: () => [],
  },
];

/** Look up a template by its app-side key, or undefined if unknown. */
export function getTemplate(key: string): WaTemplate | undefined {
  return WA_TEMPLATES.find((t) => t.key === key);
}

/**
 * Render the human-readable body for a candidate by substituting the resolved
 * params into the template's placeholders — for UI preview and the message log.
 */
export function renderBody(template: WaTemplate, c: CandidateView): string {
  const params = template.resolveParams(c);
  return template.bodyTemplate.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const param = params[Number(n) - 1];
    return param ? param.text : `{{${n}}}`;
  });
}
