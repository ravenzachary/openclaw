/**
 * Billing API fetchers for each supported provider.
 * Each returns a normalized ProviderSpendResult.
 */

export type ProviderSpendResult = {
  provider: string;
  status: "ok" | "no_key" | "error" | "unsupported";
  totalCostUsd?: number;
  breakdown?: Array<{ label: string; costUsd: number }>;
  periodStart?: string;
  periodEnd?: string;
  error?: string;
  note?: string;
};

type DateRange = { start: Date; end: Date };

// --- OpenAI ---

async function fetchOpenAI(apiKey: string, range: DateRange): Promise<ProviderSpendResult> {
  const startTime = Math.floor(range.start.getTime() / 1000);
  const endTime = Math.floor(range.end.getTime() / 1000);
  const url = `https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}&group_by=line_item`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Admin keys required for the costs endpoint
    if (res.status === 403 || res.status === 401) {
      return {
        provider: "OpenAI",
        status: "error",
        error: `API returned ${res.status}. The /v1/organization/costs endpoint requires an admin API key.`,
        note: "Generate an admin key at https://platform.openai.com/api-keys",
      };
    }
    return {
      provider: "OpenAI",
      status: "error",
      error: `API returned ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  const json = (await res.json()) as {
    data?: Array<{
      results?: Array<{
        line_item?: string;
        amount?: { value?: number; currency?: string };
      }>;
    }>;
  };

  const buckets = json.data ?? [];
  const breakdown: Array<{ label: string; costUsd: number }> = [];
  let total = 0;

  for (const bucket of buckets) {
    for (const result of bucket.results ?? []) {
      const label = result.line_item ?? "other";
      // Amount is in cents, convert to dollars
      const costUsd = (result.amount?.value ?? 0) / 100;
      if (costUsd > 0) {
        breakdown.push({ label, costUsd });
        total += costUsd;
      }
    }
  }

  // Merge duplicate labels
  const merged = mergeBreakdown(breakdown);

  return {
    provider: "OpenAI",
    status: "ok",
    totalCostUsd: total,
    breakdown: merged,
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
  };
}

// --- Anthropic (no billing API) ---

function fetchAnthropic(): ProviderSpendResult {
  return {
    provider: "Anthropic",
    status: "unsupported",
    note: "Anthropic does not expose a billing API via standard API keys. View your usage at https://console.anthropic.com/settings/billing",
  };
}

// --- Google (no billing API) ---

function fetchGoogle(): ProviderSpendResult {
  return {
    provider: "Google",
    status: "unsupported",
    note: "Google does not expose a billing API via standard API keys. View your usage at https://aistudio.google.com/billing",
  };
}

// --- OpenRouter ---

async function fetchOpenRouter(apiKey: string, _range: DateRange): Promise<ProviderSpendResult> {
  // OpenRouter /api/v1/auth/key returns total lifetime usage for the key.
  // No date-range filtering is available from this endpoint.
  const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      provider: "OpenRouter",
      status: "error",
      error: `API returned ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  const json = (await res.json()) as {
    data?: {
      usage?: number;
      label?: string;
      limit?: number | null;
    };
  };

  const usage = json.data?.usage ?? 0;

  return {
    provider: "OpenRouter",
    status: "ok",
    totalCostUsd: usage,
    note: "Total lifetime usage for this API key (OpenRouter does not support date-range filtering).",
  };
}

// --- Orchestrator ---

type FetchAllParams = {
  keys: Record<string, string | undefined>;
  range: DateRange;
};

export async function fetchAllProviders(params: FetchAllParams): Promise<ProviderSpendResult[]> {
  const { keys, range } = params;

  const tasks: Array<Promise<ProviderSpendResult> | ProviderSpendResult> = [];

  // OpenAI
  if (keys.openai) {
    tasks.push(
      fetchOpenAI(keys.openai, range).catch((err) => ({
        provider: "OpenAI",
        status: "error" as const,
        error: String(err),
      })),
    );
  } else {
    tasks.push({
      provider: "OpenAI",
      status: "no_key",
      note: "No OpenAI API key configured.",
    });
  }

  // Anthropic (always unsupported)
  tasks.push(fetchAnthropic());

  // Google (always unsupported)
  tasks.push(fetchGoogle());

  // OpenRouter
  if (keys.openrouter) {
    tasks.push(
      fetchOpenRouter(keys.openrouter, range).catch((err) => ({
        provider: "OpenRouter",
        status: "error" as const,
        error: String(err),
      })),
    );
  } else {
    tasks.push({
      provider: "OpenRouter",
      status: "no_key",
      note: "No OpenRouter API key configured.",
    });
  }

  const results = await Promise.all(tasks);
  return results;
}

// --- Helpers ---

/** Parse a range string like "today", "7d", "30d" into a DateRange. */
export function parseDateRange(input?: string): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const raw = (input ?? "7d").trim().toLowerCase();

  if (raw === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  const match = raw.match(/^(\d+)d$/);
  if (match) {
    const days = parseInt(match[1], 10);
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  // "billing" or "month" — first of current month
  if (raw === "billing" || raw === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { start, end };
  }

  // Custom: try "YYYY-MM-DD..YYYY-MM-DD"
  const customMatch = raw.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (customMatch) {
    return {
      start: new Date(customMatch[1] + "T00:00:00"),
      end: new Date(customMatch[2] + "T23:59:59.999"),
    };
  }

  // Default to 7 days
  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function mergeBreakdown(
  items: Array<{ label: string; costUsd: number }>,
): Array<{ label: string; costUsd: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.label, (map.get(item.label) ?? 0) + item.costUsd);
  }
  return Array.from(map.entries())
    .map(([label, costUsd]) => ({ label, costUsd }))
    .sort((a, b) => b.costUsd - a.costUsd);
}
