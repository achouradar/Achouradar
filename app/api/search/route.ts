import { NextResponse } from "next/server";
import { getFlightProvider } from "@/lib/flights/provider";
import type { FlightSearchRequest } from "@/lib/flights/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<FlightSearchRequest>;

    if (!body.origin || typeof body.origin !== "string") {
      return NextResponse.json({ error: "Informe a origem." }, { status: 400 });
    }

    if (typeof body.budget !== "number" || body.budget <= 0) {
      return NextResponse.json({ error: "Informe um orçamento válido." }, { status: 400 });
    }

    const provider = getFlightProvider();
    const offers = await provider.search({
      origin: body.origin.trim(),
      destination:
        typeof body.destination === "string" ? body.destination.trim() : undefined,
      budget: body.budget,
      departureDate: body.departureDate,
      returnDate: body.returnDate,
    });

    return NextResponse.json({ offers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado na busca.";

    return NextResponse.json({ error: message }, { status: 503 });
  }
}
