import { useApp, Icone, Numero, Vazio } from '../../componentes.jsx';
import { AREAS, infoArea } from '../../data.js';
import { t } from '../../i18n.js';
import { Recomendacoes, notaTexto } from './comum.jsx';

const data = (ms) => new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

/** Linha de evolução das últimas notas (SVG simples, sem biblioteca). */
function Evolucao({ notas }) {
  if (notas.length < 2) return <p className="mudo pequeno">{t('Faça pelo menos duas estações para ver a evolução.')}</p>;
  const l = 600; const a = 140; const p = 12;
  const x = (i) => p + (i * (l - 2 * p)) / (notas.length - 1);
  const y = (n) => a - p - (n / 10) * (a - 2 * p);
  const pontos = notas.map((n, i) => `${x(i)},${y(n.nota)}`).join(' ');
  return (
    <svg className="grafico evolucao" viewBox={`0 0 ${l} ${a}`} role="img" aria-label={t('Evolução das notas nas últimas estações')}>
      <line x1={p} x2={l - p} y1={y(6)} y2={y(6)} className="linha-meta" />
      <text x={l - p} y={y(6) - 4} textAnchor="end" className="rotulo-meta">6,0</text>
      <polyline points={pontos} className="linha-serie" />
      {notas.map((n, i) => <circle key={i} cx={x(i)} cy={y(n.nota)} r="4" className="ponto-serie"><title>{`${n.titulo || ''}: ${notaTexto(n.nota)}`}</title></circle>)}
    </svg>
  );
}

export default function DesempenhoPratica({ estacoes, voltar, abrirEstacao }) {
  const { progresso } = useApp();
  const porId = Object.fromEntries(estacoes.map((e) => [e.id, e]));
  const todas = Object.entries(progresso.praticas)
    .filter(([id]) => porId[id] || /^(cm|cir|ped|go|mfc|inep)-/.test(id))
    .flatMap(([id, lista]) => lista.map((r) => ({ ...r, id, area: r.area || porId[id]?.area, titulo: r.titulo || porId[id]?.titulo || id })))
    .filter((r) => typeof r.nota === 'number')
    .sort((a, b) => a.t - b.t);

  if (!todas.length) {
    return (
      <div className="desempenho-pratica">
        <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Prática · 2ª etapa')}</button>
        <Vazio titulo={t('Nenhuma estação feita ainda')}>{t('Faça uma estação, um simulado ou um treino em dupla: as notas, os critérios perdidos e a evolução aparecem aqui.')}</Vazio>
      </div>
    );
  }

  const media = todas.reduce((s, r) => s + r.nota, 0) / todas.length;
  const recentes = todas.slice(-20);
  const mediaRecente = recentes.reduce((s, r) => s + r.nota, 0) / recentes.length;
  const areas = AREAS.map((a) => {
    const lista = todas.filter((r) => r.area === a.nome);
    return { a, n: lista.length, media: lista.length ? lista.reduce((s, r) => s + r.nota, 0) / lista.length : null };
  });
  const criticos = todas.reduce((s, r) => s + (r.criticos?.length || 0), 0);
  const contagem = {};
  for (const r of todas.slice(-40)) for (const p of r.perdidos || []) contagem[p] = (contagem[p] || 0) + 1;
  const maisPerdidos = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 8);
  // Estações com pior última nota: viram as recomendações de revisão.
  const ultimaPorEstacao = {};
  for (const r of todas) ultimaPorEstacao[r.id] = r;
  const fracas = Object.values(ultimaPorEstacao).filter((r) => r.nota < 7).sort((a, b) => a.nota - b.nota).slice(0, 3);
  const simulados = {};
  for (const r of todas) if (r.simulado) (simulados[r.simulado] ||= { t: r.t, total: r.simuladoTotal || 1, notas: [] }).notas.push(r.nota);

  return (
    <div className="desempenho-pratica">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Prática · 2ª etapa')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Histórico e desempenho')}</span>
          <h1>{t('Sua evolução na 2ª etapa')}</h1>
        </div>
      </header>
      <div className="numeros">
        <Numero rotulo={t('Estações feitas')} valor={todas.length} detalhe={t('{n} diferentes', { n: Object.keys(ultimaPorEstacao).length })} />
        <Numero rotulo={t('Nota média')} valor={notaTexto(media)} detalhe={t('últimas 20: {n}', { n: notaTexto(mediaRecente) })} />
        <Numero rotulo={t('Erros críticos')} valor={criticos} detalhe={t('itens críticos não cumpridos')} />
      </div>
      <section className="secao">
        <h2>{t('Evolução')}</h2>
        <Evolucao notas={recentes} />
      </section>
      <section className="secao">
        <h2>{t('Desempenho por grande área')}</h2>
        <ul className="barras-area">
          {areas.map(({ a, n, media: m }) => (
            <li key={a.nome}>
              <span>{t(a.nome)} <span className="mudo pequeno">({n})</span></span>
              <span className="barra"><span style={{ width: `${(m || 0) * 10}%`, background: `var(--serie-${a.cor})` }} /></span>
              <strong>{m === null ? '—' : notaTexto(m)}</strong>
            </li>
          ))}
        </ul>
      </section>
      {maisPerdidos.length > 0 && (
        <section className="secao">
          <h2>{t('Critérios que você mais perde')}</h2>
          <ol className="lista-conduta">{maisPerdidos.map(([p, n]) => <li key={p}>{p} <span className="mudo pequeno">({n}×)</span></li>)}</ol>
        </section>
      )}
      {fracas.length > 0 && (
        <section className="secao">
          <h2>{t('Recomendações de revisão')}</h2>
          {fracas.map((r) => (
            <div key={r.id} className="cartao recomendacao-estacao">
              <div className="linha-titulo">
                <strong>{r.titulo}</strong>
                <span className="mudo pequeno">{t(infoArea(r.area || 'Clínica Médica').curto)} · {t('última nota')} {notaTexto(r.nota)}</span>
                {porId[r.id] && <button className="botao" onClick={() => abrirEstacao(r.id)}><Icone nome="repetir" tamanho={16} /> {t('Refazer')}</button>}
              </div>
              <Recomendacoes alvo={porId[r.id] || { area: r.area, titulo: r.titulo }} />
            </div>
          ))}
        </section>
      )}
      {Object.keys(simulados).length > 0 && (
        <section className="secao">
          <h2>{t('Simulados')}</h2>
          <ol className="lista-simulado">
            {Object.entries(simulados).sort((a, b) => b[1].t - a[1].t).map(([id, s]) => (
              <li key={id}><span className="mudo">{data(s.t)}</span><span>{t('{f} de {n} estações', { f: s.notas.length, n: s.total })}</span>
                <strong className="nota-pequena">{notaTexto(s.notas.reduce((x, n) => x + n, 0) / s.total)}</strong></li>
            ))}
          </ol>
        </section>
      )}
      <section className="secao">
        <h2>{t('Últimas estações')}</h2>
        <ol className="lista-simulado">
          {[...todas].reverse().slice(0, 15).map((r) => (
            <li key={`${r.id}-${r.t}`}>
              <span className="mudo">{data(r.t)}</span>
              <span>{r.titulo} <span className="mudo pequeno">· {t({ gratuito: 'paciente gratuito', roteiro: 'roteiro', ia: 'IA', dupla: 'dupla', autoavaliacao: 'autoavaliação' }[r.modo] || r.modo || '')}</span></span>
              <strong className={`nota-pequena ${r.nota >= 6 ? 'boa' : 'baixa'}`}>{notaTexto(r.nota)}</strong>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
