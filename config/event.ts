/**
 * PADRE65 — EVENT CONFIGURATION
 * =============================================================================
 * This is the ONLY file you need to edit to change the invitation's content.
 * No component contains hard-coded event copy, dates, venues, links or media.
 *
 * HOW TO REPLACE THINGS
 * ---------------------
 * Event name / dates / venue ....... edit the fields directly below.
 * Hero image or video .............. replace /public/media/hero-desktop.jpg and
 *                                    /public/media/hero-mobile.jpg, or point
 *                                    `hero.desktop` / `hero.mobile` elsewhere.
 * Logo ............................. drop a single-colour SVG or transparent
 *                                    PNG into /public/media and set
 *                                    `brandmark.src` plus its dimensions.
 * Open Graph image ................. replace /public/media/og.png, or point
 *                                    `seo.image` somewhere else.
 * Make the page indexable .......... set `seo.noindex` to false.
 * Show the "Open in Maps" link ..... set `mapsUrl` to a real URL (empty string
 *                                    hides the link entirely).
 *
 * A change here propagates to the invitation, the metadata, the confirmation
 * screen and the admin dashboard.
 * =============================================================================
 */

/** A single piece of hero media. Set `src` to "" to use the typographic
 *  composition that ships as the fallback opening frame. */
export type HeroMedia = {
  /** "" = no asset; the built-in editorial composition is used instead. */
  src: string;
  /** "image" | "video". Video is always muted + playsinline + looped. */
  kind: "image" | "video";
  /** Poster frame for video. Ignored for images. Strongly recommended. */
  poster?: string;
  /** Alt text. Use "" only if the media is purely decorative. */
  alt: string;
  /** Intrinsic dimensions — required to prevent layout shift. */
  width: number;
  height: number;
};

/** The brand wordmark shown in the header, footer and admin bar. */
export type Brandmark = {
  /**
   * Path to a single-colour logo (SVG or transparent PNG). The asset is used
   * as a CSS mask and painted with the surrounding text colour, so one white
   * file works on both the dark invitation and the light admin bar.
   * Leave "" to fall back to the built-in typographic lockup.
   */
  src: string;
  /** Intrinsic dimensions, used to hold the aspect ratio. */
  width: number;
  height: number;
};

export type EventConfig = {
  slug: string;
  name: string;
  eyebrow: string;
  /** The opening frame's H1, split so the second half can take the italic
   *  accent. Rendered as "<lead> — <accent>". */
  title: { lead: string; accent: string };
  description: string;
  /** Machine-readable start, used for <time datetime>. */
  dateISO: string;
  dateDisplay: string;
  /** Short form used in the confirmation screen, e.g. "Thursday, 17 September". */
  dateShort: string;
  doorsTime: string;
  finishTime: string;
  venue: string;
  /** Street address. Leave "" to show the venue alone — useful when the exact
   *  address is shared closer to the date. */
  address: string;
  /** Leave "" to hide the "Open in Maps" link. */
  mapsUrl: string;
  dressCode: string;
  admissionText: string;
  hero: { desktop: HeroMedia; mobile: HeroMedia };
  brandmark: Brandmark;
  /** Button labels. The opening frame sends people down to the details; the
   *  reply section is where they actually respond. */
  labels: { heroCta: string; rsvpCta: string };
  footerStatement: string;
  instagramUrl: string;
  shopUrl: string;
  /** Hard cap on additional attendees. The server enforces this too. */
  maxAdditionalGuests: number;
  seo: {
    title: string;
    description: string;
    /** Path or absolute URL to the social sharing image. */
    image: string;
    /** true = <meta name="robots" content="noindex, nofollow">. */
    noindex: boolean;
  };
};

export const eventConfig: EventConfig = {
  slug: "house-party-2026",
  name: "PADRE65 — HOUSE PARTY",
  eyebrow: "PRIVATE EVENT · LONDON",
  title: { lead: "PADRE65", accent: "HOUSE PARTY" },
  description:
    "Join us for an evening of music, drinks and good vibes. A private gathering shaped around the people and stories behind Padre65.",

  dateISO: "2026-08-15T22:00:00+01:00",
  dateDisplay: "Saturday, 15 August",
  dateShort: "Saturday, 15 August",
  doorsTime: "10:00 PM",
  finishTime: "Late",

  venue: "Marylebone",
  address: "", // ← no street address yet; the venue shows on its own until set
  mapsUrl: "", // ← set a real Maps URL to reveal the "Open in Maps" link

  dressCode: "Come as you are.",
  admissionText: "Complimentary with RSVP.",

  hero: {
    // Replace the files in /public/media to change the opening frame. After
    // doing so, delete .next/cache/images and restart — Next caches optimised
    // variants by URL, so reusing a filename can serve the old picture.
    // Set both `src` to "" to fall back to the built-in typographic
    // composition instead of a photograph.
    desktop: {
      src: "/media/hero-desktop.jpg",
      kind: "image",
      alt: "",
      width: 1920,
      height: 1080,
    },
    mobile: {
      src: "/media/hero-mobile.jpg",
      kind: "image",
      alt: "",
      width: 1080,
      height: 1620,
    },
  },

  brandmark: {
    // Drop the logo into /public/media and point this at it.
    src: "",
    width: 2600,
    height: 521,
  },

  labels: { heroCta: "Details", rsvpCta: "RSVP" },

  footerStatement: "Created by friends and family",
  instagramUrl: "https://www.instagram.com/_padre65/",
  shopUrl: "https://padre65.com/",

  maxAdditionalGuests: 3,

  seo: {
    title: "PADRE65 — House Party",
    description: "A private evening with Padre65 in London.",
    image: "/media/og.png",
    noindex: true, // ← unlisted invitation. Set false to allow indexing.
  },
};

/** Total party size cap = the guest themselves + their additional attendees. */
export const MAX_PARTY_SIZE = eventConfig.maxAdditionalGuests + 1;

export default eventConfig;
