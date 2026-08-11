import { getImageProps } from "next/image";

import { eventConfig } from "@/config/event";
import HeroVideo from "@/components/HeroVideo";
import Reveal from "@/components/Reveal";
import Wordmark from "@/components/Wordmark";

import styles from "./Hero.module.css";

/**
 * THE INVITATION — a single full-viewport screen.
 *
 * Everything a guest needs before replying: who, what, when, where, and one
 * unmistakable way to answer. The RSVP button scrolls to the reply section
 * directly below; nothing else on this screen competes with it.
 *
 * With `hero.desktop.src` / `hero.mobile.src` set (the default), a photograph
 * fills the frame. Clear both and the built-in near-black typographic
 * composition takes over instead, so a missing file never breaks the page.
 */
export default function Hero() {
  const { hero } = eventConfig;
  const hasDesktop = Boolean(hero.desktop.src);
  const hasMobile = Boolean(hero.mobile.src);
  const hasMedia = hasDesktop || hasMobile;
  const hasVideo =
    (hasDesktop && hero.desktop.kind === "video") ||
    (hasMobile && hero.mobile.kind === "video");

  const imageProps = (media: typeof hero.desktop) =>
    getImageProps({
      src: media.src,
      alt: media.alt || "",
      width: media.width,
      height: media.height,
      priority: true,
      quality: 74, // the veil hides fine detail; this halves the bytes
      sizes: "100vw",
    }).props;

  const desktopImg = hasDesktop && hero.desktop.kind === "image" ? imageProps(hero.desktop) : null;
  const mobileImg = hasMobile && hero.mobile.kind === "image" ? imageProps(hero.mobile) : null;
  // The <img> fallback is the mobile crop when there is one — mobile-first.
  const primaryImg = mobileImg ?? desktopImg;

  return (
    <section className={styles.hero} data-surface="dark" aria-labelledby="invitation-title">
      {/* ---- Media layer ----------------------------------------------------
          A <picture> with getImageProps rather than two <Image> elements: two
          priority images would each get a preload link and BOTH would be
          downloaded, even though CSS hides one. This way the browser picks the
          desktop or the mobile crop and fetches exactly that one. */}
      <div className={styles.media} aria-hidden={hasMedia ? undefined : "true"}>
        {hasMedia && !hasVideo ? (
          <picture className={styles.layer}>
            {hasDesktop ? (
              <source
                media="(min-width: 48rem)"
                srcSet={desktopImg?.srcSet}
                sizes="100vw"
                type={undefined}
              />
            ) : null}
            <img
              {...(primaryImg ?? {})}
              alt={(hasMobile ? hero.mobile.alt : hero.desktop.alt) || ""}
              className={styles.image}
            />
          </picture>
        ) : null}

        {hasVideo ? (
          <>
            {hasMobile && hero.mobile.kind === "video" ? (
              <div className={`${styles.layer} ${hasDesktop ? styles.mobileOnly : ""}`}>
                <HeroVideo media={hero.mobile} />
              </div>
            ) : null}
            {hasDesktop && hero.desktop.kind === "video" ? (
              <div className={`${styles.layer} ${hasMobile ? styles.desktopOnly : ""}`}>
                <HeroVideo media={hero.desktop} />
              </div>
            ) : null}
          </>
        ) : null}

        {/* Legibility veils live on the text blocks — see Hero.module.css. */}
        {hasMedia ? <div className={styles.scrim} /> : null}
      </div>

      {/* ---- Typographic composition, used only when there is no media ------ */}
      {!hasMedia ? (
        <div className={styles.composition} aria-hidden="true">
          <span className={styles.driftMark}>65</span>
          <span className={styles.hairlineV} />
          <span className={styles.hairlineR} />
          <span className={styles.grain} />
        </div>
      ) : null}

      {/* ---- Content -------------------------------------------------------- */}
      <div className={styles.frame}>
        <header className={styles.top}>
          <Reveal variant="fade" as="span" immediate>
            <Wordmark className={styles.mark} label="Padre65" />
          </Reveal>
          <Reveal variant="fade" delay={80} as="p" className={styles.eyebrow} immediate>
            {eventConfig.eyebrow}
          </Reveal>
        </header>

        {/* Deliberately empty: the sky is the brightest part of the frame and
            the composition's negative space. Nothing is set over it. */}
        <div className={styles.breathe} aria-hidden="true" />

        <footer className={styles.bottom}>
          <h1 id="invitation-title" className={styles.title}>
            <Reveal variant="mask" as="span" className={styles.titleLine} immediate>
              {eventConfig.title.lead}
            </Reveal>
            <Reveal variant="mask" delay={120} as="span" className={styles.titleLine} immediate>
              <span className={styles.dash} aria-hidden="true">
                —
              </span>
              <span className={styles.accent}>{eventConfig.title.accent}</span>
            </Reveal>
          </h1>

          <Reveal variant="fade" delay={240} as="p" className={styles.standfirst} immediate>
            {eventConfig.description}
          </Reveal>

          <Reveal variant="rule" delay={300} as="span" className={styles.rule} immediate />

          <div className={styles.metaRow}>
            <div className={styles.meta}>
              <Reveal variant="fade" delay={340} as="p" className={styles.metaItem} immediate>
                <time dateTime={eventConfig.dateISO}>{eventConfig.dateDisplay}</time>
              </Reveal>
              <Reveal variant="fade" delay={380} as="p" className={styles.metaItem} immediate>
                {/* Each half stays whole, so a long venue name wraps between
                    them rather than orphaning "PM" on its own line. */}
                <span className={styles.nowrap}>{eventConfig.venueShort}</span>{" · "}
                <span className={styles.nowrap}>{eventConfig.doorsTime}</span>
              </Reveal>
            </div>

            <Reveal variant="fade" delay={420} as="div" className={styles.actions} immediate>
              <a href="#rsvp" className={styles.cta}>
                {eventConfig.labels.heroCta}
              </a>
            </Reveal>
          </div>

          <a className={styles.scroll} href="#rsvp">
            <span className={styles.scrollLabel}>Scroll</span>
            <span className={styles.scrollLine} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </section>
  );
}
