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
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        "surface-alt": "var(--bg-surface-alt)",
        primary: "var(--text-primary)",
        muted: "var(--text-muted)",
        accent: {
          primary: "var(--accent-primary)",
          "primary-dark": "var(--accent-primary-dark)",
          secondary: "var(--accent-secondary)",
          compras: "var(--accent-compras)",
          success: "var(--accent-success)",
          alert: "var(--accent-alert)",
          danger: "var(--accent-danger)",
        },
      },
      fontFamily: {
        heading: ["var(--font-barlow-condensed)", "sans-serif"],
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
