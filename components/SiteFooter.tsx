import { eventConfig } from "@/config/event";
import Reveal from "@/components/Reveal";
import Wordmark from "@/components/Wordmark";

import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  const year = new Date(eventConfig.dateISO).getFullYear();

  return (
    <footer className={styles.footer} data-surface="dark">
      <div className={styles.inner}>
        <Reveal variant="mask" as="p" className={styles.statement}>
          {eventConfig.footerStatement}
        </Reveal>

        <div className={styles.row}>
          <Wordmark className={styles.mark} label="Padre65" />

          <nav className={styles.links} aria-label="Padre65">
            <a
              className={styles.link}
              href={eventConfig.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
            <a
              className={styles.link}
              href={eventConfig.shopUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Shop
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </nav>

          <p className={styles.legal}>© {year} Padre65 — All rights reserved</p>
        </div>
      </div>
    </footer>
  );
}
