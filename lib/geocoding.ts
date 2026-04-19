export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName?: string;
};

export async function geocodeAddress(params: {
  street: string;
  zip: string;
  city: string;
  country?: string;
}): Promise<GeocodeResult | null> {
  const street = params.street.trim();
  const zip = params.zip.trim();
  const city = params.city.trim();
  const country = (params.country || "Deutschland").trim();

  const query = [street, zip, city, country].filter(Boolean).join(", ");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "rehkitzrettung/1.0",
      "Accept-Language": "de",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Geocoding fehlgeschlagen.");
  }

  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
  }>;

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    displayName: first.display_name,
  };
}