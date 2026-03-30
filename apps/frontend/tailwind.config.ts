import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1440px"
      }
    },
    extend: {
      colors: {
        background: "hsl(216 33% 97%)",
        foreground: "hsl(222 47% 11%)",
        border: "hsl(214 26% 88%)",
        input: "hsl(214 26% 88%)",
        ring: "hsl(217 91% 60%)",
        primary: {
          DEFAULT: "hsl(222 47% 15%)",
          foreground: "hsl(210 40% 98%)"
        },
        secondary: {
          DEFAULT: "hsl(214 35% 93%)",
          foreground: "hsl(222 47% 20%)"
        },
        muted: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(215 16% 40%)"
        },
        accent: {
          DEFAULT: "hsl(213 94% 93%)",
          foreground: "hsl(217 76% 32%)"
        },
        destructive: {
          DEFAULT: "hsl(0 72% 51%)",
          foreground: "hsl(0 0% 100%)"
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(222 47% 11%)"
        }
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
        "3xl": "2rem"
      },
      boxShadow: {
        panel: "0 24px 60px rgba(15, 23, 42, 0.08)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"]
      }
    }
  },
  plugins: []
};

export default config;
