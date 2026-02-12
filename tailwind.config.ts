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
          50: "#e2f5f0",
          100: "#b0e5d9",
          200: "#7dd4c2",
          300: "#4dbfa8",
          400: "#2a9e8a",
          500: "#1a7d6e",
          600: "#146358",
          700: "#0e4d45",
          800: "#0a3a34",
          850: "#0b2f2e",
          900: "#071f1c",
          950: "#021019",
        },
        teal: {
          400: "#2a9e8a",
          500: "#1a7d6e",
          600: "#146358",
        },
        emerald: {
          400: "#3daa8a",
          500: "#2d8f73",
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
