import { NextResponse } from "next/server";

type BookingRequest = {
  url?: string;
  post_data?: string;
};

type BookingOption = {
  together?: {
    price?: number;
    airline?: boolean;
    book_with?: string;
    booking_request?: BookingRequest;
  };
  departing?: {
    price?: number;
    airline?: boolean;
    book_with?: string;
    booking_request?: BookingRequest;
  };
};

function getApiKey() {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("A chave da SerpApi não está configurada no Railway.");
  return key;
}

function collectOptions(data: { booking_options?: BookingOption[] }) {
  return (data.booking_options ?? [])
    .map((option) => option.together ?? option.departing)
    .filter((option): option is NonNullable<BookingOption["together"]> => Boolean(option?.booking_request?.url))
    .sort((a, b) => {
      const aPrice = Number(a.price ?? Infinity);
      const bPrice = Number(b.price ?? Infinity);
      if (aPrice !== bPrice) return aPrice - bPrice;
      return Number(Boolean(b.airline)) - Number(Boolean(a.airline));
    });
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "Oferta de compra não encontrada." }, { status: 400 });
    }

    const params = new URLSearchParams({
      engine: "google_flights",
      api_key: getApiKey(),
      booking_token: token,
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    const raw = await response.text();
    let data: { booking_options?: BookingOption[]; error?: string } = {};
    try { data = JSON.parse(raw); } catch {}

    if (!response.ok || data.error) {
      throw new Error(data.error ?? "Não foi possível localizar a opção de compra.");
    }

    const option = collectOptions(data)[0];
    const bookingRequest = option?.booking_request;

    if (!bookingRequest?.url) {
      return NextResponse.json(
        { error: "Essa oferta não possui um link de compra disponível neste momento." },
        { status: 404 }
      );
    }

    const hasPostData = Boolean(bookingRequest.post_data);
    const bookingResponse = await fetch(bookingRequest.url, {
      method: hasPostData ? "POST" : "GET",
      headers: hasPostData
        ? {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "text/html,application/xhtml+xml,application/json",
          }
        : { Accept: "text/html,application/xhtml+xml,application/json" },
      body: hasPostData ? bookingRequest.post_data : undefined,
      redirect: "follow",
      cache: "no-store",
    });

    if (!bookingResponse.ok) {
      return NextResponse.json(
        { error: "O fornecedor não respondeu ao link de compra." },
        { status: 502 }
      );
    }

    return NextResponse.redirect(bookingResponse.url, 302);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível abrir a compra.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
