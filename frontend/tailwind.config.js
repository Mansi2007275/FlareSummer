/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#FFE370", // hazard-yellow page background — the "watchtower on alert" base
        ink: "#14110F", // warm near-black used for all borders/text, never pure #000
        paper: "#FFFFFF",
        "paper-dim": "#FFF9E8",
        safe: "#3DFF9A",
        watch: "#FF8A3D",
        danger: "#FF3D6E",
        flare: "#6A5CFF",
        "flare-dim": "#EDEBFF",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        brutal: "6px 6px 0 0 #14110F",
        "brutal-sm": "3px 3px 0 0 #14110F",
        "brutal-lg": "10px 10px 0 0 #14110F",
        "brutal-inset": "inset 4px 4px 0 0 #14110F",
      },
      borderWidth: {
        3: "3px",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.25 },
        },
        stampIn: {
          "0%": { transform: "scale(1.4) rotate(-14deg)", opacity: 0 },
          "60%": { transform: "scale(0.94) rotate(-4deg)", opacity: 1 },
          "100%": { transform: "scale(1) rotate(-4deg)", opacity: 1 },
        },
      },
      animation: {
        blink: "blink 1.6s ease-in-out infinite",
        stampIn: "stampIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      },
    },
  },
  plugins: [],
};
