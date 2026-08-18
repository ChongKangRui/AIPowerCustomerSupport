import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Postgres driver out of the bundler — Prisma's pg driver adapter
  // needs the real Node module at runtime.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],

  // Next.js 16 locks its build output directory (`<distDir>/lock`) so only
  // one `next dev`/`next build` can run against it at a time — scoped to the
  // directory, not the port. playwright.config.ts's webServer sets
  // NEXT_DIST_DIR so its `next dev` (already on its own port + test DB)
  // also gets its own build directory, and so its own lock, letting it run
  // alongside a normal `npm run dev` instead of colliding on `.next/lock`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Next.js has no Express/Helmet equivalent that sets these for you —
  // this headers() function is the idiomatic replacement, applied to
  // every route. A real Content-Security-Policy is deliberately left out
  // here: it needs every script/style/connect source enumerated (Google
  // OAuth, the Gemini SDK, fonts) and careful testing, or it silently
  // breaks the app. That belongs in its own reviewed change.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops the browser from guessing a response's MIME type from
          // its content — blocks a classic MIME-sniffing XSS vector.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Refuses to let any other site frame this app — blocks
          // clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Sends only the origin (not the full URL) as Referer when
          // navigating to another site, so ticket IDs/tokens in the URL
          // don't leak to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // This app doesn't use any of these browser features — turning
          // them off removes attack surface for free.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
