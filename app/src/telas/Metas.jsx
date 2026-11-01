// Metas do mês e evolução semanal, com a meta de acerto que o aluno escolheu e a projeção de nota na prova.
import { useState, useMemo } from '../react.js';
import { useApp } from '../componentes.jsx';
import { metasDoMes, evolucaoSemanal } from '../cronograma.js';
import { proficiencias, previsao } from '../trilha.js';
import { t, idiomaAtual } from '../i18n.js';

const pct = (x) => `${Math.round(x * 100)}%`;
const dataCurta = (ts) => new Date(ts).toLocaleDateString(idiomaAtual() === 'es' ? 'es' : 'pt-BR', { day: '2-digit', month: '2-digit' });
const L = 640; const A = 220; const M = { e: 40, d: 16, c: 18, b: 34 };

/** Linha do acerto semanal com a meta tracejada. Uma série: sem legenda, o título nomeia. */
function GraficoAcerto({ semanas, meta }) {
  const [foco, setFoco] = useState(null);
  const x = (i) => M.e + (i * (L - M.e - M.d)) / Math.max(1, semanas.length - 1);
  const y = (v) => M.c + (1 - v) * (A - M.c - M.b);
  const pontos = semanas.map((s, i) => ({ ...s, i })).filter((s) => s.acerto !== null);
  const caminho = pontos.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.acerto)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="grafico" role="img" aria-label={t('Acerto por semana, com a meta de {m}', { m: pct(meta) })} onMouseLeave={() => setFoco(null)}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}><line x1={M.e} x2={L - M.d} y1={y(v)} y2={y(v)} className="grade-linha" /><text x={M.e - 6} y={y(v) + 4} className="eixo" textAnchor="end">{pct(v)}</text></g>
      ))}
      <line x1={M.e} x2={L - M.d} y1={y(meta)} y2={y(meta)} className="linha-meta" />
      <text x={L - M.d} y={y(meta) - 6} className="rotulo-meta" textAnchor="end">{t('Meta {m}', { m: pct(meta) })}</text>
      {semanas.map((s, i) => <text key={s.inicio} x={x(i)} y={A - 12} className="eixo" textAnchor="middle">{dataCurta(s.inicio)}</text>)}
      {caminho && <path d={caminho} className="linha-serie" />}
      {pontos.map((p) => (
        <g key={p.inicio} onMouseEnter={() => setFoco(p)} onFocus={() => setFoco(p)} tabIndex={0}>
          <circle cx={x(p.i)} cy={y(p.acerto)} r={16} className="alvo-toque" />
          <circle cx={x(p.i)} cy={y(p.acerto)} r={5} className={`ponto-serie${foco?.inicio === p.inicio ? ' ativo' : ''}`} />
        </g>
      ))}
      {pontos.length > 0 && (() => { const u = pontos[pontos.length - 1]; return <text x={x(u.i)} y={y(u.acerto) - 12} className="rotulo-valor" textAnchor="middle">{pct(u.acerto)}</text>; })()}
      {foco && (
        <g transform={`translate(${Math.min(Math.max(x(foco.i) - 70, 4), L - 144)}, ${Math.max(y(foco.acerto) - 62, 2)})`} className="dica">
          <rect width="140" height="44" rx="8" />
          <text x="10" y="18">{t('Semana de {d}', { d: dataCurta(foco.inicio) })}</text>
          <text x="10" y="35" className="forte">{pct(foco.acerto)} · {foco.certas}/{foco.questoes}</text>
        </g>
      )}
    </svg>
  );
}

/** Barras de questões por semana com a meta semanal como linha de referência. */
function GraficoQuestoes({ semanas, meta }) {
  const [foco, setFoco] = useState(null);
  const max = Math.max(meta, ...semanas.map((s) => s.questoes), 1) * 1.1;
  const largura = (L - M.e - M.d) / semanas.length;
  const y = (v) => M.c + (1 - v / max) * (A - M.c - M.b);
  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="grafico" role="img" aria-label={t('Questões por semana, com a meta de {m}', { m: meta })} onMouseLeave={() => setFoco(null)}>
      {[0, 0.5, 1].map((f) => { const v = Math.round(max * f); return <g key={f}><line x1={M.e} x2={L - M.d} y1={y(v)} y2={y(v)} className="grade-linha" /><text x={M.e - 6} y={y(v) + 4} className="eixo" textAnchor="end">{v}</text></g>; })}
      {semanas.map((s, i) => {
        const x0 = M.e + i * largura + largura * 0.2;
        const w = largura * 0.6;
        const topo = y(s.questoes);
        const base = y(0);
        const h = Math.max(0, base - topo);
        return (
          <g key={s.inicio} onMouseEnter={() => setFoco({ ...s, x: x0 + w / 2, topo })} tabIndex={0} onFocus={() => setFoco({ ...s, x: x0 + w / 2, topo })}>
            <rect x={M.e + i * largura} y={M.c} width={largura} height={A - M.c - M.b} className="alvo-toque" />
            {h > 0 && <path className={`barra-serie${s.questoes >= meta ? ' atingiu' : ''}`} d={`M${x0},${base} V${topo + Math.min(4, h)} Q${x0},${topo} ${x0 + Math.min(4, w / 2)},${topo} H${x0 + w - Math.min(4, w / 2)} Q${x0 + w},${topo} ${x0 + w},${topo + Math.min(4, h)} V${base} Z`} />}
            <text x={x0 + w / 2} y={A - 12} className="eixo" textAnchor="middle">{dataCurta(s.inicio)}</text>
          </g>
        );
      })}
      <line x1={M.e} x2={L - M.d} y1={y(meta)} y2={y(meta)} className="linha-meta" />
      <text x={L - M.d} y={y(meta) - 6} className="rotulo-meta" textAnchor="end">{t('Meta {m}/semana', { m: meta })}</text>
      {foco && (
        <g transform={`translate(${Math.min(Math.max(foco.x - 70, 4), L - 144)}, ${Math.max(foco.topo - 54, 2)})`} className="dica">
          <rect width="140" height="44" rx="8" />
          <text x="10" y="18">{t('Semana de {d}', { d: dataCurta(foco.inicio) })}</text>
          <text x="10" y="35" className="forte">{t('{n} de {m} questões', { n: foco.questoes, m: meta })}</text>
        </g>
      )}
    </svg>
  );
}

export default function Metas() {
  const { progresso, banco, acesso } = useApp();
  const metaDia = acesso.completo ? null : Math.min(acesso.limites.questoesDia, 25);
  const mes = metasDoMes(progresso, Date.now(), metaDia);
  const evo = evolucaoSemanal(progresso, 8, Date.now(), metaDia);
  const prev = useMemo(() => previsao(proficiencias(progresso, banco.questoes)), [progresso.respostas, banco]);
  const nomeMes = new Date().toLocaleDateString(idiomaAtual() === 'es' ? 'es' : 'pt-BR', { month: 'long' });
  const fracaoQ = mes.metaQuestoes ? Math.min(1, mes.feitas / mes.metaQuestoes) : 0;
  const acima = mes.acerto !== null && mes.acerto >= mes.metaAcerto;
  return (
    <section className="secao metas">
      <h2>{t('Metas de {mes}', { mes: nomeMes })}</h2>
      <div className="metas-grade">
        <div className="cartao meta">
          <span className="sobretitulo">{t('Questões no mês')}</span>
          <strong className="numero-grande">{mes.feitas}<small> / {mes.metaQuestoes}</small></strong>
          <span className="mini-barra"><span style={{ width: `${fracaoQ * 100}%` }} /></span>
          <span className="mudo pequeno">{mes.feitas >= mes.metaQuestoes ? t('Meta do mês batida.') : t('Faltam {n} questões.', { n: mes.metaQuestoes - mes.feitas })}</span>
        </div>
        <div className="cartao meta">
          <span className="sobretitulo">{t('Acerto no mês')}</span>
          <strong className="numero-grande">{mes.acerto === null ? '—' : pct(mes.acerto)}<small> / {pct(mes.metaAcerto)}</small></strong>
          <span className="mini-barra"><span style={{ width: `${Math.min(1, (mes.acerto || 0) / mes.metaAcerto) * 100}%` }} /></span>
          <span className="mudo pequeno">{mes.acerto === null ? t('Responda questões para medir.') : acima ? t('Acima da sua meta.') : t('{p} pontos abaixo da meta.', { p: Math.round((mes.metaAcerto - mes.acerto) * 100) })}</span>
        </div>
        <div className="cartao meta">
          <span className="sobretitulo">{t('Projeção na prova')}</span>
          <strong className="numero-grande">{pct(prev.media)}<small> ± {Math.round(prev.margem * 100)}</small></strong>
          <span className="mudo pequeno">{t('Pelo peso de cada especialidade nas provas do Inep e pelo seu acerto nelas. Cobertura: {c} da prova.', { c: pct(prev.cobertura) })}</span>
        </div>
      </div>
      <div className="graficos-grade">
        <div className="cartao">
          <h3>{t('Acerto por semana')}</h3>
          <GraficoAcerto semanas={evo.semanas} meta={evo.metaAcerto} />
        </div>
        <div className="cartao">
          <h3>{t('Questões por semana')}</h3>
          <GraficoQuestoes semanas={evo.semanas} meta={evo.metaSemana} />
        </div>
      </div>
      <details className="tabela-dados">
        <summary>{t('Ver os números em tabela')}</summary>
        <table>
          <thead><tr><th>{t('Semana')}</th><th>{t('Questões')}</th><th>{t('Acertos')}</th><th>{t('Acerto')}</th></tr></thead>
          <tbody>{evo.semanas.map((s) => <tr key={s.inicio}><td>{dataCurta(s.inicio)}</td><td>{s.questoes}</td><td>{s.certas}</td><td>{s.acerto === null ? '—' : pct(s.acerto)}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}
