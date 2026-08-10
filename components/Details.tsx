import { eventConfig } from "@/config/event";
import Reveal from "@/components/Reveal";

import styles from "./Details.module.css";

/**
 * EVENT DETAILS
 *
 * Typographic rows separated by hairline rules. No cards, no boxes, no icons.
 * Rendered inside the reply section rather than as a section of its own, so
 * the page stays to two screens.
 *
 * The "Open in Maps" link does not exist until `mapsUrl` holds a real value.
 */
export default function Details() {
  const rows: { term: string; value: React.ReactNode }[] = [
    {
      term: "Date",
      value: <time dateTime={eventConfig.dateISO}>{eventConfig.dateDisplay}</time>,
    },
    {
      term: "Time",
      value: `${eventConfig.doorsTime} — ${eventConfig.finishTime.toLowerCase()}`,
    },
    {
      term: "Venue",
      value: (
        // The link sits beside the address rather than beneath it, so the
        // venue row costs two lines instead of three. It wraps underneath on
        // its own only when the column is too narrow to hold both.
        <span className={styles.venueRow}>
          <span className={styles.venueText}>
            {eventConfig.venue}
            {eventConfig.address ? (
              <span className={styles.address}>{eventConfig.address}</span>
            ) : null}
          </span>
          {eventConfig.mapsUrl ? (
            <a
              className={styles.mapsLink}
              href={eventConfig.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Maps
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          ) : null}
        </span>
      ),
    },
    { term: "Dress", value: eventConfig.dressCode },
    { term: "Admission", value: eventConfig.admissionText },
  ];

  return (
    <dl className={styles.list}>
      {rows.map((row, i) => (
        <Reveal key={row.term} variant="fade" delay={i * 40} className={styles.row} threshold={0.05}>
          <dt className={styles.term}>{row.term}</dt>
          <dd className={styles.value}>{row.value}</dd>
        </Reveal>
      ))}
    </dl>
  );
}
