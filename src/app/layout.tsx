import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
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
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=swap";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${plusJakarta.variable}`}>
      <head>
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
      </body>
    </html>
  );
}
