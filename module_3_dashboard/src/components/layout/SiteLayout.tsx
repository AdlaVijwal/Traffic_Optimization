import { Outlet } from "react-router-dom";
import { Navigation } from "./Navigation";

export function SiteLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-control-background text-white">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-control-grid opacity-40" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-control-radial opacity-90" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-10 px-6 pb-20 pt-12 lg:px-10">
        <Navigation />
        <Outlet />
      </div>
    </div>
  );
}
