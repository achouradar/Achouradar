export default function Home() {
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
          <p className="lead">
            Diga quanto você quer gastar. Nós procuramos oportunidades que realmente façam sentido para a sua viagem.
          </p>

          <div className="search-card">
            <div className="field">
              <label>DE ONDE?</label>
              <input placeholder="Ex.: Porto Alegre" />
            </div>
            <div className="field">
              <label>PARA ONDE?</label>
              <input placeholder="Ex.: Salvador ou qualquer destino" />
            </div>
            <div className="field budget">
              <label>QUANTO QUER GASTAR?</label>
              <input placeholder="R$ 1.000" inputMode="numeric" />
            </div>
            <button>🔥 ACHAR OPORTUNIDADES</button>
          </div>

          <div className="trust">
            <span>✓ Sem promessas de preço</span>
            <span>✓ Oportunidades explicadas</span>
            <span>✓ Você decide</span>
          </div>
        </div>

        <div className="radar-card">
          <div className="radar-top">
            <span>🔥 ACHOU!</span>
            <span className="score">94/100</span>
          </div>
          <div className="route">Porto Alegre <b>→</b> Salvador</div>
          <div className="date">14 — 19 abril</div>
          <div className="price">R$ 689</div>
          <div className="status">🟢 ÓTIMO PREÇO</div>
          <ul>
            <li>Dentro do seu orçamento</li>
            <li>Preço muito bom para o período</li>
            <li>1 escala</li>
          </ul>
          <button className="offer">VER OFERTA</button>
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
