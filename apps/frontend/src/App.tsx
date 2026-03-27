import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import AdminLayout from "@/components/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import Recipes from "@/pages/admin/Recipes";
import RecipeDetail from "@/pages/admin/RecipeDetail";
import RecipeEditor from "@/pages/admin/RecipeEditor";
import RecipeCook from "@/pages/admin/RecipeCook";
import Ingredients from "@/pages/admin/Ingredients";
import Events from "@/pages/admin/Events";
import EventEditor from "@/pages/admin/EventEditor";
import EventDetail from "@/pages/admin/EventDetail";
import GroceryListPage from "@/pages/admin/GroceryListPage";
import Settings from "@/pages/admin/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/recipes/:id/cook" element={<RecipeCook />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/new" element={<RecipeEditor />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/ingredients" element={<Ingredients />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/new" element={<EventEditor />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/edit" element={<EventEditor />} />
        <Route path="/grocery-list" element={<GroceryListPage />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
