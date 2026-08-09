import localFont from "next/font/local";

/**
 * Self-hosted typefaces.
 *
 * These are the two families the Padre65 lookbook uses (Cormorant Garamond +
 * Inter) plus Petrona, the heading family declared by padre65.com, used here
 * only for the wordmark.
 *
 * Self-hosted rather than fetched from Google at build time so that:
 *   - builds are deterministic and work offline / behind a proxy,
 *   - no third-party request is made from a visitor's browser,
 *   - there is no font-related layout shift.
 *
 * All three are variable, latin-subset woff2, cached forever.
 * Source: the SIL Open Font Licence releases distributed via @fontsource-variable.
 */

export const cormorant = localFont({
  src: [
    {
      path: "./CormorantGaramond-Variable.woff2",
      weight: "300 700",
      style: "normal",
    },
    {
      path: "./CormorantGaramond-VariableItalic.woff2",
      weight: "300 700",
      style: "italic",
    },
  ],
  display: "swap",
  variable: "--font-cormorant",
  fallback: ["Georgia", "Times New Roman", "serif"],
  // Tuned so the fallback occupies near-identical space during swap.
  adjustFontFallback: "Times New Roman",
});

export const inter = localFont({
  src: [{ path: "./Inter-Variable.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  variable: "--font-inter",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  adjustFontFallback: "Arial",
});

/**
 * Petrona carries only the wordmark and the decorative "65", so it is subset to
 * letters, digits and a little punctuation — 44 KB down to 16 KB — and left out
 * of the preload set. It is small type; a swap costs nothing, whereas competing
 * with the display face for bandwidth delays the headline.
 */
export const petrona = localFont({
  src: [{ path: "./Petrona-Wordmark.woff2", weight: "100 900", style: "normal" }],
  display: "swap",
  preload: false,
  variable: "--font-petrona",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const fontClassNames = `${cormorant.variable} ${inter.variable} ${petrona.variable}`;
