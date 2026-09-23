import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Canais RGB ("R G B", definidos em globals.css) + <alpha-value>: é o
      // que permite modificadores de opacidade (bg-accent-success/10,
      // text-primary/80…). Com var(--x) em hex, o Tailwind não gerava essas
      // classes. `secondary` fica em var() puro — o padrão dela é
      // `transparent`, que não tem canais RGB, e ela não é usada com opacidade.
      colors: {
        base: "rgb(var(--bg-base-rgb) / <alpha-value>)",
        surface: "rgb(var(--bg-surface-rgb) / <alpha-value>)",
        "surface-alt": "rgb(var(--bg-surface-alt-rgb) / <alpha-value>)",
        primary: "rgb(var(--text-primary-rgb) / <alpha-value>)",
        muted: "rgb(var(--text-muted-rgb) / <alpha-value>)",
        accent: {
          primary: "rgb(var(--accent-primary-rgb) / <alpha-value>)",
          "primary-dark": "rgb(var(--accent-primary-dark-rgb) / <alpha-value>)",
          secondary: "var(--accent-secondary)",
          compras: "rgb(var(--accent-compras-rgb) / <alpha-value>)",
          success: "rgb(var(--accent-success-rgb) / <alpha-value>)",
          alert: "rgb(var(--accent-alert-rgb) / <alpha-value>)",
          danger: "rgb(var(--accent-danger-rgb) / <alpha-value>)",
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
