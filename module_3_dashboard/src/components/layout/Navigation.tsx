import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  CloudLightning,
  Images,
  Layers,
  UploadCloud,
  Radio,
} from "lucide-react";

const navLinks = [
  { to: "/live", label: "Live Signaling", icon: Radio },
  { to: "/overview", label: "Overview", icon: CloudLightning },
  { to: "/operations", label: "Operations", icon: Activity },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/outputs", label: "Outputs", icon: Images },
  { to: "/uploads", label: "Uploads", icon: UploadCloud },
  { to: "/playbooks", label: "Playbooks", icon: Layers, disabled: true },
];

const navTelemetry = [
  { label: "Active Streams", value: "04", trend: "+1" },
  { label: "Vehicles / min", value: "126", trend: "+12%" },
  { label: "Signal Sync", value: "98.4%", trend: "Stable" },
];

export function Navigation() {
  return (
    <header className="nav-shell">
      <div className="nav-holo">
        <div className="nav-identity">
          <div className="nav-orb">
            <span className="nav-orb-ring" aria-hidden />
            <CloudLightning className="nav-orb-icon" />
          </div>
          <div className="nav-title">
            <p className="nav-title-label">Project</p>
            <p className="nav-title-name">Traffic Optimization</p>
            <p className="nav-title-sub">Signal Control Command Console</p>
            <div className="nav-intel" role="presentation">
              {navTelemetry.map(({ label, value, trend }) => (
                <span key={label} className="nav-intel-chip">
                  <span className="nav-intel-icon" aria-hidden />
                  <span className="nav-intel-value">{value}</span>
                  <span className="nav-intel-label">{label}</span>
                  <span className="nav-intel-trend">{trend}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <nav className="nav-link-group" aria-label="Primary">
          {navLinks.map(({ to, label, icon: Icon, disabled }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `nav-chip ${
                  disabled
                    ? "nav-chip-disabled"
                    : isActive
                    ? "nav-chip-active"
                    : "nav-chip-idle"
                }`
              }
              onClick={(event) => {
                if (disabled) {
                  event.preventDefault();
                }
              }}
            >
              <Icon className="nav-chip-icon" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
