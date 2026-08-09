/**
 * Safe Environment Variable Loader for OmniMonitor
 * Ensures server/client variables are safely accessed with descriptive fallbacks.
 */

export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  WS_ENDPOINT: process.env.NEXT_PUBLIC_WS_ENDPOINT || "ws://localhost:8080/telemetry",
  SIMULATOR_PORT: parseInt(process.env.NEXT_PUBLIC_SIMULATOR_PORT || "8080", 10),
  IS_PRODUCTION: process.env.NODE_ENV === "production",
};

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project-id.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder-project.supabase.co" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "your-anon-key-here" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "placeholder-anon-key"
);
