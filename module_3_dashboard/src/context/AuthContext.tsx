import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";

type PanelName =
  | "overview"
  | "operations"
  | "analysis"
  | "outputs"
  | "playbooks";

interface PanelAccess {
  unlocked: boolean;
  unlockedAt?: number;
}

interface AuthContextType {
  isPanelUnlocked: (panel: PanelName) => boolean;
  unlockPanel: (panel: PanelName, password: string) => boolean;
  lockPanel: (panel: PanelName) => void;
  lockAllPanels: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple password (in production, use proper backend authentication)
const VALID_PASSWORD = "traffic2026";

// Auto-lock timeout in milliseconds (5 minutes)
const AUTO_LOCK_TIMEOUT = 5 * 60 * 1000;

const STORAGE_KEY = "traffic_panel_access";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [panelAccess, setPanelAccess] = useState<
    Record<PanelName, PanelAccess>
  >(() => {
    // Load from localStorage on init
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return {
          overview: { unlocked: false },
          operations: { unlocked: false },
          analysis: { unlocked: false },
          outputs: { unlocked: false },
          playbooks: { unlocked: false },
        };
      }
    }
    return {
      overview: { unlocked: false },
      operations: { unlocked: false },
      analysis: { unlocked: false },
      outputs: { unlocked: false },
      playbooks: { unlocked: false },
    };
  });

  // Save to localStorage whenever panelAccess changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelAccess));
  }, [panelAccess]);

  // Auto-lock timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPanelAccess((prev) => {
        const updated = { ...prev };
        let hasChanges = false;

        (Object.keys(updated) as PanelName[]).forEach((panel) => {
          if (
            updated[panel].unlocked &&
            updated[panel].unlockedAt &&
            now - updated[panel].unlockedAt! > AUTO_LOCK_TIMEOUT
          ) {
            updated[panel] = { unlocked: false };
            hasChanges = true;
          }
        });

        return hasChanges ? updated : prev;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const isPanelUnlocked = useCallback(
    (panel: PanelName): boolean => {
      const access = panelAccess[panel];
      if (!access.unlocked) return false;

      // Check if auto-lock timeout has passed
      if (
        access.unlockedAt &&
        Date.now() - access.unlockedAt > AUTO_LOCK_TIMEOUT
      ) {
        // Auto-lock
        setPanelAccess((prev) => ({
          ...prev,
          [panel]: { unlocked: false },
        }));
        return false;
      }

      return true;
    },
    [panelAccess]
  );

  const unlockPanel = useCallback(
    (panel: PanelName, password: string): boolean => {
      if (password === VALID_PASSWORD) {
        setPanelAccess((prev) => ({
          ...prev,
          [panel]: { unlocked: true, unlockedAt: Date.now() },
        }));
        return true;
      }
      return false;
    },
    []
  );

  const lockPanel = useCallback((panel: PanelName) => {
    setPanelAccess((prev) => ({
      ...prev,
      [panel]: { unlocked: false },
    }));
  }, []);

  const lockAllPanels = useCallback(() => {
    setPanelAccess({
      overview: { unlocked: false },
      operations: { unlocked: false },
      analysis: { unlocked: false },
      outputs: { unlocked: false },
      playbooks: { unlocked: false },
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ isPanelUnlocked, unlockPanel, lockPanel, lockAllPanels }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
