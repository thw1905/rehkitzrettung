"use client";

import { useEffect, useRef, useState } from "react";

const PHONE_NUMBER = "01777866916";
const WHATSAPP_NUMBER = "491777866916";
const DEFAULT_MESSAGE = encodeURIComponent(
  "Hallo, ich habe ein Problem mit der Rehkitzrettung-App und brauche Hilfe."
);

export default function SupportContactButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const callLink = `tel:${PHONE_NUMBER}`;
  const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${DEFAULT_MESSAGE}`;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-orange-300 bg-orange-50 text-sm text-orange-900 transition hover:bg-orange-100"
title="Hilfe / Problem?"
>
  ❓
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 text-sm font-semibold text-gray-900">
            Unterstützung kontaktieren
          </div>

          <div className="space-y-2">
            <a
              href={callLink}
              className="block rounded-xl border px-3 py-3 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
            >
              📞 Anrufen
            </a>

            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-green-300 bg-green-50 px-3 py-3 text-sm font-medium text-green-900 transition hover:bg-green-100"
            >
              💬 WhatsApp schreiben
            </a>
          </div>
        </div>
      )}
    </div>
  );
}