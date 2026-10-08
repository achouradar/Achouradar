"use client";

import { FormEvent, useEffect, useState } from "react";
import type { FlightOffer } from "@/lib/flights/types";

function priceDiagnosis(offer: FlightOffer) {
  if (offer.priceLevel === "low") return { label: "BOM PREÇO", text: "O Google Flights classificou o menor preço encontrado como baixo para esta busca." };
  if (offer.priceLevel === "high") return { label: "PREÇOS ALTOS", text: "O Google Flights indica que o mercado está com preços altos para esta busca. Isso é um diagnóstico de mercado, não a recomendação do ACHOURADAR." };
  if (offer.priceLevel === "typical") return { label: "PREÇO NORMAL", text: "O preço está dentro da faixa típica indicada pelo Google Flights." };
  return { label: "HISTÓRICO INSUFICIENTE", text: "Não recebemos uma classificação histórica de preço para esta busca." };
}

function opportunityIndicator(offer: FlightOffer, budget: number, allOffers: FlightOffer[]) {
  const score = offer.score ?? 0;
  const alternatives = allOffers.filter((item) => item.id !== offer.id);

  const betterAlternative = alternatives.find((item) => {
    const cheaper = item.price < offer.price;
    const meaningfullyFaster = (offer.durationMinutes ?? Infinity) - (item.durationMinutes ?? Infinity) >= 180;
    const fewerStops = (item.stops ?? Infinity) < (offer.stops ?? Infinity);
    const closeInPrice = item.price <= offer.price * 1.05;
    return (cheaper || (closeInPrice && (meaningfullyFaster || fewerStops)));
  });

  if (betterAlternative) {
    return { level: "RAZOÁVEL", tone: "yellow", bars: 5 };
  }

  if (offer.price <= budget && score >= 70) {
    return { level: "BOA", tone: "green", bars: 8 };
  }

  if (offer.price <= budget) {
    return { level: "RAZOÁVEL", tone: "yellow", bars: 6 };
  }

  return { level: "FRACA", tone: "red", bars: 2 };
}

function formatDuration(minutes?: number) {
  if (!minutes || minutes <= 0) return "não informado";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h${mins ? ` ${mins}min` : ""}` : `${mins}min`;
}

function explainOpportunity(offer: FlightOffer, budget: number) {
  const reasons: string[] = [];
  const priceDelta = offer.lowestPrice && offer.lowestPrice > 0
    ? Math.round(((offer.price - offer.lowestPrice) / offer.lowestPrice) * 100)
    : null;

  if (offer.lowestPrice && offer.price === offer.lowestPrice) reasons.push("é o menor preço de referência encontrado");
  else if (priceDelta !== null && priceDelta <= 10) reasons.push(`está só ${priceDelta}% acima do menor preço de referência`);

  if (offer.price <= budget) reasons.push(`está R$ ${(budget - offer.price).toLocaleString("pt-BR")} abaixo do seu orçamento`);
  else reasons.push(`está R$ ${(offer.price - budget).toLocaleString("pt-BR")} acima do seu orçamento`);

  if (offer.direct) reasons.push("é voo direto");
  if (offer.durationMinutes && offer.durationMinutes <= 180) reasons.push(`leva ${formatDuration(offer.durationMinutes)}`);
  if (offer.airline) reasons.push(`é operado pela ${offer.airline}`);

  if (!reasons.length) return "Comparamos preço, duração, escalas e orçamento com os dados disponíveis.";
  return `${reasons.slice(0, 4).join(" • ")}.`;
}

function explainAlternatives(primary: FlightOffer, allOffers: FlightOffer[]) {
  const alternatives = allOffers
    .filter((item) => item.id !== primary.id)
    .map((alternative) => ({
      alternative,
      priceDiff: alternative.price - primary.price,
      durationDiff: (alternative.durationMinutes ?? 0) - (primary.durationMinutes ?? 0),
    }))
    .sort((a, b) => {
      if (a.priceDiff !== b.priceDiff) return a.priceDiff - b.priceDiff;
      return a.durationDiff - b.durationDiff;
    });

  const insights: string[] = [];
  const samePriceFaster = alternatives.filter((item) => item.priceDiff === 0 && item.durationDiff < 0);
  const cheaper = alternatives.filter((item) => item.priceDiff < 0);
  const faster = alternatives.filter((item) => item.durationDiff < -15 && item.priceDiff > 0);
  const cheaperCount = cheaper.length;

  if (samePriceFaster.length) {
    const fastest = Math.min(...samePriceFaster.map((item) => item.alternative.durationMinutes ?? Infinity));
    insights.push(`Há outras opções pelo mesmo preço. As mais rápidas levam ${formatDuration(fastest)}.`);
  } else if (cheaperCount) {
    const cheapest = cheaper[0].alternative;
    insights.push(`Há uma opção R$ ${Math.abs(cheaper[0].priceDiff).toLocaleString("pt-BR")} mais barata; vale comparar horário e condições.`);
    if (cheapest.durationMinutes && primary.durationMinutes && cheapest.durationMinutes > primary.durationMinutes) {
      insights.push(`A opção mais barata leva cerca de ${formatDuration(cheapest.durationMinutes - primary.durationMinutes)} a mais.`);
    }
  }

  if (faster.length && insights.length < 2) {
    const bestFaster = faster[0];
    insights.push(`Há uma opção R$ ${bestFaster.priceDiff.toLocaleString("pt-BR")} mais cara, mas cerca de ${formatDuration(Math.abs(bestFaster.durationDiff))} mais rápida.`);
  }

  if (!insights.length && alternatives.length) {
    const closest = alternatives[0];
    if (closest.priceDiff > 0) {
      insights.push(`As outras opções custam a partir de R$ ${closest.priceDiff.toLocaleString("pt-BR")} a mais; horário e condições podem pesar na escolha.`);
    } else {
      insights.push("As outras opções são próximas; compare horário, aeroporto e condições antes de decidir.");
    }
  }

  return insights.slice(0, 2);
}

export default function Home() {
  const [origin, setOrigin] = useState("");
  const [originId, setOriginId] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<any[]>([]);
  const [budget, setBudget] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  const today = localDateString();

  useEffect(() => {
    const value = origin.trim();
    if (originId || value.length < 2) { setOriginSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(value)}`);
        const data = await response.json();
        setOriginSuggestions(data.suggestions ?? []);
      } catch { setOriginSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [origin, originId]);

  useEffect(() => {
    const value = destination.trim();
    if (destinationId || value.length < 2) { setDestinationSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(value)}`);
        const data = await response.json();
        setDestinationSuggestions(data.suggestions ?? []);
      } catch { setDestinationSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [destination, destinationId]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOffers([]);

    if (!departureDate || departureDate < today) {
      setError("Escolha uma data de ida a partir de hoje.");
      return;
    }
    if (returnDate && returnDate < departureDate) {
      setError("A data de volta não pode ser anterior à data de ida.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: originId || origin, destination: destinationId || destination, budget: Number(budget.replace(",", ".")), departureDate, returnDate: returnDate || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível buscar oportunidades.");
      setOffers(data.offers ?? []);
      if (!data.offers?.length) setError("Não encontramos uma oportunidade dentro do seu orçamento para esses critérios.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado na busca.");
    } finally {
      setLoading(false);
    }
  }

  const budgetValue = Number(budget.replace(",", "."));

  return (
    <main className="page">
      <nav className="nav">
        <div className="logo">ACHOURADAR<span>.</span></div>
        <div className="nav-badge">INTELIGÊNCIA PARA VIAJAR MELHOR</div>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">✈️ SEU PRÓXIMO VOO PODE ESTAR AQUI</div>
          <h1>Você procura.<br /><strong>O ACHOURADAR encontra.</strong></h1>
          <p className="lead">Diga quanto você quer gastar. Nós procuramos oportunidades que realmente façam sentido para a sua viagem.</p>
          <form className="search-card" onSubmit={handleSearch}>
            <div className="field location-field"><label>DE ONDE?</label><input value={origin} onChange={(e) => { setOrigin(e.target.value); setOriginId(""); }} placeholder="Cidade ou aeroporto" required />{originSuggestions.length > 0 && <div className="location-suggestions">{originSuggestions.map((item) => <button type="button" key={item.id} onClick={() => { setOrigin(item.name); setOriginId(item.id); setOriginSuggestions([]); }}>{item.name}{item.description ? ` — ${item.description}` : ""}{item.airports?.length ? ` • ${item.airports.map((a: any) => a.id).join(", ")}` : ""}</button>)}</div>}</div>
            <div className="field location-field"><label>PARA ONDE?</label><input value={destination} onChange={(e) => { setDestination(e.target.value); setDestinationId(""); }} placeholder="Cidade ou aeroporto" required />{destinationSuggestions.length > 0 && <div className="location-suggestions">{destinationSuggestions.map((item) => <button type="button" key={item.id} onClick={() => { setDestination(item.name); setDestinationId(item.id); setDestinationSuggestions([]); }}>{item.name}{item.description ? ` — ${item.description}` : ""}{item.airports?.length ? ` • ${item.airports.map((a: any) => a.id).join(", ")}` : ""}</button>)}</div>}</div>
            <div className="field budget"><label>QUANTO QUER GASTAR?</label><input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="R$ 1.000" inputMode="decimal" required /></div>
            <div className="field"><label>IDA</label><input type="date" value={departureDate} min={today} onChange={(e) => setDepartureDate(e.target.value)} required /></div>
            <div className="field"><label>VOLTA (OPCIONAL)</label><input type="date" value={returnDate} min={departureDate || today} onChange={(e) => setReturnDate(e.target.value)} /></div>
            <button type="submit" disabled={loading}>{loading ? "🔎 PROCURANDO..." : "🔥 ACHAR OPORTUNIDADES"}</button>
          </form>
          {error && <div className="error">{error}</div>}
          <div className="trust"><span>✓ Sem promessas de preço</span><span>✓ Oportunidades explicadas</span><span>✓ Você decide</span></div>
        </div>
        <div className="radar-card">
          <div className="radar-top"><span>🔥 ACHOU!</span><span className="score">Índice ACHOURADAR: {offers[0]?.score ?? "—"}</span></div>
          {offers[0] ? (
            <>
              <div className="route">{offers[0].originCode ? `${offers[0].originCode} · ` : ""}{offers[0].origin} <b>→</b> {offers[0].destinationCode ? `${offers[0].destinationCode} · ` : ""}{offers[0].destination}</div>
              <div className="date">{offers[0].departureDate.replace("T", " ")}</div>
              <div className="price">R$ {offers[0].price.toLocaleString("pt-BR")}</div>
              {(() => {
                const diagnosis = priceDiagnosis(offers[0]);
                return (
                  <div className="price-diagnosis">
                    <strong>{diagnosis.label}</strong>
                    <span>{diagnosis.text}</span>
                    {offers[0].lowestPrice && <span>Menor preço de referência: <b>R$ {offers[0].lowestPrice.toLocaleString("pt-BR")}</b></span>}
                    {offers[0].typicalPriceRange && <span>Faixa típica: <b>R$ {offers[0].typicalPriceRange[0].toLocaleString("pt-BR")}–R$ {offers[0].typicalPriceRange[1].toLocaleString("pt-BR")}</b></span>}
                  </div>
                );
              })()}
              <div className="opportunity-explanation">
                <strong>💡 POR QUE ESSA OFERTA FAZ SENTIDO?</strong>
                <span>{explainOpportunity(offers[0], budgetValue)}</span>
                {offers.length > 1 && (() => {
                  const alternatives = explainAlternatives(offers[0], offers);
                  if (!alternatives.length) return null;
                  return (
                    <div className="alternative-explanation">
                      <strong>🔎 O QUE MUDA NAS OUTRAS OPÇÕES?</strong>
                      {alternatives.map((text, index) => <span key={index}>{text}</span>)}
                      <small>Preço e duração são comparados automaticamente. Horário, aeroporto e condições continuam sendo decisão sua.</small>
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const indicator = opportunityIndicator(offers[0], budgetValue, offers);
                return (
                  <div className={`opportunity-indicator ${indicator.tone}`}>
                    <div className="indicator-heading"><strong>📊 NÍVEL DA OPORTUNIDADE</strong><span>{indicator.level}</span></div>
                    <div className="indicator-bars" aria-label={indicator.level}>
                      {"█".repeat(indicator.bars) + "░".repeat(10 - indicator.bars)}
                    </div>
                    <small>Você decide. O ACHOURADAR mostra os dados para ajudar na sua escolha.</small>
                  </div>
                );
              })()}
              <ul>
                <li>{offers[0].direct ? "Voo direto, sem troca de avião" : `${offers[0].stops ?? 0} escala(s) no trajeto`}</li>
                <li>Duração: {formatDuration(offers[0].durationMinutes)}</li>
                {offers[0].airline && <li>Companhia: {offers[0].airline}</li>}
              </ul>
              {offers[0].bookingToken ? (
                <a className="offer" href={`/api/booking?token=${encodeURIComponent(offers[0].bookingToken)}`} target="_blank" rel="noreferrer">🛒 IR PARA COMPRA</a>
              ) : offers[0].bookingUrl ? (
                <a className="offer" href={offers[0].bookingUrl} target="_blank" rel="noreferrer">VER NO GOOGLE FLIGHTS</a>
              ) : null}
            </>
          ) : (
            <>
              <div className="route">{origin || "Origem"} <b>→</b> {destination || "Destino"}</div>
              <div className="date">Faça uma busca para encontrar uma oportunidade</div>
              <div className="price">R$ —</div>
              <div className="opportunity-status neutral"><span className="status-dot">🔵</span><span className="status-copy"><strong>PRONTO PARA PROCURAR</strong><small>FAÇA UMA BUSCA</small></span></div>
              <ul><li>Informe origem e destino</li><li>Defina seu orçamento</li><li>Escolha a data de ida</li></ul>
            </>
          )}
          <div className="disclaimer">O preço e a disponibilidade podem mudar até a conclusão da compra. O botão tenta abrir a oferta específica encontrada pelo ACHOURADAR.</div>
        </div>
      </section>
      <section className="bottom">
        <div><strong>QUERO VIAJAR</strong><span>Defina seu orçamento</span></div>
        <div><strong>ENCONTRE PARA MIM</strong><span>O radar procura oportunidades</span></div>
        <div><strong>EU DECIDO</strong><span>Você escolhe quando comprar</span></div>
      </section>
    </main>
  );
}
