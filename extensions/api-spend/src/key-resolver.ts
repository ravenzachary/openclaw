/**
 * Resolves API keys for billing lookups.
 * Priority: plugin config override -> auth-profiles.json -> env var fallback -> models.providers config.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type ProviderKeySpec = {
  /** Key in plugin config (e.g. "openaiApiKey") */
  configKey: string;
  /** Provider ID used in auth-profiles.json (e.g. "openai") */
  providerId: string;
  /** Base URL substring to match in models.providers */
  baseUrlMatch?: string;
  /** Environment variable fallback */
  envVar: string;
};

const PROVIDER_KEY_SPECS: Record<string, ProviderKeySpec> = {
  openai: {
    configKey: "openaiApiKey",
    providerId: "openai",
    baseUrlMatch: "api.openai.com",
    envVar: "OPENAI_API_KEY",
  },
  openrouter: {
    configKey: "openrouterApiKey",
    providerId: "openrouter",
    baseUrlMatch: "openrouter.ai",
    envVar: "OPENROUTER_API_KEY",
  },
};

type AuthProfileEntry = {
  type: string;
  provider: string;
  key?: string;
  token?: string;
  access?: string;
};

type AuthProfileStore = {
  profiles: Record<string, AuthProfileEntry>;
};

type ResolveKeyParams = {
  provider: string;
  pluginConfig: Record<string, unknown>;
  modelProviders?: Record<string, { baseUrl: string; apiKey?: string }>;
};

/** Resolves the auth-profiles.json path (mirrors core logic). */
function resolveAuthStorePath(): string {
  const override =
    process.env.OPENCLAW_AGENT_DIR?.trim() || process.env.PI_CODING_AGENT_DIR?.trim();
  if (override) {
    const dir = override.startsWith("~") ? override.replace("~", os.homedir()) : override;
    return path.join(dir, "auth-profiles.json");
  }
  const stateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    process.env.PI_AI_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "agents", "main", "agent", "auth-profiles.json");
}

/** Reads auth-profiles.json and finds a key for the given provider. */
function resolveKeyFromAuthStore(providerId: string): string | undefined {
  const storePath = resolveAuthStorePath();
  let raw: string;
  try {
    raw = fs.readFileSync(storePath, "utf-8");
  } catch {
    return undefined;
  }

  let store: AuthProfileStore;
  try {
    store = JSON.parse(raw) as AuthProfileStore;
  } catch {
    return undefined;
  }

  if (!store.profiles || typeof store.profiles !== "object") return undefined;

  // Look for any profile matching this provider
  for (const entry of Object.values(store.profiles)) {
    if (entry.provider !== providerId) continue;
    // api_key type -> key field
    if (entry.type === "api_key" && entry.key) return entry.key;
    // token type -> token field
    if (entry.type === "token" && entry.token) return entry.token;
    // oauth type -> access token
    if (entry.type === "oauth" && entry.access) return entry.access;
  }
  return undefined;
}

/**
 * Resolves an API key for the given provider. Returns undefined if no key found.
 * Checks: plugin config override -> auth-profiles.json -> env var -> models.providers config.
 */
export function resolveApiKey(params: ResolveKeyParams): string | undefined {
  const { provider, pluginConfig, modelProviders } = params;
  const spec = PROVIDER_KEY_SPECS[provider];
  if (!spec) return undefined;

  // 1. Plugin config override
  const configOverride = pluginConfig[spec.configKey];
  if (typeof configOverride === "string" && configOverride.trim()) {
    return resolveEnvRef(configOverride.trim());
  }

  // 2. Auth profile store (auth-profiles.json) — where keys actually live
  const authKey = resolveKeyFromAuthStore(spec.providerId);
  if (authKey) return authKey;

  // 3. Env var fallback
  const envVal = process.env[spec.envVar];
  if (envVal?.trim()) return envVal.trim();

  // 4. models.providers config (least common for real keys)
  if (modelProviders) {
    for (const [key, entry] of Object.entries(modelProviders)) {
      const matches =
        key.toLowerCase() === spec.providerId ||
        (spec.baseUrlMatch && entry?.baseUrl?.includes(spec.baseUrlMatch));
      if (matches && entry?.apiKey) {
        return resolveEnvRef(entry.apiKey);
      }
    }
  }

  return undefined;
}

/** If value looks like an env var name (e.g. "OPENAI_API_KEY"), resolve from process.env. */
function resolveEnvRef(value: string): string | undefined {
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) {
    return process.env[value]?.trim() || undefined;
  }
  return value;
}
