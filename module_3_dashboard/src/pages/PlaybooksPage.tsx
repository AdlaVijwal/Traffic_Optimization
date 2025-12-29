import { Panel } from "../components/common/Panel";

export function PlaybooksPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <Panel accent="neutral" className="text-center text-white/70">
        <h1 className="text-3xl font-semibold text-white">
          Playbooks (coming soon)
        </h1>
        <p className="mt-3 text-sm">
          Tactical response playbooks will live here, combining detection alerts
          with suggested traffic management steps.
        </p>
        <p className="mt-2 text-xs uppercase tracking-wide text-white/40">
          Planned Q1 update
        </p>
      </Panel>
    </div>
  );
}
