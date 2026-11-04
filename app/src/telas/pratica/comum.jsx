import { useState, useEffect } from '../../react.js';
import { useApp, Icone } from '../../componentes.jsx';
import { t } from '../../i18n.js';
import { recomendar } from '../../recomendacoes.js';

export const ROTULO_ORIGEM = { oficial: 'Oficial Inep', adaptado: 'Adaptado do Inep', autoral: 'Autoral RX MED' };

/** Selo de origem: oficial (documento do Inep), adaptado ou autoral. */
export function SeloOrigem({ origem, edicao }) {
  return (
    <span className={`selo-origem selo-${origem}`} title={t(origem === 'oficial' ? 'Extraído de documento oficial do Inep' : origem === 'adaptado' ? 'Adaptado pedagogicamente de documento oficial' : 'Criado pela equipe RX MED')}>
      {t(ROTULO_ORIGEM[origem] || 'Autoral RX MED')}{origem === 'oficial' && edicao ? ` · ${edicao.replace(/^Revalida /, '')}` : ''}
    </span>
  );
}

/** Impresso entregue pelo examinador (texto e, quando o caderno traz figura, a imagem). */
export function Impresso({ rotulo, texto, imagem }) {
  return (
    <div className="impresso-entregue">
      {rotulo && <strong className="impresso-titulo">{rotulo}</strong>}
      {texto && <span className="impresso-texto">{texto}</span>}
      {imagem && <a href={imagem} target="_blank" rel="noopener"><img src={imagem} alt={rotulo || t('Imagem do impresso')} loading="lazy" /></a>}
    </div>
  );
}

/** Segundos restantes a partir do início (ms) e da duração (min). `desvio` corrige o relógio local pelo do servidor. */
export function useRestante(inicioMs, minutos, desvio = 0) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!inicioMs) return undefined;
    const id = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(id);
  }, [inicioMs]);
  if (!inicioMs) return minutos * 60;
  return Math.max(0, minutos * 60 - (agora + desvio - inicioMs) / 1000);
}

/** Aulas, questões e flashcards do curso sobre o tema da estação. */
export function Recomendacoes({ alvo, titulo }) {
  const { banco, progresso, ir, setCursoVista, iniciarSessao } = useApp();
  const r = recomendar(banco, progresso, alvo);
  if (!r.aulas.length && !r.questoes.length && !r.cartoes) return null;
  return (
    <div className="recomendacoes">
      {titulo && <span className="sobretitulo">{titulo}</span>}
      <div className="linha-botoes">
        {r.aulas.filter((a) => a.modulo).map((a) => (
          <button key={a.id} className="botao" onClick={() => { setCursoVista({ modulo: a.modulo, aula: a.id }); ir('curso'); }}>
            <Icone nome="livro" tamanho={16} /> {t('Aula')}: {a.titulo}
          </button>
        ))}
        {r.questoes.length > 0 && (
          <button className="botao" onClick={() => iniciarSessao({ titulo: `${t('Revisão')}: ${alvo.tema || alvo.titulo}`, ids: r.questoes, origem: 'pratica' })}>
            <Icone nome="lista" tamanho={16} /> {t('{n} questões do tema', { n: r.questoes.length })}
          </button>
        )}
        {r.cartoes > 0 && (
          <button className="botao" onClick={() => ir('flashcards')}><Icone nome="cartas" tamanho={16} /> {t('{n} flashcards da área', { n: r.cartoes })}</button>
        )}
      </div>
    </div>
  );
}

export const notaTexto = (n) => (Number(n) || 0).toFixed(1).replace('.', ',');
