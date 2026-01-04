import { Route, Routes } from "react-router-dom";
import { CommandCenterPage } from "./pages/CommandCenterPage";
import { ToastProvider } from "./components/common/Toast";
import { AuthProvider } from "./context/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Command Center - Main App with Per-Panel Authentication */}
          <Route path="/*" element={<CommandCenterPage />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
