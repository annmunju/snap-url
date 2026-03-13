import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/ko";

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.locale("ko");

function parseBackendUtc(isoDate: string) {
  const normalized = isoDate.includes("T") ? isoDate : isoDate.replace(" ", "T");
  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized);
  return hasTimezone ? dayjs(normalized) : dayjs.utc(`${normalized}Z`).local();
}

export function fromNow(isoDate: string): string {
  return parseBackendUtc(isoDate).fromNow();
}
