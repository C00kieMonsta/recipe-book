import { Routes, Route, Navigate } from "react-router-dom";
import { isoWeekOf } from "@packages/types";
import { todayIso } from "@/lib/dates";
import LoginPage from "@/pages/LoginPage";
import AdminLayout from "@/components/admin/AdminLayout";
import Week from "@/pages/admin/Week";
import Day from "@/pages/admin/Day";
import PrepSheet from "@/pages/admin/PrepSheet";
import Recipes from "@/pages/admin/Recipes";
import RecipeDetail from "@/pages/admin/RecipeDetail";
import RecipeEditor from "@/pages/admin/RecipeEditor";
import RecipeCook from "@/pages/admin/RecipeCook";
import Ingredients from "@/pages/admin/Ingredients";
import IngredientDuplicates from "@/pages/admin/IngredientDuplicates";
import Events from "@/pages/admin/Events";
import EventEditor from "@/pages/admin/EventEditor";
import EventDetail from "@/pages/admin/EventDetail";
import GroceryListPage from "@/pages/admin/GroceryListPage";
import Clients from "@/pages/admin/Clients";
import ClientDetail from "@/pages/admin/ClientDetail";
import ComptesLayout from "@/pages/admin/comptes/ComptesLayout";
import Journal from "@/pages/admin/comptes/Journal";
import Apercu from "@/pages/admin/comptes/Apercu";
import Resultats from "@/pages/admin/comptes/Resultats";
import Previsionnel from "@/pages/admin/comptes/Previsionnel";
import AuReel from "@/pages/admin/comptes/AuReel";
import Settings from "@/pages/admin/Settings";

function HomeRedirect() {
  return <Navigate to={`/semaine/${isoWeekOf(todayIso())}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recipes/:id/cook" element={<RecipeCook />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/semaine/:isoWeek" element={<Week />} />
        <Route path="/jour/:date" element={<Day />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/new" element={<RecipeEditor />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/ingredients/doublons" element={<IngredientDuplicates />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<EventEditor />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/edit" element={<EventEditor />} />
        <Route path="/events/:eventId/lines/:lineId" element={<PrepSheet />} />
        <Route path="/grocery-list" element={<GroceryListPage />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/new" element={<ClientDetail />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/comptes" element={<Navigate to="/comptes/journal" replace />} />
        <Route path="/comptes" element={<ComptesLayout />}>
          <Route path="journal" element={<Journal />} />
          <Route path="apercu" element={<Apercu />} />
          <Route path="resultats" element={<Resultats />} />
          <Route path="previsionnel" element={<Previsionnel />} />
          <Route path="au-reel" element={<AuReel />} />
        </Route>
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
