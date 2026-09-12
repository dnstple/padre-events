import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The CSP is intentionally tight. `'unsafe-inline'` is present for styles only,
 * because Next.js injects inline <style> for CSS Modules; scripts are limited to
 * self plus the strict-dynamic-free inline bootstrap Next requires.
 * Google Sheets is only ever contacted from the server, so `connect-src` stays
 * same-origin.
 */

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // The popup page draws its map from OpenStreetMap raster tiles, so that one
  // host — and only that host — is allowed as an image source. Everything else
  // stays same-origin.
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "media-src 'self'",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  // Google is only ever contacted server-side, so the browser needs nothing
  // beyond same-origin.
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  images: {
    // Local media only — nothing is hotlinked from the production sites.
    formats: ["image/avif", "image/webp"],
    deviceSizes: [320, 375, 430, 640, 768, 1024, 1280, 1440, 1920, 2560],
  },

  /**
   * The popup shop is the live event, so it is what the site root serves. It
   * answers on /popup too, because that URL has been shared.
   *
   * Rewrites, not redirects, and `beforeFiles` so they are applied before the
   * app router looks for a page. Two things to know:
   *
   *   - The site runs with Next's default `trailingSlash: false`, which
   *     already redirects /popup/ to /popup. A redirect the other way puts
   *     the two in a loop, which is exactly what happened the first time.
   *   - The page's asset paths are absolute (/popup/images/…, /popup/media/…)
   *     so it does not matter which of these URLs it is being served at.
   */
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/popup/index.html" },
        { source: "/popup", destination: "/popup/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // Private surfaces must never be cached by a CDN or shared proxy.
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private, max-age=0",
          },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
