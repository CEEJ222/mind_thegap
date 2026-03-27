"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface SnackbarMessage {
  id: string;
  text: string;
  type: "success" | "error" | "info";
}

let addSnackbar: (text: string, type?: "success" | "error" | "info") => void;

export function showSnackbar(text: string, type: "success" | "error" | "info" = "success") {
  addSnackbar?.(text, type);
}

export function SnackbarProvider() {
  const [messages, setMessages] = useState<SnackbarMessage[]>([]);

  useEffect(() => {
    addSnackbar = (text, type = "success") => {
      const id = Math.random().toString(36).slice(2);
      setMessages((prev) => [...prev, { id, text, type }]);
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }, 4000);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-3 text-sm text-white shadow-lg transition-all animate-in slide-in-from-bottom-2",
            {
              "bg-accent": msg.type === "success",
              "bg-error": msg.type === "error",
              "bg-card text-foreground border border-border": msg.type === "info",
            }
          )}
        >
          <span>{msg.text}</span>
          <button
            onClick={() =>
              setMessages((prev) => prev.filter((m) => m.id !== msg.id))
            }
            className="ml-2 opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
