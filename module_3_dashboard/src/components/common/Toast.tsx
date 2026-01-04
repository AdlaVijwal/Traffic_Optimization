import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, "id">) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

const toastStyles: Record<
  ToastType,
  { icon: typeof CheckCircle; colors: string }
> = {
  success: {
    icon: CheckCircle,
    colors: "bg-severity-calm/10 border-severity-calm text-severity-calm",
  },
  error: {
    icon: AlertCircle,
    colors:
      "bg-severity-critical/10 border-severity-critical text-severity-critical",
  },
  warning: {
    icon: AlertTriangle,
    colors:
      "bg-severity-caution/10 border-severity-caution text-severity-caution",
  },
  info: {
    icon: Info,
    colors: "bg-severity-info/10 border-severity-info text-severity-info",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 5000 }: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random()}`;
      const newToast: Toast = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "success", title, message }),
    [showToast]
  );

  const error = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "error", title, message }),
    [showToast]
  );

  const info = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "info", title, message }),
    [showToast]
  );

  const warning = useCallback(
    (title: string, message?: string) =>
      showToast({ type: "warning", title, message }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((toast) => {
          const style = toastStyles[toast.type];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-96 animate-slide-in items-start gap-3 rounded-2xl border ${style.colors} bg-opacity-95 p-4 shadow-2xl backdrop-blur-sm transition-all duration-300`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-white">{toast.title}</p>
                {toast.message && (
                  <p className="mt-1 text-sm text-white/80">{toast.message}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 rounded-lg p-1 text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
