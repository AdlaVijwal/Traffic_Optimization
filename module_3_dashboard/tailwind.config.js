/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        control: {
          background: "#050812",
          surface: "#0B0F1A",
          surfaceMuted: "#11192A",
          panel: "#162238",
          overlay: "#1C2C45",
          accent: "#3CE0C3",
          accentSoft: "#1BA58C",
          info: "#38BDF8",
          muted: "#97A3C2",
          border: "#22314B",
          borderSoft: "#2D3C59",
          success: "#36FBA1",
          caution: "#F8B84A",
          critical: "#F87171",
        },
        severity: {
          calm: "#2FD6A6",
          caution: "#F8B84A",
          critical: "#F87171",
          info: "#38BDF8",
          neutral: "#94A3B8",
        },
        slate: {
          950: "#020617",
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
          600: "#475569",
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
