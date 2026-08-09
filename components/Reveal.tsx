"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

import styles from "./Reveal.module.css";

type RevealVariant =
  | "mask" /* text mask reveal — the type slides out from under a clip */
  | "rule" /* fine-line drawing — a hairline scales in from the left */
  | "clip" /* media clip reveal — the image uncovers from the bottom */
  | "fade"; /* opacity only — the reduced-motion fallback for everything */

type RevealProps = {
  children?: ReactNode;
  variant?: RevealVariant;
  /** Stagger in milliseconds. Kept small; nothing should feel queued. */
  delay?: number;
  /** Render as something other than a div. */
  as?: ElementType;
  className?: string;
  /** Fraction of the element that must be visible before revealing. */
  threshold?: number;
  /**
   * For above-the-fold content. Skips the observer entirely and plays a pure
   * CSS entry animation from first paint, so the opening frame never waits for
   * hydration — and still renders with JavaScript disabled.
   */
  immediate?: boolean;
};

/**
 * The single motion primitive for the invitation.
 *
 * Everything animates once, on entry, and then stops. There is no scroll-linked
 * transform, no parallax on text, and no state that can leave content hidden:
 * if IntersectionObserver is unavailable, or the user prefers reduced motion,
 * the content is visible from the first paint.
 *
 * IMPORTANT — why clipping variants render an inner element:
 * a fully clipped element has an empty intersection rectangle, so
 * IntersectionObserver would never report it as visible and it could never
 * reveal itself. The observed element is therefore always unclipped; the
 * `clip-path` / `transform` lives on a child. `fade` needs no child, because
 * opacity does not affect intersection — which also keeps markup valid where a
 * wrapper element would not be (a <dl> row, for example).
 */
export default function Reveal({
  children,
  variant = "fade",
  delay = 0,
  as: Tag = "div",
  className,
  threshold = 0.15,
  immediate = false,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // `immediate` content animates from CSS alone — there is nothing to observe.
    if (immediate) return;

    const node = ref.current;
    if (!node) return;

    // The revealed state is a class on the DOM node rather than React state:
    // it is purely presentational and this way entry costs no re-render.
    const reveal = () => node.classList.add(styles.shown);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }

    // Already in view on load (the opening frame) — reveal immediately.
    if (node.getBoundingClientRect().top < window.innerHeight * 0.9) {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal();
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, immediate]);

  const style = delay
    ? ({ ["--reveal-delay"]: `${delay}ms` } as React.CSSProperties)
    : undefined;

  const outerClass = [
    styles.reveal,
    styles[`o_${variant}`],
    immediate ? styles.immediate : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // `data-reveal` is a stable hook (CSS Module class names are hashed) used by
  // the <noscript> fallback in app/layout.tsx.
  if (variant === "fade") {
    return (
      <Tag ref={ref} data-reveal="" className={outerClass} style={style}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag ref={ref} data-reveal="" className={outerClass} style={style}>
      <span className={styles[variant]}>{children}</span>
    </Tag>
  );
}
