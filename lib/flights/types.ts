export type FlightSearchRequest = {
  origin: string;
  destination?: string;
  budget: number;
  departureDate?: string;
  returnDate?: string;
};

export type FlightOffer = {
  id: string;
  origin: string;
  originCode?: string;
  destination: string;
  destinationCode?: string;
  departureDate: string;
  returnDate?: string;
  price: number;
  currency: string;
  score?: number;
  bookingUrl?: string;
  bookingToken?: string;
  priceLevel?: "low" | "typical" | "high";
  lowestPrice?: number;
  typicalPriceRange?: [number, number];
  airline?: string;
  durationMinutes?: number;
  stops?: number;
  direct?: boolean;
  layovers?: string[];
};

export interface FlightProvider {
  search(request: FlightSearchRequest): Promise<FlightOffer[]>;
}
