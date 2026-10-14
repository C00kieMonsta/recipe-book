// Temporary preview entry for AttachmentsSection screenshots; deleted after the build step.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import type { AppEvent } from "@packages/types";
import { Toaster } from "@/components/Toaster";
import AttachmentsSection from "@/components/admin/AttachmentsSection";
import { api } from "@/lib/api";
import "./index.css";

function Preview() {
  const id = new URLSearchParams(window.location.search).get("event") ?? "";
  const [event, setEvent] = useState<AppEvent | null>(null);
  useEffect(() => { void api.events.get(id).then(setEvent); }, [id]);
  if (!event) return null;
  return (
    <div className="mx-auto max-w-doc p-6">
      <h1 className="text-h1">{event.name}</h1>
      <AttachmentsSection event={event} onChange={setEvent} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Toaster />
      <Preview />
    </BrowserRouter>
  </StrictMode>,
);
