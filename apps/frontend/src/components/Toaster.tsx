import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Button, { IconButton } from "@/components/ui/Button";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-lg bg-background py-2 pl-3 pr-1 text-sm shadow-dialog animate-pop",
            toast.variant === "destructive" && "text-danger",
          )}
        >
          <div className="min-w-0 flex-1 py-1">
            <p className="font-medium">{toast.title}</p>
            {toast.description && <p className="text-muted-foreground">{toast.description}</p>}
          </div>
          {toast.action && (
            <Button variant="link" size="sm" onClick={() => { dismiss(toast.id); toast.action?.onClick(); }}>{toast.action.label}</Button>
          )}
          <IconButton size="sm" aria-label="Fermer" onClick={() => dismiss(toast.id)} icon={<X />} />
        </div>
      ))}
    </div>
  );
}
