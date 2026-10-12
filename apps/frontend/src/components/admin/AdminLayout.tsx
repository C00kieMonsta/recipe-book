import { useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";

export interface AdminLayoutContext {
  fullBleed: boolean;
  setFullBleed: (on: boolean) => void;
  hideChrome: boolean;
  setHideChrome: (on: boolean) => void;
}

// Pages call this to drop the main padding and width limit while mounted.
export function useFullBleed(on: boolean) {
  const { setFullBleed } = useOutletContext<AdminLayoutContext>();
  useEffect(() => {
    setFullBleed(on);
    return () => setFullBleed(false);
  }, [on, setFullBleed]);
}

// Pages call this to hide the phone top bar and the desktop sidebar while mounted.
export function useHideChrome(on: boolean) {
  const { setHideChrome } = useOutletContext<AdminLayoutContext>();
  useEffect(() => {
    setHideChrome(on);
    return () => setHideChrome(false);
  }, [on, setHideChrome]);
}

export default function AdminLayout() {
  const { isAuthenticated } = useAuth();
  const [fullBleed, setFullBleed] = useState(false);
  const [hideChrome, setHideChrome] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar hidden={hideChrome} />
      <main
        className={`flex-1 min-w-0 bg-background overflow-auto ${hideChrome ? "pt-0" : "pt-[68px] md:pt-0"} ${
          fullBleed ? "" : "px-4 pb-4 md:px-8 md:pb-8 md:pt-8"
        }`}
      >
        <Outlet context={{ fullBleed, setFullBleed, hideChrome, setHideChrome } satisfies AdminLayoutContext} />
      </main>
    </div>
  );
}
