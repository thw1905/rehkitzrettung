"use client";

export default function TestTouchPage() {
  return (
    <main className="min-h-screen bg-red-100 p-8">
      <button
        type="button"
        onClick={() => alert("Touch geht")}
        className="rounded-xl bg-black px-6 py-4 text-white"
      >
        Touch testen
      </button>
    </main>
  );
}