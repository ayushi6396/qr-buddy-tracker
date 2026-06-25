export function generateDeviceCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DEV-${year}-${rand}`;
}

export function deviceUrl(deviceId: string): string {
  if (typeof window === "undefined") return `/devices/${deviceId}`;
  return `${window.location.origin}/devices/${deviceId}`;
}
