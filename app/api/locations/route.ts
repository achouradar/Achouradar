import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ suggestions: [] });

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return NextResponse.json({ error: "SerpApi não configurada." }, { status: 503 });

  const params = new URLSearchParams({
    engine: "google_flights_autocomplete",
    api_key: apiKey,
    q,
    gl: "br",
    hl: "pt-BR",
    exclude_regions: "false",
  });

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    return NextResponse.json({ error: data.error ?? "Não foi possível buscar localidades." }, { status: 502 });
  }

  const suggestions = (data.suggestions ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    description: item.description,
    airports: (item.airports ?? []).map((airport: any) => ({
      id: airport.id,
      name: airport.name,
      city: airport.city,
      cityId: airport.city_id,
    })),
  }));

  return NextResponse.json({ suggestions });
}
