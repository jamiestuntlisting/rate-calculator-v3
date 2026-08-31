/**
 * Display dates are compact: "Thu 8/26", with the year added only when
 * it is not this year ("Thu 8/26/25"). The weekday is the point — a
 * performer knows their week by its days — and the full year on every
 * row was width spent saying nothing. Entry is untouched: setting a
 * date stays the platform's own date field; this is only for reading
 * one back.
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function shortDay(dateStr: string): string {
  const ymd = (dateStr || "").split("T")[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return dateStr;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const suffix =
    year === new Date().getFullYear() ? "" : `/${String(year).slice(2)}`;
  return `${weekday} ${month}/${day}${suffix}`;
}
