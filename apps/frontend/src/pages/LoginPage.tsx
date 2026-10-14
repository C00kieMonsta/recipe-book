import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { safeReturn } from "@/lib/safe-return";
import { Button, Checkbox, FieldLabel, IconButton } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const success = await login(email, password, remember);
    if (success) {
      const target = safeReturn(new URLSearchParams(search).get("next")) ?? "/";
      navigate(target, { replace: true });
    } else {
      setError("Identifiants invalides");
      toast({ title: "Identifiants invalides", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[320px] px-6 pt-[14vh]">
        <div className="flex flex-col items-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-base font-semibold" aria-hidden="true">A</span>
          <h1 className="mt-3 text-h2">La Table d'Amélie</h1>
          <p className="mt-1 text-base text-muted-foreground">Connexion</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <input id="email" type="email" autoComplete="email" className="input-field h-9 touch:h-11" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="input-field h-9 pr-10 touch:h-11 touch:pr-12" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <IconButton
                size="lg"
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-0 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword(!showPassword)}
                icon={showPassword ? <EyeOff /> : <Eye />}
              />
            </div>
          </div>
          <Checkbox checked={remember} onChange={setRemember} label="Rester connecté sur cet appareil" className="-mx-1 w-full justify-start" />
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Se connecter
          </Button>
        </form>
      </div>
    </div>
  );
}
