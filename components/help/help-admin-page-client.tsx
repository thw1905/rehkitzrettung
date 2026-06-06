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

type EditableArticle = HelpArticle & {
  editedTitle: string;
  editedContent: string;
  editedSortOrder: string;
  editedIsActive: boolean;
};

type HelpResponse = {
  articles: HelpArticle[];
  error?: string;
};

const emptyForm = {
  title: "",
  content: "",
  sortOrder: "0",
  isActive: true,
};

function prepareArticle(article: HelpArticle): EditableArticle {
  return {
    ...article,
    editedTitle: article.title,
    editedContent: article.content || "",
    editedSortOrder: String(article.sortOrder || 0),
    editedIsActive: article.isActive,
  };
}

export default function HelpAdminPageClient() {
  const [articles, setArticles] = useState<EditableArticle[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<"new" | string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  async function loadArticles() {
    setLoading(true);

    try {
      const res = await fetch("/api/admin/help", {
        cache: "no-store",
      });

      const json: HelpResponse = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Hilfe-Kapitel konnten nicht geladen werden.");
      }

      const nextArticles = Array.isArray(json.articles)
        ? json.articles.map(prepareArticle)
        : [];

      setArticles(nextArticles);
      setOpenArticleId((prev) => {
        if (prev && nextArticles.some((article) => article.id === prev)) {
          return prev;
        }

        return nextArticles[0]?.id || null;
      });
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hilfe-Kapitel konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadArticles();
  }, []);

  function appendMarkdownImageToNewArticle(markdown: string) {
    setForm((prev) => ({
      ...prev,
      content: prev.content.trim()
        ? `${prev.content.trim()}\n\n${markdown}`
        : markdown,
    }));
  }

  function appendMarkdownImageToArticle(articleId: string, markdown: string) {
    setArticles((prev) =>
      prev.map((article) =>
        article.id === articleId
          ? {
              ...article,
              editedContent: article.editedContent.trim()
                ? `${article.editedContent.trim()}\n\n${markdown}`
                : markdown,
            }
          : article
      )
    );
  }

  async function uploadHelpImage(file: File, target: "new" | string) {
    setUploadingFor(target);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/help/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Bild konnte nicht hochgeladen werden.");
      }

      const markdown = json.markdown || `![Screenshot](${json.url})`;

      if (target === "new") {
        appendMarkdownImageToNewArticle(markdown);
      } else {
        appendMarkdownImageToArticle(target, markdown);
      }

      setUploadMessage("Bild wurde hochgeladen und in den Text eingefügt.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Bild konnte nicht hochgeladen werden.");
    } finally {
      setUploadingFor(null);
    }
  }

  function updateLocalArticle(
    id: string,
    changes: Partial<
      Pick<
        EditableArticle,
        "editedTitle" | "editedContent" | "editedSortOrder" | "editedIsActive"
      >
    >
  ) {
    setArticles((prev) =>
      prev.map((article) =>
        article.id === id
          ? {
              ...article,
              ...changes,
            }
          : article
      )
    );
  }

  async function createArticle() {
    const title = form.title.trim();

    if (!title) {
      alert("Bitte einen Titel eingeben.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/admin/help", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content: form.content,
          sortOrder: Number(form.sortOrder || 0),
          isActive: form.isActive,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Hilfe-Kapitel konnte nicht angelegt werden.");
      }

      setForm(emptyForm);
      await loadArticles();
      alert("Hilfe-Kapitel wurde angelegt.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hilfe-Kapitel konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  async function saveArticle(article: EditableArticle) {
    const title = article.editedTitle.trim();

    if (!title) {
      alert("Bitte einen Titel eingeben.");
      return;
    }

    setSavingId(article.id);

    try {
      const res = await fetch(`/api/admin/help/${article.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content: article.editedContent,
          sortOrder: Number(article.editedSortOrder || 0),
          isActive: article.editedIsActive,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Hilfe-Kapitel konnte nicht gespeichert werden.");
      }

      await loadArticles();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hilfe-Kapitel konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteArticle(article: EditableArticle) {
    const confirmed = window.confirm(
      `Hilfe-Kapitel "${article.title}" wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(article.id);

    try {
      const res = await fetch(`/api/admin/help/${article.id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Hilfe-Kapitel konnte nicht gelöscht werden.");
      }

      await loadArticles();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hilfe-Kapitel konnte nicht gelöscht werden.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredArticles = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return articles;

    return articles.filter((article) =>
      [
        article.title,
        article.slug,
        article.content,
        article.isActive ? "aktiv" : "inaktiv",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [articles, search]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow md:p-6">
          <h1 className="text-2xl font-bold md:text-3xl">
            Hilfe bearbeiten
          </h1>
          <p className="mt-2 text-sm text-slate-100">
            Hier kannst du Kapitel der Bedienungsanleitung live bearbeiten. Änderungen sind sofort unter /hilfe sichtbar.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-xl font-bold text-gray-900">
            Neues Hilfe-Kapitel anlegen
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_140px]">
            <input
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="Titel, z. B. Auftrag manuell anlegen"
              className="rounded-xl border border-gray-300 px-3 py-3"
            />

            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sortOrder: event.target.value }))
              }
              placeholder="Reihenfolge"
              className="rounded-xl border border-gray-300 px-3 py-3"
            />

            <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Aktiv
            </label>
          </div>

          <textarea
            value={form.content}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, content: event.target.value }))
            }
            rows={8}
            placeholder={"Inhalt eingeben.\n\nÜberschriften mit # oder ##\nAufzählungen mit - Punkt\nBilder werden als ![Beschreibung](/uploads/help/bild.png) eingefügt."}
            className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-3 font-mono text-sm"
          />

          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-bold text-blue-950">
              Screenshot hochladen
            </div>
            <p className="mt-1 text-xs text-blue-900">
              Nach dem Hochladen wird der Bildcode automatisch in den Text eingefügt.
            </p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploadingFor === "new"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) uploadHelpImage(file, "new");
              }}
              className="mt-3 w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm"
            />
          </div>

          {uploadMessage && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-900">
              {uploadMessage}
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={createArticle}
              disabled={creating}
              className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {creating ? "Speichert..." : "Kapitel anlegen"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            Suche
          </label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titel, Inhalt, aktiv, inaktiv ..."
            className="w-full rounded-xl border border-gray-300 px-3 py-3"
          />
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Hilfe-Kapitel werden geladen...
          </section>
        ) : filteredArticles.length === 0 ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Keine Hilfe-Kapitel gefunden.
          </section>
        ) : (
          <section className="space-y-3">
            {filteredArticles.map((article) => {
              const isOpen = openArticleId === article.id;

              const hasChanges =
                article.title !== article.editedTitle ||
                (article.content || "") !== article.editedContent ||
                String(article.sortOrder || 0) !== article.editedSortOrder ||
                article.isActive !== article.editedIsActive;

              return (
                <article
                  key={article.id}
                  className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenArticleId((prev) =>
                        prev === article.id ? null : article.id
                      )
                    }
                    className="flex w-full flex-col gap-2 p-4 text-left md:flex-row md:items-center md:justify-between md:p-5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">
                          {article.title}
                        </h2>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${
                            article.isActive
                              ? "border-green-300 bg-green-50 text-green-900"
                              : "border-gray-300 bg-gray-50 text-gray-700"
                          }`}
                        >
                          {article.isActive ? "aktiv" : "inaktiv"}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        Reihenfolge: {article.sortOrder} · Slug: {article.slug}
                      </div>
                    </div>

                    <div className="text-xl text-gray-500">
                      {isOpen ? "−" : "+"}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 p-4 md:p-5">
                      <div className="grid gap-3 md:grid-cols-[1fr_140px_140px]">
                        <input
                          value={article.editedTitle}
                          onChange={(event) =>
                            updateLocalArticle(article.id, {
                              editedTitle: event.target.value,
                            })
                          }
                          className="rounded-xl border border-gray-300 px-3 py-3"
                        />

                        <input
                          type="number"
                          value={article.editedSortOrder}
                          onChange={(event) =>
                            updateLocalArticle(article.id, {
                              editedSortOrder: event.target.value,
                            })
                          }
                          className="rounded-xl border border-gray-300 px-3 py-3"
                        />

                        <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-800">
                          <input
                            type="checkbox"
                            checked={article.editedIsActive}
                            onChange={(event) =>
                              updateLocalArticle(article.id, {
                                editedIsActive: event.target.checked,
                              })
                            }
                          />
                          Aktiv
                        </label>
                      </div>

                      <textarea
                        value={article.editedContent}
                        onChange={(event) =>
                          updateLocalArticle(article.id, {
                            editedContent: event.target.value,
                          })
                        }
                        rows={12}
                        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-3 font-mono text-sm"
                      />

                      <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <div className="text-sm font-bold text-blue-950">
                          Screenshot hochladen
                        </div>
                        <p className="mt-1 text-xs text-blue-900">
                          Nach dem Hochladen wird der Bildcode automatisch in den Text eingefügt.
                        </p>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingFor === article.id}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) uploadHelpImage(file, article.id);
                          }}
                          className="mt-3 w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm"
                        />
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => saveArticle(article)}
                          disabled={savingId === article.id || !hasChanges}
                          className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {savingId === article.id ? "Speichert..." : "Speichern"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteArticle(article)}
                          disabled={savingId === article.id}
                          className="rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 disabled:opacity-50"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}