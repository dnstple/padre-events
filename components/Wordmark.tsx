import { eventConfig } from "@/config/event";

import styles from "./Wordmark.module.css";

/**
 * PADRE65 wordmark.
 *
 * When `brandmark.src` is set in config/event.ts, the logo file is used as a
 * CSS mask and painted with the surrounding text colour. That means one
 * single-colour asset works everywhere — white on the invitation's photograph,
 * near-black on the admin bar — with no second file and no inverted filter.
 *
 * With no asset configured it falls back to a typographic lockup set in
 * Petrona, the heading family padre65.com declares, so the mark is never
 * missing.
 */
export default function Wordmark({
  className,
  label = "Padre65",
}: {
  className?: string;
  /** Accessible name. Pass "" when an adjacent heading already says it. */
  label?: string;
}) {
  const { brandmark } = eventConfig;

  if (brandmark.src) {
    return (
      <span className={[styles.wordmark, className].filter(Boolean).join(" ")}>
        <span
          aria-hidden="true"
          className={styles.logo}
          style={
            {
              ["--logo-src"]: `url("${brandmark.src}")`,
              ["--logo-ratio"]: `${brandmark.width} / ${brandmark.height}`,
            } as React.CSSProperties
          }
        />
        {label ? <span className="visually-hidden">{label}</span> : null}
      </span>
    );
  }

  return (
    <span className={[styles.wordmark, className].filter(Boolean).join(" ")}>
      <span aria-hidden="true" className={styles.padre}>
        PADRE
      </span>
      <span aria-hidden="true" className={styles.sixtyfive}>
        65
      </span>
      {label ? <span className="visually-hidden">{label}</span> : null}
    </span>
  );
}
