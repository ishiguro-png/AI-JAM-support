import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#3b6fe0",
          600: "#2f59c4",
          700: "#25459a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
