import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Plausible } from "@/components/plausible";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-serif",
});

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "RIVEN",
  description: "Your transformation starts today.",
  manifest: "/manifest.json",
  applicationName: "RIVEN",
  // Without these explicit icon links, iOS PWA installs fall back to a
  // black splash screen for ~2s on launch because iOS can't find an app
  // icon and doesn't fully respect manifest.background_color in that case.
  // /apple-touch-icon.png + /icons/icon-{192,512}.png are generated cream
  // squares with the RIVEN "R" wordmark; the manifest already references
  // the 192/512 pair. Together they give iOS what it needs to render a
  // proper cream splash on launch.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RIVEN",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF7F2",
  // Pin the site to a light color scheme. Without this, iOS Safari users in
  // dark mode see a black flash during navigation transitions before our CSS
  // can declare the cream background. RIVEN is a single-theme brand — light.
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=swap";

/**
 * Critical above-the-fold CSS inlined in <head>. The browser can paint the
 * welcome page before the Tailwind bundle arrives — meaningful FCP win on
 * slow mobile networks. Each rule is a duplicate of what Tailwind emits for
 * the same class, so when the bundle DOES load, values match exactly — no
 * flash, no re-layout. Keep this lean (under ~1KB inline).
 */
const CRITICAL_CSS = `
  :root{color-scheme:light;background:#FAF7F2}
  *,::before,::after{box-sizing:border-box;border:0 solid #D4CFC6}
  html{background:#FAF7F2;-webkit-text-size-adjust:100%}
  html,body{margin:0;padding:0}
  body{
    background:#FAF7F2;
    color:#1A1A1A;
    min-height:100vh;
    font-family:var(--font-plus-jakarta),'Plus Jakarta Sans',system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
    -moz-osx-font-smoothing:grayscale;
  }
  .font-display{font-family:var(--font-dm-serif),'DM Serif Display',serif}
  .font-body{font-family:var(--font-plus-jakarta),'Plus Jakarta Sans',system-ui,sans-serif}
  .bg-cream{background-color:#FAF7F2}
  .bg-charcoal{background-color:#1A1A1A}
  .text-charcoal{color:#1A1A1A}
  .text-cream{color:#FAF7F2}
  .bg-surface-container{background-color:#F2EDE5}
  .text-on-primary-container{color:#5A5752}
`.trim();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${plusJakarta.variable}`}>
      <head>
        {/* Inline critical CSS — duplicates a few Tailwind values so the
            page can paint before /_next/static/css/app/layout.css arrives. */}
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }} />

        {/* Material Symbols Outlined is loaded asynchronously so it never
            render-blocks first paint. Lighthouse confirmed this was the
            single biggest mobile bottleneck (~3.7s on slow networks).
            Pattern:
              1. preconnect to warm DNS/TLS for the font hosts
              2. preload the CSS as a resource (browser starts download)
              3. attach the same CSS as a non-blocking stylesheet via
                 media="print" — applied to the page only once it's loaded
              4. inline swap script flips media to "all" on load (or instantly
                 if cached). Tiny enough not to block parsing itself.
              5. <noscript> fallback for JS-disabled clients.
            Trade-off: icons FOUC ~1 frame later, but first paint is fast. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="preload" as="style" href={MATERIAL_SYMBOLS_HREF} />
        <link
          rel="stylesheet"
          href={MATERIAL_SYMBOLS_HREF}
          media="print"
        />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href={MATERIAL_SYMBOLS_HREF} />
        </noscript>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.querySelectorAll('link[rel=stylesheet][media=print]');for(var i=0;i<l.length;i++){var k=l[i];if(k.sheet){k.media='all';}else{k.addEventListener('load',function(){this.media='all';});}}})();",
          }}
        />
      </head>
      <body className="min-h-screen bg-cream text-charcoal font-body antialiased">
        {children}
        <ServiceWorkerRegister />
        <Plausible />
      </body>
    </html>
  );
}
