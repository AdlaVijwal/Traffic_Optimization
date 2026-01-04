import { Panel } from "../common/Panel";
import type { DashboardData } from "../../types/dashboard";

interface CommandPanelProps {
  dashboard: DashboardData;
}

export function CommandPanel({ dashboard }: CommandPanelProps) {
  return (
    <Panel>
      <div className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Command Panel</h3>
        <p className="text-control-muted">Junction control panel placeholder</p>
      </div>
    </Panel>
  );
}
