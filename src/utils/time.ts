export function formatRelativeTime(pubDate: string | null | undefined): string {
  if (!pubDate) return 'Unknown time';

  // NewsData often returns "YYYY-MM-DD HH:mm:ss" in UTC without a Z suffix
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(pubDate.trim())
    ? `${pubDate.trim().replace(' ', 'T')}Z`
    : pubDate.trim();

  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) return pubDate;

  const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absSeconds < 60) {
    return rtf.format(diffSeconds, 'second');
  }
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(diffMinutes, 'minute');
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, 'hour');
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day');
  }
  const diffMonths = Math.round(diffDays / 30);
  return rtf.format(diffMonths, 'month');
}

export function isSafeHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
