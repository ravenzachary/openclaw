/**
 * Text formatting for the /spend chat command.
 */

import type { ProviderSpendResult } from "./providers.js";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatProviderLine(result: ProviderSpendResult): string {
  switch (result.status) {
    case "ok":
      return `  ${result.provider}: ${formatUsd(result.totalCostUsd ?? 0)}`;
    case "unsupported":
      return `  ${result.provider}: (not available via API)`;
    case "no_key":
      return `  ${result.provider}: (no API key configured)`;
    case "error":
      return `  ${result.provider}: (error: ${result.error ?? "unknown"})`;
  }
}

export function formatSpendText(results: ProviderSpendResult[], rangeLabel: string): string {
  const lines: string[] = [`API Spend (${rangeLabel}):`];

  for (const result of results) {
    lines.push(formatProviderLine(result));
  }

  const available = results
    .filter((r) => r.status === "ok")
    .reduce((sum, r) => sum + (r.totalCostUsd ?? 0), 0);

  const hasAny = results.some((r) => r.status === "ok");
  if (hasAny) {
    lines.push(`  Total (available): ${formatUsd(available)}`);
  }

  // Add notes for unsupported/error providers
  const notes = results.filter((r) => r.note);
  if (notes.length > 0) {
    lines.push("");
    for (const r of notes) {
      lines.push(`* ${r.provider}: ${r.note}`);
    }
  }

  return lines.join("\n");
}

/** Human-readable label for a range string. */
export function rangeLabel(input?: string): string {
  const raw = (input ?? "7d").trim().toLowerCase();
  if (raw === "today") return "today";
  const match = raw.match(/^(\d+)d$/);
  if (match) return `last ${match[1]} days`;
  if (raw === "billing" || raw === "month") return "current billing period";
  if (raw.includes("..")) return raw;
  return "last 7 days";
}
