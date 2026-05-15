import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#171717",
          fg: "#e8e8e8",
          line: "#2f2f2f",
          muted: "#9b9b9b",
          panel: "#202020"
        }
      },
      fontFamily: {
        sans: ["Lato", "sans-serif"],
        mono: ["Roboto Mono", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
