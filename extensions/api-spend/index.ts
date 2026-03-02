/**
 * api-spend extension entry point.
 * Registers an HTTP handler for the dashboard + JSON API,
 * and a /spend chat command.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { TtlCache } from "./src/cache.js";
import { formatSpendText, rangeLabel } from "./src/format.js";
import { renderDashboardHtml } from "./src/html.js";
import { resolveApiKey } from "./src/key-resolver.js";
import { fetchAllProviders, parseDateRange, type ProviderSpendResult } from "./src/providers.js";

type ApiSpendPluginConfig = {
  cacheTtlMs?: number;
  openaiApiKey?: string;
  openrouterApiKey?: string;
};

const PLUGIN_PATH = "/plugins/api-spend";

export default function register(api: OpenClawPluginApi) {
  const pluginCfg = (api.pluginConfig ?? {}) as ApiSpendPluginConfig;
  const cache = new TtlCache<ProviderSpendResult[]>(pluginCfg.cacheTtlMs);

  function resolveKeys(): Record<string, string | undefined> {
    const modelProviders = api.config.models?.providers;
    const common = { pluginConfig: pluginCfg as Record<string, unknown>, modelProviders };
    return {
      openai: resolveApiKey({ provider: "openai", ...common }),
      openrouter: resolveApiKey({ provider: "openrouter", ...common }),
    };
  }

  async function getResults(rangeStr: string): Promise<ProviderSpendResult[]> {
    const range = parseDateRange(rangeStr);
    const cacheKey = `${range.start.toISOString()}:${range.end.toISOString()}`;

    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const keys = resolveKeys();
    const results = await fetchAllProviders({ keys, range });
    cache.set(cacheKey, results);
    return results;
  }

  // --- HTTP Handler ---

  api.registerHttpHandler(async (req, res) => {
    const url = req.url ?? "";

    // Dashboard HTML page
    if (url === PLUGIN_PATH || url === PLUGIN_PATH + "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderDashboardHtml());
      return true;
    }

    // JSON API endpoint
    if (url.startsWith(PLUGIN_PATH + "/api/usage")) {
      try {
        const parsed = new URL(url, "http://localhost");
        const rangeStr = parsed.searchParams.get("range") ?? "7d";
        const results = await getResults(rangeStr);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results, range: rangeStr }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return true;
    }

    return false;
  });

  // --- /spend Command ---

  api.registerCommand({
    name: "spend",
    description: "Show API billing summary across configured providers.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const rangeStr = ctx.args?.trim() || "7d";
      try {
        const results = await getResults(rangeStr);
        const label = rangeLabel(rangeStr);
        const text = formatSpendText(results, label);
        return { text };
      } catch (err) {
        return { text: `Failed to fetch spend data: ${String(err)}` };
      }
    },
  });

  api.logger.info?.("api-spend: registered dashboard at /plugins/api-spend/ and /spend command");
}
