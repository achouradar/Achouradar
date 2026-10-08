import type { FlightOffer, FlightProvider, FlightSearchRequest } from "./types";

type SerpApiFlight = {
  flights?: Array<{
    departure_airport?: { id?: string; name?: string; time?: string };
    arrival_airport?: { id?: string; name?: string; time?: string };
  }>;
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

const CITY_TO_IATA: Record<string, string> = {
  "porto alegre": "POA", salvador: "SSA", "sao paulo": "SAO", "são paulo": "SAO",
  "rio de janeiro": "RIO", brasilia: "BSB", "brasília": "BSB", curitiba: "CWB",
  florianopolis: "FLN", "florianópolis": "FLN", recife: "REC", fortaleza: "FOR",
  "belo horizonte": "BHZ", goiania: "GYN", "goiânia": "GYN", manaus: "MAO",
  belem: "BEL", "belém": "BEL", natal: "NAT", "joao pessoa": "JPA",
  "joão pessoa": "JPA", maceio: "MCZ", "maceió": "MCZ",
};

function normalizeLocation(value: string) {
  const trimmed = value.trim();
  const mapped = CITY_TO_IATA[trimmed.toLowerCase()];
  if (mapped) return mapped;
  if (/^[a-zA-Z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  throw new Error(`Não reconheci "${trimmed}". Use uma cidade conhecida ou o código IATA do aeroporto (ex.: POA, SSA, GRU).`);
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
  const price = Number(item.price);
  const score = Math.max(0, Math.min(100, Math.round(100 - (price / Math.max(request.budget, 1)) * 25 - stops * 5)));
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
  };
}

export class SerpApiFlightProvider implements FlightProvider {
  async search(request: FlightSearchRequest): Promise<FlightOffer[]> {
    if (!request.destination) throw new Error("Informe o destino para a primeira busca de voos.");
    if (!request.departureDate) throw new Error("Informe a data de ida para buscar voos.");
    if (request.returnDate && request.returnDate < request.departureDate) {
      throw new Error("A data de volta precisa ser posterior à data de ida.");
    }

    const isRoundTrip = Boolean(request.returnDate);
    const baseParams = {
      engine: "google_flights",
      api_key: getApiKey(),
      departure_id: normalizeLocation(request.origin),
      arrival_id: normalizeLocation(request.destination),
      type: isRoundTrip ? "1" : "2",
      outbound_date: request.departureDate,
      currency: "BRL",
      hl: "pt-BR",
      gl: "br",
    };

    async function runSearch(deepSearch: boolean, maxPrice?: number) {
      const params = new URLSearchParams(baseParams);
      if (deepSearch) params.set("deep_search", "true");
      if (maxPrice) params.set("max_price", String(Math.floor(maxPrice)));
      if (isRoundTrip) params.set("return_date", request.returnDate!);

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      const raw = await response.text();
      let data: SerpApiResponse = {};
      try {
        data = JSON.parse(raw) as SerpApiResponse;
      } catch {}

      if (!response.ok) {
        const detail = data.error || raw.slice(0, 300) || "requisição inválida";
        throw new Error(`SerpApi HTTP ${response.status}: ${detail}`);
      }

      if (data.error) throw new Error(`SerpApi: ${data.error}`);
      return data;
    }

    // Primeiro tentamos uma busca profunda. Se o Google Flights não retornar
    // resultados nesse modo, caímos para a busca padrão antes de mostrar erro.
    let data: SerpApiResponse;
    try {
      data = await runSearch(true);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("hasn't returned any results") && !message.includes("no results")) {
        throw error;
      }
      data = await runSearch(false);
    }

    if (!extractFlights(data).length) {
      data = await runSearch(false);
    }

    // Se o Google Flights indicar um menor preço abaixo dos voos retornados,
    // fazemos uma segunda busca limitada a esse preço para tentar localizar
    // o voo correspondente, em vez de apenas exibir o preço como referência.
    const insightLowest = data.price_insights?.lowest_price;
    if (insightLowest && !extractFlights(data).some((flight) => Number(flight.price) <= insightLowest)) {
      const targeted = await runSearch(true, insightLowest);
      if (extractFlights(targeted).length) {
        data = {
          ...targeted,
          price_insights: targeted.price_insights ?? data.price_insights,
          search_metadata: targeted.search_metadata ?? data.search_metadata,
          best_flights: [...(targeted.best_flights ?? []), ...(data.best_flights ?? [])],
          other_flights: [...(targeted.other_flights ?? []), ...(data.other_flights ?? [])],
        };
      }
    }

    const offers = extractFlights(data)
      .map((item, index) => toOffer(item, index, request, data.price_insights, data.search_metadata?.google_flights_url))
      .filter((offer): offer is FlightOffer => Boolean(offer))
      .sort((a, b) => a.price - b.price)
      .slice(0, 10);

    if (!offers.length) {
      throw new Error("O Google Flights não encontrou voos para essa rota e data. Teste outra data ou, se quiser, uma cidade próxima.");
    }

    return offers;
  }
}
