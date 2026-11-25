/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "!./src/stageshow/kit/**"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#0039D3", dark: "#002DA8", navy: "#0A1F66", navy2: "#1A3383", sky: "#EEF3FF", line: "#D3DEFA" },
        accent: { DEFAULT: "#FA5E00", strong: "#C94B00", text: "#B54400", soft: "#FFF1E7", line: "#FFD8C0" },
        ink: { DEFAULT: "#0E1A3F", muted: "#56617F", faint: "#616B88" },
        plane: "#F6F8FE",
        line: "#DDE5F4",
        good: "#0B7A54",
        bad: "#C62F2F",
      },
      fontFamily: { sans: ["Poppins", "system-ui", "sans-serif"] },
      borderRadius: { card: "18px" },
      boxShadow: { card: "0 2px 14px rgba(10,31,102,0.07)", pop: "0 10px 40px rgba(10,31,102,0.18)" },
    },
  },
  plugins: [],
};
