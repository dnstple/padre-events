"use client";

import { useEffect, useRef } from "react";

import type { HeroMedia } from "@/config/event";

import styles from "./Hero.module.css";

/**
 * Hero video.
 *
 * Muted, looped, playsinline, poster-backed. Autoplay is attempted but never
 * assumed — if the browser refuses, the poster remains and nothing breaks.
 * Users who prefer reduced motion get the poster frame only: the video is
 * paused and rewound rather than played silently in the background.
 */
export default function HeroVideo({ media }: { media: HeroMedia }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (query.matches) {
        video.pause();
        video.currentTime = 0;
      } else {
        // A rejected autoplay promise is expected on some browsers.
        void video.play().catch(() => undefined);
      }
    };

    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <video
      ref={ref}
      className={styles.image}
      poster={media.poster}
      width={media.width}
      height={media.height}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      aria-label={media.alt || undefined}
    >
      <source src={media.src} />
    </video>
  );
}
