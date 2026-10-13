import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Toaster } from "@/components/Toaster";
import { Property, PropertyList } from "@/components/ui";
import NewClientDialog from "@/components/admin/NewClientDialog";
import "./index.css";

const v = new URLSearchParams(location.search).get("v") ?? "dialog";
const existing = [{ clientId: "c1", name: "Dupont" }, { clientId: "c2", name: "Hoona" }];

function Preview() {
  const [open, setOpen] = useState(v !== "menu");
  const [clientId, setClientId] = useState("c2");
  return (
    <div className="p-6">
      <PropertyList>
        <Property icon={Building2} label="Client" kind="relation" value={clientId} options={existing.map((c) => ({ value: c.clientId, label: c.name }))} allowEmpty placeholder="Aucun client" createLabel="+ Nouveau client" onSave={(id) => setClientId(id)} onCreateNew={(q) => { console.log("create", q); setOpen(true); }} />
        <Property icon={Building2} label="Sans création" kind="relation" value={clientId} options={existing.map((c) => ({ value: c.clientId, label: c.name }))} allowEmpty placeholder="Aucun client" onSave={(id) => setClientId(id)} />
      </PropertyList>
      <NewClientDialog
        open={open}
        onClose={() => setOpen(false)}
        initial={{ name: v === "dup" ? "dupont" : "", kind: "particulier", contactName: "Marie Dupont", phone: "0470 12 34 56", email: "marie@example.com" }}
        existing={existing}
        onCreated={(c) => { console.log("created", c); }}
        onLinkExisting={(id) => { console.log("link", id); setClientId(id); }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><BrowserRouter><Toaster /><Preview /></BrowserRouter></StrictMode>,
);
