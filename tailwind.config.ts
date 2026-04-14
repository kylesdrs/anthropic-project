import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: "#d8ede8",
          100: "#a8d6cc",
          200: "#78bfb0",
          300: "#4da896",
          400: "#2a8e7c",
          500: "#1a7466",
          600: "#165a4f",
          700: "#0e4d45",
          800: "#0b3b36",
          850: "#072f2c",
          900: "#062624",
          950: "#041A19",
        },
        teal: {
          400: "#2a8e7c",
          500: "#1a7466",
          600: "#165a4f",
        },
        emerald: {
          400: "#359478",
          500: "#2a7a62",
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.5s ease-out both",
        "fade-in": "fadeIn 0.4s ease-out both",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
