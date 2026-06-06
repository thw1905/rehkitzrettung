"use client";

import { useEffect, useMemo, useState } from "react";

type HelpArticle = {
  id: string;
  slug: string;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type HelpResponse = {
  articles: HelpArticle[];
  error?: string;
};

function renderHelpContent(content: string) {
  const lines = content.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(keyPrefix: string) {
    if (listItems.length === 0) return;

    elements.push(
      <ul key={`${keyPrefix}-list-${elements.length}`} className="list-disc space-y-1 pl-5">
        {listItems.map((item, index) => (
          <li key={`${keyPrefix}-li-${index}`}>{renderInlineContent(item, `${keyPrefix}-li-${index}`)}</li>
        ))}
      </ul>
    );

    listItems = [];
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      flushList(String(index));
      return;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2).trim());
      return;
    }

    flushList(String(index));

    const imageMatch = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      const alt = imageMatch[1] || "Screenshot";
      const src = imageMatch[2] || "";

      elements.push(
        <figure key={index} className="my-5">
          <img
            src={src}
            alt={alt}
            className="w-full rounded-2xl border border-gray-200 shadow-sm"
          />
          <figcaption className="mt-2 text-xs text-gray-500">{alt}</figcaption>
        </figure>
      );
      return;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={index} className="mt-4 text-base font-bold text-gray-900">
          {line.slice(4)}
        </h4>
      );
      return;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={index} className="mt-5 text-lg font-bold text-gray-900">
          {line.slice(3)}
        </h3>
      );
      return;
    }

    if (line.startsWith("# ")) {
      elements.push(
        <h3 key={index} className="mt-5 text-xl font-bold text-gray-900">
          {line.slice(2)}
        </h3>
      );
      return;
    }

    elements.push(
      <p key={index} className="leading-7">
        {renderInlineContent(line, String(index))}
      </p>
    );
  });

  flushList("end");

  return elements;
}

function renderInlineContent(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="font-bold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

export default function HelpPageClient() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadHelp() {
    setLoading(true);

    try {
      const res = await fetch("/api/help", {
        cache: "no-store",
      });

      const json: HelpResponse = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Hilfe konnte nicht geladen werden.");
      }

      setArticles(Array.isArray(json.articles) ? json.articles : []);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hilfe konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHelp();
  }, []);

  const hasArticles = articles.length > 0;

  const toc = useMemo(
    () =>
      articles.map((article, index) => ({
        id: article.slug || article.id,
        title: article.title,
        index: index + 1,
      })),
    [articles]
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body {
            background: white !important;
          }

          .no-print {
            display: none !important;
          }

          section {
            break-inside: avoid;
            page-break-inside: avoid;
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
          }

          img {
            max-height: 180mm;
            object-fit: contain;
          }
        }
      `}</style>

      <div className="mx-auto max-w-6xl space-y-5 print:max-w-none">
        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow md:p-7 print:bg-white print:text-gray-900">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-4xl">
                Bedienungsanleitung Rehkitzrettung
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-slate-100 md:text-base print:text-gray-700">
                Anleitung für Admins, Piloten, Sucher und den Ablauf mit
                Landwirten, Flächen, Mähanfragen, Aufträgen, Pinpoints und Statistik.
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="no-print rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-900"
            >
              Drucken / als PDF speichern
            </button>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Hilfe wird geladen...
          </section>
        ) : !hasArticles ? (
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-xl font-bold text-gray-900">
              Noch keine Hilfe-Kapitel vorhanden
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              Ein Admin kann unter <strong>/admin/help</strong> die ersten Kapitel anlegen.
            </p>
          </section>
        ) : (
          <>
            <section className="no-print rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
              <h2 className="text-xl font-bold text-gray-900">Inhaltsverzeichnis</h2>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {toc.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                  >
                    {item.index}. {item.title}
                  </a>
                ))}
              </div>
            </section>

            {articles.map((article, index) => (
              <section
                key={article.id}
                id={article.slug || article.id}
                className="scroll-mt-24 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6"
              >
                <h2 className="text-xl font-bold text-gray-900 md:text-2xl">
                  {index + 1}. {article.title}
                </h2>

                <div className="mt-4 space-y-4 text-sm leading-6 text-gray-700 md:text-base">
                  {renderHelpContent(article.content)}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  );
}