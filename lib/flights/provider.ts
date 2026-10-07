import { SerpApiFlightProvider } from "./serpapi";
import type { FlightProvider } from "./types";

export function getFlightProvider(): FlightProvider {
  return new SerpApiFlightProvider();
}
