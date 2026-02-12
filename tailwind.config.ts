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
          50: "#e6f5fa",
          100: "#b3e0f0",
          200: "#80cce6",
          300: "#4db8db",
          400: "#26a8d4",
          500: "#0098cc",
          600: "#007ba6",
          700: "#005e80",
          800: "#004159",
          850: "#0d2137",
          900: "#0a1628",
          950: "#060e1a",
        },
        teal: {
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
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
