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
        background: "hsl(30 44% 96%)",
        foreground: "hsl(25 30% 12%)",
        border: "hsl(30 28% 84%)",
        input: "hsl(30 28% 84%)",
        ring: "hsl(173 52% 43%)",
        primary: {
          DEFAULT: "hsl(19 28% 22%)",
          foreground: "hsl(35 100% 97%)"
        },
        secondary: {
          DEFAULT: "hsl(160 32% 92%)",
          foreground: "hsl(160 34% 22%)"
        },
        muted: {
          DEFAULT: "hsl(35 36% 92%)",
          foreground: "hsl(25 16% 38%)"
        },
        accent: {
          DEFAULT: "hsl(173 45% 88%)",
          foreground: "hsl(173 54% 24%)"
        },
        destructive: {
          DEFAULT: "hsl(351 56% 56%)",
          foreground: "hsl(0 0% 100%)"
        },
        card: {
          DEFAULT: "hsl(35 80% 98%)",
          foreground: "hsl(25 30% 12%)"
        }
      },
      borderRadius: {
        xl: "1.25rem",
        "2xl": "1.75rem",
        "3xl": "2rem"
      },
      boxShadow: {
        panel: "0 20px 50px rgba(94, 71, 44, 0.12)"
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
