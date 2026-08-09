import type { Metadata, Viewport } from "next";

import { eventConfig } from "@/config/event";

import { fontClassNames } from "./fonts";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://events.padre65.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: eventConfig.seo.title,
  description: eventConfig.seo.description,
  alternates: { canonical: "/" },
  // Unlisted invitation by default. Flip eventConfig.seo.noindex to change.
  robots: eventConfig.seo.noindex
    ? { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }
    : { index: true, follow: true },
  openGraph: {
    type: "website",
    title: eventConfig.seo.title,
    description: eventConfig.seo.description,
    url: siteUrl,
    siteName: "Padre65",
    locale: "en_GB",
    images: [{ url: eventConfig.seo.image, width: 1200, height: 630, alt: eventConfig.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: eventConfig.seo.title,
    description: eventConfig.seo.description,
    images: [eventConfig.seo.image],
  },
  icons: {
    // The mark is painted on the brand's bone background rather than left
    // transparent: the red measures 1.6:1 against a dark browser tab strip,
    // which is invisible, and 6.6:1 on bone regardless of the tab theme.
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // No Event structured data while the invitation is unlisted.
  other: { "format-detection": "telephone=no" },
};

export const viewport: Viewport = {
  themeColor: "#12100e",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const NOSCRIPT_CSS = `
  [data-reveal], [data-reveal] > * {
    opacity: 1 !important;
    transform: none !important;
    clip-path: none !important;
    animation: none !important;
    transition: none !important;
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={fontClassNames}>
      <head>
        {/* Entry animations below the fold are driven by IntersectionObserver.
            Without JavaScript there is nothing to trigger them, so everything
            is shown outright rather than staying clipped forever. */}
        <noscript>
          <style>{NOSCRIPT_CSS}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
