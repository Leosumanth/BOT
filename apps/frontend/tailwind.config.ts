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
        background: "hsl(220 40% 98%)",
        foreground: "hsl(220 57% 17%)",
        border: "hsl(220 31% 90%)",
        input: "hsl(220 31% 90%)",
        ring: "hsl(232 52% 46%)",
        primary: {
          DEFAULT: "hsl(216 69% 23%)",
          foreground: "hsl(0 0% 100%)"
        },
        secondary: {
          DEFAULT: "hsl(173 65% 92%)",
          foreground: "hsl(185 78% 26%)"
        },
        muted: {
          DEFAULT: "hsl(220 42% 96%)",
          foreground: "hsl(222 15% 45%)"
        },
        accent: {
          DEFAULT: "hsl(241 100% 97%)",
          foreground: "hsl(232 52% 46%)"
        },
        destructive: {
          DEFAULT: "hsl(348 72% 53%)",
          foreground: "hsl(0 0% 100%)"
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(220 57% 17%)"
        }
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
        "3xl": "2rem"
      },
      boxShadow: {
        panel: "0 20px 60px rgba(24, 43, 88, 0.08)"
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
