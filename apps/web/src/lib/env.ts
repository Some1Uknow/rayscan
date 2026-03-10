const LOCAL_API_URL = "http://127.0.0.1:8080";
const LOCAL_SITE_URL = "http://127.0.0.1:3000";

function normalizeUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? normalizeUrl(value) : undefined;
}

function shouldRequireExplicitProdEnv(): boolean {
  return process.env.NODE_ENV === "production" && (process.env.VERCEL === "1" || process.env.CI === "true");
}

export function getPublicApiUrl(): string {
  const configured = readEnv("NEXT_PUBLIC_API_URL");
  if (configured) return configured;

  if (!shouldRequireExplicitProdEnv()) {
    return LOCAL_API_URL;
  }

  throw new Error("NEXT_PUBLIC_API_URL is required in production");
}

export function getServerApiUrl(): string {
  const internal = readEnv("API_INTERNAL_URL");
  if (internal) return internal;
  return getPublicApiUrl();
}

export function getSiteUrl(): string | undefined {
  const configured = readEnv("NEXT_PUBLIC_SITE_URL");
  if (configured) return configured;

  const vercelUrl = readEnv("VERCEL_URL");
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  if (!shouldRequireExplicitProdEnv()) {
    return LOCAL_SITE_URL;
  }

  return undefined;
}

export function getSolanaCluster(): string {
  return readEnv("NEXT_PUBLIC_SOLANA_CLUSTER") ?? "mainnet-beta";
}
