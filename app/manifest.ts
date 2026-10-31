import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rehkitzrettung",
    short_name: "Rehkitz",
    description: "Einsatz- und Flächenverwaltung für die Rehkitzrettung",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#16a34a",
    orientation: "portrait",
    lang: "de-DE",
    icons: [
      {
        src: "/rehkitz-app-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/rehkitz-app-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    
      {
        src: "/rehkitz-app-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}