export function sourceName(url: string) {
  const host = safeHost(url);
  if (!host) return "News";
  if (host.includes("metal")) return "Metal.com";
  if (host.includes("reuters")) return "Reuters";
  if (host.includes("nasdaq")) return "Nasdaq";
  if (host.includes("afr")) return "AFR";
  if (host.includes("rnz")) return "RNZ";
  return host.replace(/^www\./, "").split(".")[0] || "News";
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
