import type { FlightProvider } from "./types";

export function getFlightProvider(): FlightProvider {
  throw new Error(
    "Nenhum provedor de voos configurado. O ACHOURADAR está pronto para receber o primeiro provider."
  );
}
