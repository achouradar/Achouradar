import type { FlightOffer, FlightProvider, FlightSearchRequest } from "./types";

type SerpApiFlight = {
  flights?: Array<{
    departure_airport?: { id?: string; name?: string; time?: string };
    arrival_airport?: { id?: string; name?: string; time?: string };
    duration?: number;
    airline?: string;
  }>;
  layovers?: Array<{ name?: string; duration?: number; overnight?: boolean }>;
  total_duration?: number;
  carbon_emissions?: { this_flight?: number; typical_for_this_route?: number; difference_percent?: number };
  price?: number;
};

type SerpApiResponse = {
  best_flights?: SerpApiFlight[];
  other_flights?: SerpApiFlight[];
  search_metadata?: { google_flights_url?: string; status?: string };
  price_insights?: {
    lowest_price?: number;
    price_level?: "low" | "typical" | "high";
    typical_price_range?: number[];
  };
  error?: string;
};

async function normalizeLocation(value: string, apiKey: string) {
  const trimmed = value.trim();
  if (/^\/[mg]\//.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]{3}(,[a-zA-Z]{3})*$/.test(trimmed)) return trimmed.toUpperCase();

  // Resolve nomes digitados diretamente, sem exigir que o usuário escolha
  // uma sugestão do autocomplete. Isso mantém a experiência global.
  const params = new URLSearchParams({
    engine: "google_flights_autocomplete",
    api_key: apiKey,
    q: trimmed,
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
    throw new Error(`Não consegui identificar "${trimmed}" como cidade ou aeroporto.`);
  }

  const cityOrAirport = (data.suggestions ?? []).find((item: any) =>
    item.type === "city" || (item.airports?.length ?? 0) > 0
  );
  if (!cityOrAirport?.id) {
    throw new Error(`Não consegui identificar "${trimmed}" como cidade ou aeroporto.`);
  }

  return cityOrAirport.id as string;
}

function getApiKey() {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("A chave da SerpApi não está configurada no Railway.");
  return key;
}

function extractFlights(data: SerpApiResponse) {
  return [...(data.best_flights ?? []), ...(data.other_flights ?? [])];
}

function toOffer(item: SerpApiFlight, index: number, request: FlightSearchRequest, insights: SerpApiResponse["price_insights"], bookingUrl?: string): FlightOffer | null {
  const first = item.flights?.[0];
  const last = item.flights?.[item.flights.length - 1];
  if (!first?.departure_airport?.time || !last?.arrival_airport?.time || !item.price) return null;

  const stops = Math.max(0, (item.flights?.length ?? 1) - 1);
  const durationMinutes = Number(item.total_duration ?? item.flights?.reduce((sum, flight) => sum + Number(flight.duration ?? 0), 0) ?? 0);
  const direct = stops === 0;
  const airline = first.airline;
  const layovers = (item.layovers ?? []).map((layover) => layover.name).filter((name): name is string => Boolean(name));
  const price = Number(item.price);

  const budgetFactor = request.budget > 0 ? Math.min(1, price / request.budget) : 0.5;
  const priceScore = Math.max(0, 100 - budgetFactor * 40);
  const stopScore = direct ? 100 : stops === 1 ? 70 : Math.max(30, 70 - (stops - 1) * 20);
  const durationScore = durationMinutes > 0
    ? Math.max(10, 100 - Math.max(0, durationMinutes - 120) / 18)
    : 50;
  // O score mede custo-benefício, não apenas preço: preço, duração e escalas.
  // Isso evita que um voo muito mais demorado pareça equivalente ao menor preço.
  const score = Math.max(0, Math.min(100, Math.round(
    priceScore * 0.45 + durationScore * 0.35 + stopScore * 0.20
  )));

  const typical = insights?.typical_price_range;
  const typicalRange: [number, number] | undefined =
    typical && typical.length >= 2 ? [Number(typical[0]), Number(typical[1])] : undefined;

  return {
    id: `serpapi-${index}-${first.departure_airport.id ?? request.origin}-${last.arrival_airport.id ?? request.destination ?? "any"}`,
    origin: first.departure_airport.name ?? request.origin,
    destination: last.arrival_airport.name ?? request.destination ?? "Destino",
    departureDate: first.departure_airport.time,
    returnDate: request.returnDate,
    price,
    currency: "BRL",
    score,
    bookingUrl,
    priceLevel: insights?.price_level,
    lowestPrice: insights?.lowest_price,
    typicalPriceRange: typicalRange,
    airline,
    durationMinutes,
    stops,
    direct,
    layovers,
  };
}

export class SerpApiFlightProvider implements FlightProvider {
  async search(request: FlightSearchRequest): Promise<FlightOffer[]> {
    if (!request.destination) throw new Error("Informe o destino para a primeira busca de voos.");
    if (!request.departureDate) throw new Error("Informe a data de ida para buscar voos.");
    if (request.returnDate && request.returnDate < request.departureDate) throw new Error("A data de volta precisa ser posterior à data de ida.");

    const isRoundTrip = Boolean(request.returnDate);
    const budget = Number(request.budget);
    const baseParams = {
      engine: "google_flights",
      api_key: getApiKey(),
      departure_id: await normalizeLocation(request.origin, getApiKey()),
      arrival_id: await normalizeLocation(request.destination, getApiKey()),
      type: isRoundTrip ? "1" : "2",
      outbound_date: request.departureDate,
      currency: "BRL",
      hl: "pt-BR",
      gl: "br",
    };

    async function runSearch(deepSearch: boolean, maxPrice?: number) {
      const params = new URLSearchParams(baseParams);
      if (deepSearch) params.set("deep_search", "true");
      const effectiveMaxPrice = maxPrice ?? (budget > 0 ? budget : undefined);
      if (effectiveMaxPrice && effectiveMaxPrice > 0) params.set("max_price", String(Math.floor(effectiveMaxPrice)));
      if (isRoundTrip) params.set("return_date", request.returnDate!);

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const raw = await response.text();
      let data: SerpApiResponse = {};
      try { data = JSON.parse(raw) as SerpApiResponse; } catch {}
      if (!response.ok) throw new Error(`SerpApi HTTP ${response.status}: ${data.error || raw.slice(0, 300) || "requisição inválida"}`);
      if (data.error) throw new Error(`SerpApi: ${data.error}`);
      return data;
    }

    let data: SerpApiResponse;
    try {
      data = await runSearch(true);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("hasn't returned any results") && !message.includes("no results")) throw error;
      // Deep search can occasionally return no results even when the standard
      // Google Flights query works. Retry without the budget cap before giving up.
      try {
        data = await runSearch(false);
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message.toLowerCase() : "";
        if (!fallbackMessage.includes("hasn't returned any results") && !fallbackMessage.includes("no results")) throw fallbackError;
        data = await runSearch(false, undefined);
      }
    }

    if (!extractFlights(data).length && budget > 0) {
      data = await runSearch(true, undefined);
      if (!extractFlights(data).length) data = await runSearch(false, undefined);
    }

    // Preserve the original market price intelligence. A targeted search can
    // return a narrower insight and must not replace the route-level reference.
    const originalInsights = data.price_insights;
    const originalBookingUrl = data.search_metadata?.google_flights_url;
    const insightLowest = originalInsights?.lowest_price;

    if (insightLowest && !extractFlights(data).some((flight) => Number(flight.price) <= insightLowest)) {
      const targeted = await runSearch(true, insightLowest);
      if (extractFlights(targeted).length) {
        data = {
          ...data,
          best_flights: [...(targeted.best_flights ?? []), ...(data.best_flights ?? [])],
          other_flights: [...(targeted.other_flights ?? []), ...(data.other_flights ?? [])],
          price_insights: originalInsights,
          search_metadata: { ...data.search_metadata, google_flights_url: originalBookingUrl },
        };
      }
    }

    const allOffers = extractFlights(data)
      .map((item, index) => toOffer(item, index, request, originalInsights, originalBookingUrl))
      .filter((offer): offer is FlightOffer => Boolean(offer))
      .sort((a, b) => a.price - b.price);

    const withinBudget = budget > 0
      ? allOffers.filter((offer) => offer.price <= budget)
      : allOffers;

    // Se houver opções dentro do orçamento, mostramos elas.
    // Se não houver, ainda mostramos a mais barata para que o semáforo
    // consiga informar "🔴 PREÇO ALTO" em vez de esconder o resultado.
    const offers = (withinBudget.length ? withinBudget : allOffers).slice(0, 10);

    if (!offers.length) throw new Error("O Google Flights não encontrou voos para esses critérios. Tente mudar a data ou o destino.");
    return offers;
  }
}
