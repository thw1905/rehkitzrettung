import { NextRequest } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET(_req: NextRequest) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return new Response("Nicht angemeldet.", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const safeEnqueue = (text: string) => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      safeEnqueue(`event: connected\ndata: {"ok":true}\n\n`);

      const interval = setInterval(() => {
        safeEnqueue(`event: ping\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);
      }, 15000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);

        try {
          controller.close();
        } catch {
          // ignorieren
        }
      };

      // Bei Verbindungsende sauber schließen
      // @ts-ignore
      if (typeof _req.signal?.addEventListener === "function") {
        _req.signal.addEventListener("abort", close);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}