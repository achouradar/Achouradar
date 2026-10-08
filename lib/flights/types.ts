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
  destination: string;
  departureDate: string;
  returnDate?: string;
  price: number;
  currency: string;
  score?: number;
  bookingUrl?: string;
  priceLevel?: "low" | "typical" | "high";
  lowestPrice?: number;
  typicalPriceRange?: [number, number];
};

export interface FlightProvider {
  search(request: FlightSearchRequest): Promise<FlightOffer[]>;
}
