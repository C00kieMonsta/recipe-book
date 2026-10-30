import PlanningOptimizer from "@/pages/admin/PlanningOptimizer";
import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { addDays, isoWeekOf, weekdayOf } from "@packages/types";
import { todayIso } from "@/lib/dates";
import LoginPage from "@/pages/LoginPage";
import AdminLayout from "@/components/admin/AdminLayout";
import Week from "@/pages/admin/Week";
import WeekPrintPage from "@/pages/admin/WeekPrintPage";
import Day from "@/pages/admin/Day";
import PrepSheet from "@/pages/admin/PrepSheet";
import Recipes from "@/pages/admin/Recipes";
import RecipeDetail from "@/pages/admin/RecipeDetail";
import RecipeEditor from "@/pages/admin/RecipeEditor";
import RecipeCook from "@/pages/admin/RecipeCook";
import Ingredients from "@/pages/admin/Ingredients";
import IngredientDuplicates from "@/pages/admin/IngredientDuplicates";
import IngredientPrices from "@/pages/admin/IngredientPrices";
import Events from "@/pages/admin/Events";
import EventEditor from "@/pages/admin/EventEditor";
import EventDetail from "@/pages/admin/EventDetail";
import GroceryListPage from "@/pages/admin/GroceryListPage";
import Clients from "@/pages/admin/Clients";
import ClientDetail from "@/pages/admin/ClientDetail";
import Offers from "@/pages/admin/Offers";
import OfferDetail from "@/pages/admin/OfferDetail";
import Devis from "@/pages/admin/Devis";
import ComptesLayout from "@/pages/admin/comptes/ComptesLayout";
import Journal from "@/pages/admin/comptes/Journal";
import Apercu from "@/pages/admin/comptes/Apercu";
import Resultats from "@/pages/admin/comptes/Resultats";
import Previsionnel from "@/pages/admin/comptes/Previsionnel";
import AuReel from "@/pages/admin/comptes/AuReel";
import Settings from "@/pages/admin/Settings";
import Stock from "@/pages/admin/Stock";

const AFacturer = lazy(() => import("@/pages/admin/comptes/AFacturer"));
const Equipe = lazy(() => import("@/pages/admin/comptes/Equipe"));
const InvoiceInbox = lazy(() => import("@/pages/admin/comptes/InvoiceInbox"));
const OfferDocuments = lazy(() => import("@/pages/admin/OfferDocuments"));
const OfferDocumentDetail = lazy(() => import("@/pages/admin/OfferDocumentDetail"));

const lazyFallback = (
  <p className="text-base text-muted-foreground">Chargement…</p>
);

const LAST_WEEK_KEY = "recipe-book:last-week";

// Sunday is the planning day, so it opens on the coming week.
function planningWeek(): string {
  const today = todayIso();
  return weekdayOf(today) === 7 ? isoWeekOf(addDays(today, 1)) : isoWeekOf(today);
}

// The stored week may carry its own query string; the incoming one (?assistant=open) wins on a clash.
function withSearch(path: string, search: string): string {
  if (!search) return path;
  const [base, stored = ""] = path.split("?");
  const params = new URLSearchParams(stored);
  new URLSearchParams(search).forEach((value, key) => params.set(key, value));
  const merged = params.toString();
  return merged ? `${base}?${merged}` : base;
}

function HomeRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/semaine/${planningWeek()}${search}`} replace />;
}

function WeekIndexRedirect() {
  const { search } = useLocation();
  const last = sessionStorage.getItem(LAST_WEEK_KEY);
  return (
    <Navigate to={withSearch(last && last.startsWith("/semaine/") ? last : `/semaine/${planningWeek()}`, search)} replace />
  );
}

// Drops ?assistant=open once the sheet has read it, so a week link or the stored last week does not reopen it.
function AssistantParamCleanup() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("assistant")) return;
    params.delete("assistant");
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace: true, state: location.state });
  }, [location, navigate]);
  return null;
}

function TodayRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/jour/${todayIso()}${search}`} replace />;
}

export default function App() {
  return (
    <>
      <AssistantParamCleanup />
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recipes/:id/cook" element={<RecipeCook />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/semaine" element={<WeekIndexRedirect />} />
        <Route path="/semaine/:isoWeek" element={<Week />} />
        <Route path="/semaine/:isoWeek/imprimer" element={<WeekPrintPage />} />
        <Route path="/jour/aujourdhui" element={<TodayRedirect />} />
        <Route path="/jour/:date" element={<Day />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/new" element={<RecipeEditor />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/ingredients/doublons" element={<IngredientDuplicates />} />
        <Route path="/ingredients/prix" element={<IngredientPrices />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<EventEditor />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/edit" element={<EventEditor />} />
        <Route path="/events/:eventId/lines/:lineId" element={<PrepSheet />} />
        <Route path="/grocery-list" element={<GroceryListPage />} />
        <Route path="/stock" element={<Stock />} />
          <Route
            path="/planning/optimisation"
            element={<PlanningOptimizer />}
          />
          <Route path="/clients" element={<Clients />} />
        <Route path="/clients/new" element={<ClientDetail />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/offres" element={<Offers />} />
        <Route path="/offres/documents" element={<Suspense fallback={lazyFallback}><OfferDocuments /></Suspense>} />
        <Route path="/offres/documents/:id" element={<Suspense fallback={lazyFallback}><OfferDocumentDetail /></Suspense>} />
        <Route path="/offres/:id" element={<OfferDetail />} />
        <Route path="/devis" element={<Devis />} />
        <Route path="/comptes" element={<Navigate to="/comptes/journal" replace />} />
        <Route path="/comptes" element={<ComptesLayout />}>
          <Route path="journal" element={<Journal />} />
          <Route
            path="depot"
            element={
              <Suspense fallback={<p className="text-base text-muted-foreground">
                      Chargement…
                    </p>}>
                <InvoiceInbox />
              </Suspense>
            }
          />
          <Route
            path="a-facturer"
            element={
              <Suspense fallback={<p className="text-base text-muted-foreground">
                      Chargement…
                    </p>}>
                <AFacturer />
              </Suspense>
            }
          />
          <Route path="apercu" element={<Apercu />} />
          <Route path="resultats" element={<Resultats />} />
          <Route path="previsionnel" element={<Previsionnel />} />
          <Route path="au-reel" element={<AuReel />} />
          <Route
            path="equipe"
            element={
              <Suspense fallback={<p className="text-base text-muted-foreground">
                      Chargement…
                    </p>}>
                <Equipe />
              </Suspense>
            }
          />
        </Route>
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
