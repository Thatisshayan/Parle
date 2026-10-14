export type AdminMetricsPresetDays = 7 | 30 | 90;

export interface AdminMetricsCalendarRange {
  startDate: string;
  endDate: string;
}

function localDateParts(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Return an inclusive, local-calendar preset range ending today. */
export function adminMetricsPresetRange(days: AdminMetricsPresetDays, now = new Date()): AdminMetricsCalendarRange {
  const end = new Date(now.getTime());
  end.setHours(12, 0, 0, 0);
  const start = new Date(end.getTime());
  start.setDate(start.getDate() - (days - 1));
  return { startDate: localDateParts(start), endDate: localDateParts(end) };
}

/** Keep invalid and reversed custom ranges out of the request while the server validates again. */
export function adminMetricsCalendarRangeIsValid(startDate: string, endDate: string): boolean {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  };
  return validDate(startDate) && validDate(endDate) && startDate <= endDate;
}
