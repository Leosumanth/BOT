export function formatAddress(value?: string | null): string {
  if (!value) {
    return "Unknown";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatCount(value?: bigint | number | null): string {
  if (value === null || value === undefined) {
    return "0";
  }

  const raw = typeof value === "bigint" ? value.toString() : String(value);
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
