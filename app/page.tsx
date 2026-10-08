"use client";

import { FormEvent, useEffect, useState } from "react";
import type { FlightOffer } from "@/lib/flights/types";

function priceDiagnosis(offer: FlightOffer) {
  if (offer.priceLevel === "low") return { label: "BOM PREÇO", text: "O Google Flights classificou o menor preço encontrado como baixo para esta busca." };
  if (offer.priceLevel === "high") return { label: "PREÇOS ALTOS", text: "O Google Flights indica que o mercado está com preços altos para esta busca. Isso é um diagnóstico de mercado, não a recomendação do ACHOURADAR." };
  if (offer.priceLevel === "typical") return { label: "PREÇO NORMAL", text: "O preço está dentro da faixa típica indicada pelo Google Flights." };
  return { label: "HISTÓRICO INSUFICIENTE", text: "Não recebemos uma classificação histórica de preço para esta busca." };
}

function opportunityStatus(offer: FlightOffer, budget: number, allOffers: FlightOffer[]) {
  const alternatives = allOffers.filter((item) => item.id !== offer.id && item.price <= budget);
  const nextBest = [...alternatives].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const isCheapest = offer.price === Math.min(...allOffers.map((item) => item.price));
  const isBestScore = !nextBest || (offer.score ?? 0) >= (nextBest.score ?? 0);
  const priceGap = nextBest ? Math.round(((nextBest.price - offer.price) / offer.price) * 100) : 0;
  const durationGap = nextBest && offer.durationMinutes && nextBest.durationMinutes
    ? offer.durationMinutes - nextBest.durationMinutes
    : 0;

  if (isBestScore && offer.price <= budget) {
    return { tone: "green", icon: "🟢", label: "MELHOR CUSTO-BENEFÍCIO", action: "COMPRE" };
  }

  if (isCheapest && nextBest && priceGap <= 5 && durationGap >= 180) {
    return { tone: "yellow", icon: "🟡", label: "MENOR PREÇO, MAS HÁ OPÇÃO MELHOR", action: "VALE ACOMPANHAR" };
  }

  if (offer.price <= budget) {
    return { tone: "yellow", icon: "🟡", label: "DENTRO DO ORÇAMENTO", action: "VALE ACOMPANHAR" };
  }

  return { tone: "red", icon: "🔴", label: "PREÇO ALTO", action: "ESPERE" };
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

  if (offer.direct) reasons.push("é voo direto, sem troca de avião");
  else if ((offer.stops ?? 0) > 0) reasons.push(`tem ${offer.stops} escala${offer.stops === 1 ? "" : "s"}${offer.layovers?.length ? ` em ${offer.layovers.join(", ")}` : ""}`);

  if (offer.durationMinutes && offer.durationMinutes <= 180) reasons.push(`tem duração de ${formatDuration(offer.durationMinutes)}`);
  if (offer.airline) reasons.push(`é operado pela ${offer.airline}`);
  if (offer.price <= budget) reasons.push("está dentro do orçamento informado");

  if (!reasons.length) return "Analisamos preço, duração, escalas e orçamento com os dados disponíveis.";
  return `Esta oferta faz sentido porque ${reasons.slice(0, 4).join(", ")}.`;
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
          <div className="radar-top"><span>🔥 ACHOU!</span><span className="score">{offers[0]?.score ?? "—"}/100</span></div>
          {offers[0] ? (
            <>
              <div className="route">{offers[0].origin} <b>→</b> {offers[0].destination}</div>
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
                  const alternative = [...offers].filter((item) => item.id !== offers[0].id).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
                  if (!alternative) return null;
                  const priceDiff = alternative.price - offers[0].price;
                  const durationDiff = (offers[0].durationMinutes ?? 0) - (alternative.durationMinutes ?? 0);
                  if (priceDiff > 0 && durationDiff >= 180) {
                    return <span>Comparação: por <b>R$ {priceDiff.toLocaleString("pt-BR")}</b> a mais, há uma opção cerca de <b>{formatDuration(durationDiff)}</b> mais rápida.</span>;
                  }
                  return null;
                })()}
              </div>
              {(() => {
                const status = opportunityStatus(offers[0], budgetValue, offers);
                return (
                  <div className={`opportunity-status ${status.tone}`}>
                    <span className="status-dot">{status.icon}</span>
                    <span className="status-copy"><strong>{status.label}</strong><small>{status.action}</small></span>
                  </div>
                );
              })()}
              <ul>
                <li>{offers[0].direct ? "Voo direto, sem troca de avião" : `${offers[0].stops ?? 0} escala(s) no trajeto`}</li>
                <li>Duração: {formatDuration(offers[0].durationMinutes)}</li>
                {offers[0].airline && <li>Companhia: {offers[0].airline}</li>}
              </ul>
              {offers[0].bookingUrl && <a className="offer" href={offers[0].bookingUrl} target="_blank" rel="noreferrer">COMPARAR NO GOOGLE FLIGHTS</a>}
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
          <div className="disclaimer">O Google Flights pode atualizar preços e mostrar ofertas diferentes ao abrir a comparação.</div>
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
