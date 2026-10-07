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
  search_metadata?: { google_flights_url?: string };
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
  if (!key) throw new Error("A chave da SerpApi não está configurada no Cloudflare.");
  return key;
}

function toOffer(item: SerpApiFlight, index: number, request: FlightSearchRequest, bookingUrl?: string): FlightOffer | null {
  const first = item.flights?.[0];
  const last = item.flights?.[item.flights.length - 1];
  if (!first?.departure_airport?.time || !last?.arrival_airport?.time || !item.price) return null;

  const stops = Math.max(0, (item.flights?.length ?? 1) - 1);
  const price = Number(item.price);
  const score = Math.max(0, Math.min(100, Math.round(100 - (price / Math.max(request.budget, 1)) * 25 - stops * 5)));

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
  };
}

export class SerpApiFlightProvider implements FlightProvider {
  async search(request: FlightSearchRequest): Promise<FlightOffer[]> {
    if (!request.destination) throw new Error("Informe o destino para a primeira busca de voos.");
    if (!request.departureDate) throw new Error("Informe a data de ida para buscar voos.");

    const params = new URLSearchParams({
      engine: "google_flights", api_key: getApiKey(),
      departure_id: normalizeLocation(request.origin),
      arrival_id: normalizeLocation(request.destination),
      outbound_date: request.departureDate, currency: "BRL", hl: "pt-BR", gl: "br",
      max_price: String(Math.round(request.budget)),
    });
    if (request.returnDate) params.set("return_date", request.returnDate);

    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      headers: { Accept: "application/json" }, cache: "no-store",
    });
    if (!response.ok) throw new Error(`SerpApi respondeu com HTTP ${response.status}.`);

    const data = (await response.json()) as SerpApiResponse;
    if (data.error) throw new Error(`SerpApi: ${data.error}`);

    return [...(data.best_flights ?? []), ...(data.other_flights ?? [])]
      .map((item, index) => toOffer(item, index, request, data.search_metadata?.google_flights_url))
      .filter((offer): offer is FlightOffer => Boolean(offer))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10);
  }
}
