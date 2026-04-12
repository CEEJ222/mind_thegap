import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F5EDDC",
        turquoise: {
          DEFAULT: "#3DD9B3",
          dark: "#2FB896",
        },
        ink: "#1A1A1A",
        muted: "#6B6B6B",
        "tier-strong": "#2FB896",
        "tier-weak": "#E8A93B",
        "tier-none": "#E05B5B",
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "16px",
        md: "12px",
        sm: "8px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
