import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette (DESIGN.md, riven_narrative)
        cream: "#FAF7F2",
        charcoal: "#1A1A1A",
        gold: "#C9A961",
        sage: "#7C9A7E",
        "soft-red": "#C76B5C",

        // Semantic Material-3 tokens — mapped to brand palette so Stitch
        // mockup HTML drops in 1:1 while reflecting RIVEN's brand colors.
        background: "#FAF7F2",
        surface: "#FAF7F2",
        "surface-bright": "#FFFFFF",
        "surface-dim": "#F0EBE3",
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F7F3ED",
        "surface-container": "#F2EDE5",
        "surface-container-high": "#EBE5DB",
        "surface-container-highest": "#E5DED1",
        "surface-variant": "#EBE5DB",
        "on-background": "#1A1A1A",
        "on-surface": "#1A1A1A",
        "on-surface-variant": "#4A4744",

        primary: "#1A1A1A",
        "on-primary": "#FAF7F2",
        "primary-container": "#1A1A1A",
        "on-primary-container": "#5A5752",
        "inverse-primary": "#C8C6C5",
        "inverse-surface": "#2B2A28",
        "inverse-on-surface": "#F4F0EF",

        secondary: "#C9A961", // muted gold
        "on-secondary": "#1A1A1A",
        "secondary-container": "#F0E2BC",
        "on-secondary-container": "#5A4302",
        "secondary-fixed": "#F0E2BC",
        "secondary-fixed-dim": "#E4C278",

        tertiary: "#7C9A7E", // sage
        "on-tertiary": "#FAF7F2",
        "tertiary-container": "#D9E5D9",
        "on-tertiary-container": "#324D36",
        "tertiary-fixed": "#D9E5D9",
        "tertiary-fixed-dim": "#AFCFB0",

        error: "#C76B5C", // soft red
        "on-error": "#FAF7F2",
        "error-container": "#F4D9D4",
        "on-error-container": "#7A2B20",

        outline: "#A8A29A",
        "outline-variant": "#D4CFC6",
        "surface-tint": "#5F5E5E",
      },
      fontFamily: {
        display: ["var(--font-dm-serif)", "DM Serif Display", "serif"],
        body: ["var(--font-plus-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        // Stitch-aligned aliases (used directly in mockup HTML)
        "display-lg": ["var(--font-dm-serif)", "DM Serif Display", "serif"],
        "headline-lg": ["var(--font-dm-serif)", "DM Serif Display", "serif"],
        "headline-lg-mobile": ["var(--font-dm-serif)", "DM Serif Display", "serif"],
        "headline-md": ["var(--font-dm-serif)", "DM Serif Display", "serif"],
        "body-lg": ["var(--font-plus-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        "body-md": ["var(--font-plus-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        "label-md": ["var(--font-plus-jakarta)", "Plus Jakarta Sans", "sans-serif"],
        "label-sm": ["var(--font-plus-jakarta)", "Plus Jakarta Sans", "sans-serif"],
      },
      fontSize: {
        "display-lg": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "400" }],
        "headline-lg": ["32px", { lineHeight: "40px", fontWeight: "400" }],
        "headline-lg-mobile": ["28px", { lineHeight: "36px", fontWeight: "400" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "400" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "20px", letterSpacing: "0.05em", fontWeight: "600" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "500" }],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        sm: "0.25rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      spacing: {
        base: "8px",
        gutter: "16px",
        "section-gap": "48px",
        "container-padding-mobile": "20px",
        "container-padding-desktop": "40px",
        // Aliases — call sites use `px-container-mobile`/`px-container-desktop`.
        // Without these, those utilities silently render no padding (content
        // flush to the viewport edge). Don't remove.
        "container-mobile": "20px",
        "container-desktop": "40px",
      },
      boxShadow: {
        // DESIGN.md elevation tokens
        "elevation-1": "0 4px 20px rgba(0, 0, 0, 0.04)",
        "elevation-2": "0 6px 30px rgba(0, 0, 0, 0.08)",
        "nav-top": "0 -4px 20px rgba(0, 0, 0, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
