import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { ChevronsRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { IconButton } from "@/components/ui/Button";
import AdminSidebar from "./AdminSidebar";
import { TourProvider } from "./TourProvider";

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
  topTitle: string | null;
  setTopTitle: (title: string | null) => void;
}

export interface ChromeState {
  hideChrome: boolean;
  fullBleed: boolean;
  backTo: BackTo | null;
  topTitle: string | null;
}

// Read by the sidebar and top bar; pages write through the outlet context hooks below.
export const ChromeContext = createContext<ChromeState>({ hideChrome: false, fullBleed: false, backTo: null, topTitle: null });

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

// Pages call this to show their title centred in the phone top bar while mounted.
export function useTopTitle(title: string) {
  const { setTopTitle } = useOutletContext<AdminLayoutContext>();
  useEffect(() => {
    setTopTitle(title || null);
    return () => setTopTitle(null);
  }, [title, setTopTitle]);
}

const SIDEBAR_KEY = "recipe-book:sidebar-collapsed";

export default function AdminLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [fullBleed, setFullBleedState] = useState(false);
  const [hideChrome, setHideChromeState] = useState(false);
  const [backTo, setBackToState] = useState<BackTo | null>(null);
  const [topTitle, setTopTitleState] = useState<string | null>(null);
  const [collapsedPref, setCollapsedPref] = useLocalStorage<boolean | null>(SIDEBAR_KEY, null);
  const collapsed = collapsedPref === true;
  const setFullBleed = useCallback((on: boolean) => setFullBleedState(on), []);
  const setHideChrome = useCallback((on: boolean) => setHideChromeState(on), []);
  const setBackTo = useCallback((next: BackTo | null) => setBackToState(next), []);
  const setTopTitle = useCallback((next: string | null) => setTopTitleState(next), []);

  if (!isAuthenticated) {
    // The target travels in the query string so it survives a refresh on the login page.
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  const padding = fullBleed ? "px-4 pb-8 md:px-6 md:pt-6" : "px-4 pb-8 md:px-12 md:pt-10 xl:px-24";
  const phoneTop = hideChrome ? "pt-0" : "pt-[56px]";

  return (
    <ChromeContext.Provider value={{ hideChrome, fullBleed, backTo, topTitle }}>
      <TourProvider>
        <div className="flex min-h-screen">
          <AdminSidebar hidden={hideChrome} collapsed={collapsed} onCollapse={() => setCollapsedPref(true)} />
          {!hideChrome && collapsed && (
            <IconButton
              size="sm"
              aria-label="Afficher le menu"
              className="fixed left-2 top-2 z-30 hidden md:inline-flex print:hidden"
              onClick={() => setCollapsedPref(false)}
              icon={<ChevronsRight />}
            />
          )}
          <main className={`flex-1 min-w-0 bg-background ${phoneTop} ${padding}`}>
            <Outlet
              context={{ fullBleed, setFullBleed, hideChrome, setHideChrome, backTo, setBackTo, topTitle, setTopTitle } satisfies AdminLayoutContext}
            />
          </main>
        </div>
      </TourProvider>
    </ChromeContext.Provider>
  );
}
