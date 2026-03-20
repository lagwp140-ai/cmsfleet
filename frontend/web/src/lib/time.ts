const DEFAULT_CONSOLE_LOCALE = "en-GB";

export function resolveConsoleLocale(_locale?: string | null): string {
  return DEFAULT_CONSOLE_LOCALE;
}

export function formatConsoleDateTime(timestamp: string | null | undefined, locale?: string | null): string {
  if (!timestamp) {
    return "Awaiting sync";
  }

  return new Date(timestamp).toLocaleString(resolveConsoleLocale(locale), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

export function formatConsoleClock(timestamp: string | null | undefined, locale?: string | null): string {
  if (!timestamp) {
    return "No fix";
  }

  return new Date(timestamp).toLocaleTimeString(resolveConsoleLocale(locale), {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatGtfsOffset(offsetSeconds: number | null | undefined): string {
  if (offsetSeconds === null || offsetSeconds === undefined || !Number.isFinite(offsetSeconds)) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.floor(offsetSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}



