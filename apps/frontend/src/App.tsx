import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import AdminLayout from "@/components/admin/AdminLayout";
import Recipes from "@/pages/admin/Recipes";
import RecipeDetail from "@/pages/admin/RecipeDetail";
import RecipeEditor from "@/pages/admin/RecipeEditor";
import Ingredients from "@/pages/admin/Ingredients";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/recipes/new" element={<RecipeEditor />} />
        <Route path="/recipes/:id/edit" element={<RecipeEditor />} />
        <Route path="/ingredients" element={<Ingredients />} />
      </Route>
      <Route path="*" element={<Navigate to="/recipes" replace />} />
    </Routes>
  );
}
