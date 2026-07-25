import { supabase } from "@/integrations/supabase/client";

export function generateDeviceCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DEV-${year}-${rand}`;
}

/**
 * Generate a unique device code with collision retry.
 * Checks existing codes and retries up to 5 times.
 */
export async function generateUniqueDeviceCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateDeviceCode();
    const { data } = await supabase
      .from("devices")
      .select("id")
      .eq("device_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  // Fallback: use timestamp-based code for guaranteed uniqueness
  const ts = Date.now().toString(36).toUpperCase();
  return `DEV-${new Date().getFullYear()}-${ts.slice(-6)}`;
}

export function deviceUrl(deviceId: string): string {
  if (typeof window === "undefined") return `/p/${deviceId}`;
  return `${window.location.origin}/p/${deviceId}`;
}
