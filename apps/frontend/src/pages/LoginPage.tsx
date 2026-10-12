import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FieldLabel } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const success = await login(email, password, remember);
    if (success) {
      navigate("/");
    } else {
      toast({ title: "Identifiants invalides", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="card-elevated w-full max-w-md p-8 animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center mb-4">
            <span className="text-h2 font-bold text-primary-foreground">A</span>
          </div>
          <h1 className="text-h2 font-bold">La Table d'Amélie</h1>
          <p className="text-base text-muted-foreground mt-1">Connexion</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <input id="email" type="email" autoComplete="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="input-field pr-12" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button
                type="button"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-base">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-input accent-primary"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Rester connecté sur cet appareil
          </label>
          <button type="submit" className="w-full min-h-11 bg-primary text-primary-foreground rounded-lg text-base font-semibold shadow-sm hover:opacity-90 transition-opacity">
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
