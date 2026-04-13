import type { Config } from "tailwindcss";

/**
 * Side-panel dark theme. The web app has both light + dark; the side panel
 * ships as dark-only for now to match the application surface users
 * spend the most time in (Applications, Jobs pages).
 */
const config: Config = {
  content: ["./src/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Backgrounds — warm charcoal with a faint green tint that
        // complements the turquoise accent without competing with it.
        "panel-bg": "#141817",
        "panel-surface": "#1D2322",
        "panel-surface-alt": "#242B29",
        "panel-border": "#2E3836",
        "panel-border-strong": "#3A4643",

        // Text
        "panel-text": "#F5EDDC",
        "panel-text-muted": "#9AA7A2",
        "panel-text-faint": "#6B7672",

        // Accent (preserved from the web app)
        turquoise: {
          DEFAULT: "#3DD9B3",
          dark: "#2FB896",
          ink: "#0B2A24",
        },

        // Legacy aliases kept so pre-existing utility classes don't break.
        cream: "#F5EDDC",
        ink: "#1A1A1A",
        muted: "#9AA7A2",

        "tier-strong": "#3DD9B3",
        "tier-weak": "#E8A93B",
        "tier-none": "#E66D6D",
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "16px",
        md: "12px",
        sm: "8px",
      },
      boxShadow: {
        panel: "0 8px 24px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
