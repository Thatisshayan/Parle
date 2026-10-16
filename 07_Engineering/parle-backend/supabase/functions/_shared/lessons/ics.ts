/** Calendar invites (RFC 5545) in UTC, so each person's calendar shows the lesson in their own local time. */
export type IcsEvent = {
  uid: string; sequence: number; method: "REQUEST" | "CANCEL"; startIso: string; endIso: string; summary: string;
  description: string; location: string; organizerEmail: string; attendeeEmail: string; now: string;
};

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join("\r\n");
}

export function lessonIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Parle//Lessons//EN", "CALSCALE:GREGORIAN", `METHOD:${e.method}`,
    "BEGIN:VEVENT", `UID:${e.uid}`, `SEQUENCE:${e.sequence}`, `DTSTAMP:${stamp(e.now)}`,
    `DTSTART:${stamp(e.startIso)}`, `DTEND:${stamp(e.endIso)}`,
    `SUMMARY:${escapeText(e.summary)}`, `DESCRIPTION:${escapeText(e.description)}`,
    ...(e.location ? [`LOCATION:${escapeText(e.location)}`, `URL:${e.location}`] : []),
    `ORGANIZER;CN=Parle:mailto:${e.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${e.attendeeEmail}`,
    `STATUS:${e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
