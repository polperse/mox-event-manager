import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

type HostingConfig = { d1?: string; r2?: string };

async function loadHostingConfig(): Promise<HostingConfig> {
  try {
    const contents = await readFile(
      resolve(process.cwd(), ".openai/hosting.json"),
      "utf8",
    );
    return JSON.parse(contents) as HostingConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { d1: "DB" };
    }
    throw error;
  }
}

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const { d1 = "DB", r2 } = await loadHostingConfig();
  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    d1_databases: [
      {
        binding: d1,
        database_name: "mox-event-manager-local",
        database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
      },
    ],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
  };

  return {
    server: {
      host: "0.0.0.0",
      port: 5175,
      strictPort: true,
      allowedHosts: ["terminal.local"],
      watch: {
        // Cloudflare updates its local registry while the app runs. Watching it
        // makes Vite send full-reload events even though no source code changed.
        ignored: ["**/.wrangler/**", "**/.sites-runtime/**", "**/dist/**", "**/.next/**"],
        ...(isCodexSeatbeltSandbox ? { useFsEvents: false, usePolling: true } : {}),
      },
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
