export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-bold">Offline</h1>
        <p className="mt-3 text-gray-700">
          Du bist gerade ohne Internet unterwegs.
        </p>
        <p className="mt-2 text-gray-700">
          Bereits besuchte Seiten wie „Meine Aufträge“ oder „Dashboard“ können
          oft trotzdem geöffnet werden.
        </p>
        <p className="mt-2 text-gray-700">
          Sobald wieder eine Verbindung da ist, werden aktuelle Daten neu
          geladen.
        </p>
      </div>
    </main>
  );
}