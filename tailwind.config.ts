import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        "bg-base": "var(--bg-base)",
        "bg-card": "var(--bg-card)",
        "bg-overlay": "var(--bg-overlay)",
        "text-primary": "var(--text-primary)",
        "text-muted": "var(--text-muted)",
        "text-faint": "var(--text-faint)",
        "border-subtle": "var(--border-subtle)",
        "border-input": "var(--border-input)",
        accent: {
          DEFAULT: "var(--accent)",
          dark: "var(--accent-dark)",
          deep: "var(--accent-deep)",
        },
        amber: {
          DEFAULT: "var(--amber)",
          text: "var(--amber-text)",
        },
        warning: "var(--amber)",
        error: "var(--red-muted)",
        success: "var(--accent)",
      },
      borderRadius: {
        lg: "16px",
        md: "12px",
        sm: "8px",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
