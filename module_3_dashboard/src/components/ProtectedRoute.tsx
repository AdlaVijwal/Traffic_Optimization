import { ReactNode, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Lock, Unlock } from "lucide-react";

type PanelName =
  | "overview"
  | "operations"
  | "analysis"
  | "outputs"
  | "playbooks";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedWithoutAuth?: boolean; // For uploads and live signaling pages
  panelName?: PanelName; // Name of the protected panel
}

export function ProtectedRoute({
  children,
  allowedWithoutAuth = false,
  panelName,
}: ProtectedRouteProps) {
  const { isPanelUnlocked, unlockPanel, lockPanel } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // If route is allowed without auth (uploads, live signaling), show it
  if (allowedWithoutAuth) {
    return <>{children}</>;
  }

  // Check if panel is unlocked
  if (!panelName || !isPanelUnlocked(panelName)) {
    const handleUnlock = (e: React.FormEvent) => {
      e.preventDefault();
      if (panelName && unlockPanel(panelName, password)) {
        setPassword("");
        setError("");
      } else {
        setError("Invalid password");
        setPassword("");
      }
    };

    const panelLabels: Record<PanelName, string> = {
      overview: "Overview & Analytics",
      operations: "Operations Dashboard",
      analysis: "Analysis Reports",
      outputs: "Output Frames",
      playbooks: "Playbooks & Guides",
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-yellow-500/50 bg-yellow-500/10 p-8 backdrop-blur-xl">
            <div className="mb-6 flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20">
                <Lock className="h-8 w-8 text-yellow-400" />
              </div>
            </div>
            <h2 className="mb-2 text-center text-2xl font-bold text-white">
              🔒 Panel Locked
            </h2>
            <p className="mb-6 text-center text-sm text-control-muted">
              {panelName ? panelLabels[panelName] : "This Panel"} requires
              authentication
            </p>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Enter Password to Unlock
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="w-full rounded-lg border border-control-border bg-control-surface px-4 py-3 text-white placeholder-control-muted focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="Enter password"
                  autoFocus
                />
                {error && (
                  <p className="mt-2 text-sm text-red-400">❌ {error}</p>
                )}
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 px-6 py-3 font-semibold text-white transition-all hover:shadow-lg hover:shadow-emerald-500/50"
              >
                <Unlock className="h-5 w-5" />
                Unlock Panel
              </button>
            </form>

            <div className="mt-6 space-y-2">
              <a
                href="/live"
                className="block rounded-lg border border-control-border bg-control-surface/50 px-6 py-3 text-center font-semibold text-control-muted transition-all hover:bg-control-surface"
              >
                Back to Live Signaling
              </a>
              <p className="text-center text-xs text-control-muted">
                💡 Auto-locks after 5 minutes of inactivity
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Panel is unlocked, render children with lock button
  return (
    <div className="relative">
      {panelName && (
        <div className="fixed right-4 top-4 z-50">
          <button
            onClick={() => lockPanel(panelName)}
            className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 backdrop-blur-xl transition-all hover:bg-red-500/20"
            title="Lock this panel"
          >
            <Lock className="h-4 w-4" />
            Lock Panel
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
