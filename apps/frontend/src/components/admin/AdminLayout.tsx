import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useOutletContext } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AdminSidebar from "./AdminSidebar";

export interface BackTo {
  to: string;
  label: string;
}

export interface AdminLayoutContext {
  fullBleed: boolean;
  setFullBleed: (on: boolean) => void;
  hideChrome: boolean;
  setHideChrome: (on: boolean) => void;
  backTo: BackTo | null;
  setBackTo: (backTo: BackTo | null) => void;
}

export interface ChromeState {
  hideChrome: boolean;
  fullBleed: boolean;
  backTo: BackTo | null;
}

// Read by the sidebar and top bar; pages write through the outlet context hooks below.
export const ChromeContext = createContext<ChromeState>({ hideChrome: false, fullBleed: false, backTo: null });

export function useChrome(): ChromeState {
  return useContext(ChromeContext);
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

// Pages call this to show "‹ label" in the phone top bar while mounted.
export function useBackLink(backTo: BackTo | null) {
  const { setBackTo } = useOutletContext<AdminLayoutContext>();
  const to = backTo?.to;
  const label = backTo?.label;
  useEffect(() => {
    setBackTo(to && label ? { to, label } : null);
    return () => setBackTo(null);
  }, [to, label, setBackTo]);
}

export default function AdminLayout() {
  const { isAuthenticated } = useAuth();
  const [fullBleed, setFullBleedState] = useState(false);
  const [hideChrome, setHideChromeState] = useState(false);
  const [backTo, setBackToState] = useState<BackTo | null>(null);
  const setFullBleed = useCallback((on: boolean) => setFullBleedState(on), []);
  const setHideChrome = useCallback((on: boolean) => setHideChromeState(on), []);
  const setBackTo = useCallback((next: BackTo | null) => setBackToState(next), []);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ChromeContext.Provider value={{ hideChrome, fullBleed, backTo }}>
      <div className="flex min-h-screen">
        <AdminSidebar hidden={hideChrome} />
        <main
          className={`flex-1 min-w-0 bg-background overflow-auto ${hideChrome ? "pt-0" : "pt-[68px] md:pt-0"} ${
            fullBleed ? "" : "px-4 pb-4 md:px-8 md:pb-8 md:pt-8"
          }`}
        >
          <Outlet
            context={{ fullBleed, setFullBleed, hideChrome, setHideChrome, backTo, setBackTo } satisfies AdminLayoutContext}
          />
        </main>
      </div>
    </ChromeContext.Provider>
  );
}
