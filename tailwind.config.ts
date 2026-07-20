import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#07080a",
          900: "#0d0f13",
          800: "#161a20",
          700: "#232832",
          500: "#687080"
        }
      },
      boxShadow: {
        pro: "0 18px 60px rgba(0,0,0,0.35)"
      }
    }
  },
  plugins: []
};

export default config;
