import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ivory: "#FBF8F2",
        gold: {
          50: "#FAF6EF",
          600: "#C9A24B",
          700: "#B08D2E",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
