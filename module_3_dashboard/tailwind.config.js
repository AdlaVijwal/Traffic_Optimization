/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        control: {
          background: "#05060C",
          surface: "#0C1018",
          panel: "#12192B",
          glass: "#162036",
          overlay: "#1C253B",
          accent: "#3CE0C3",
          accentSoft: "#1BA58C",
          amber: "#FFC960",
          magenta: "#AA6BFF",
          info: "#38BDF8",
          muted: "#97A3C2",
          border: "#25304A",
          success: "#36FBA1",
          alert: "#FF6B6B",
        },
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'Roboto Mono'", "monospace"],
      },
      boxShadow: {
        glow: "0 0 30px rgba(60, 224, 195, 0.3)",
        "ambient-glow": "0 45px 120px rgba(5, 6, 12, 0.65)",
        "accent-ring": "0 0 40px rgba(60, 224, 195, 0.25)",
      },
      backgroundImage: {
        "control-radial":
          "radial-gradient(120% 120% at 50% -10%, rgba(60, 224, 195, 0.18) 0%, rgba(5, 6, 12, 0) 60%), radial-gradient(90% 120% at 85% 20%, rgba(170, 107, 255, 0.15) 0%, rgba(5, 6, 12, 0) 60%)",
        "control-grid":
          "linear-gradient(transparent, transparent 95%, rgba(66, 82, 110, 0.12) 96%), linear-gradient(90deg, transparent, transparent 95%, rgba(66, 82, 110, 0.12) 96%)",
      },
      borderRadius: {
        "4xl": "2.5rem",
      },
      backdropBlur: {
        ultra: "28px",
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.95)", opacity: "0.9" },
          "50%": { transform: "scale(1)", opacity: "0.4" },
          "100%": { transform: "scale(0.95)", opacity: "0.9" },
        },
        radarSweep: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "pulse-ring": "pulseRing 2.5s infinite",
        "radar-sweep": "radarSweep 8s linear infinite",
      },
    },
  },
  plugins: [],
};
