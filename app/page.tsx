"use client";

import { FormEvent, useState } from "react";
import type { FlightOffer } from "@/lib/flights/types";

function priceDiagnosis(offer: FlightOffer) {
  if (offer.priceLevel === "low") return { label: "🟢 BOM PREÇO", text: "O Google Flights classificou o menor preço encontrado como baixo para esta busca." };
  if (offer.priceLevel === "high") return { label: "🔴 PREÇO ALTO", text: "O Google Flights indica que os preços estão altos para esta busca." };
  if (offer.priceLevel === "typical") return { label: "🟡 PREÇO NORMAL", text: "O preço está dentro da faixa típica indicada pelo Google Flights." };
  return { label: "⚪ HISTÓRICO INSUFICIENTE", text: "Não recebemos uma classificação de preço do Google Flights para esta busca." };
}

export default function Home() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [budget, setBudget] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOffers([]);
    setLoading(true);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin, destination,
          budget: Number(budget.replace(",", ".")),
          departureDate, returnDate: returnDate || undefined,
        }),
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
            <div className="field"><label>DE ONDE?</label><input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Ex.: Porto Alegre ou POA" required /></div>
            <div className="field"><label>PARA ONDE?</label><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Ex.: Salvador ou SSA" required /></div>
            <div className="field budget"><label>QUANTO QUER GASTAR?</label><input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="R$ 1.000" inputMode="decimal" required /></div>
            <div className="field"><label>IDA</label><input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required /></div>
            <div className="field"><label>VOLTA (OPCIONAL)</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} /></div>
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
                    {offers[0].lowestPrice && (
                      <span>Menor preço encontrado: <b>R$ {offers[0].lowestPrice.toLocaleString("pt-BR")}</b></span>
                    )}
                    {offers[0].typicalPriceRange && (
                      <span>Faixa típica: <b>R$ {offers[0].typicalPriceRange[0].toLocaleString("pt-BR")}–R$ {offers[0].typicalPriceRange[1].toLocaleString("pt-BR")}</b></span>
                    )}
                  </div>
                );
              })()}
              <div className="status">🟢 DENTRO DO SEU ORÇAMENTO</div>
              <ul><li>Resultado vindo do Google Flights</li><li>Preço analisado com os dados disponíveis</li><li>Você decide quando comprar</li></ul>
              {offers[0].bookingUrl && <a className="offer" href={offers[0].bookingUrl} target="_blank" rel="noreferrer">VER OFERTA</a>}
            </>
          ) : (
            <>
              <div className="route">Porto Alegre <b>→</b> Salvador</div>
              <div className="date">Faça uma busca para encontrar uma oportunidade</div>
              <div className="price">R$ —</div>
              <div className="status">🔵 PRONTO PARA PROCURAR</div>
              <ul><li>Informe origem e destino</li><li>Defina seu orçamento</li><li>Escolha a data de ida</li></ul>
            </>
          )}
          <div className="disclaimer">Preços e condições podem mudar até a compra.</div>
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
