/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Welcome hero is now self-hosted in /public; no remote patterns needed.
    // Add entries here later if we ever serve R2 media through next/image
    // (would need NEXT_PUBLIC_R2_PUBLIC_URL exposed and matched here).
    remotePatterns: [],
  },
  async headers() {
    return [
      // Hashed Next static assets (JS/CSS bundles) — already get immutable
      // headers from Next by default, but being explicit doesn't hurt and
      // guards against Railway middleware stripping them.
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Optimized images from Next's image pipeline. Same hashed-bust model.
      {
        source: "/_next/image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, immutable",
          },
        ],
      },
      // Public assets in /public — manifest changes between deploys, give
      // it a short cache so PWA installs pick up updates quickly.
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      // Service worker MUST NEVER be cached — Workbox / browser updates the
      // SW based on bytes; a cached old sw.js would lock users on stale code.
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
