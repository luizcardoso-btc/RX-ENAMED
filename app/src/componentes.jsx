import { useState, useEffect, useContext, createContext } from './react.js';
import { infoArea } from './data.js';
import { LETRAS } from './util.js';
import { t, tc } from './i18n.js';

export const Contexto = createContext(null);
export const useApp = () => useContext(Contexto);

const CAMINHOS = {
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  estrela: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
  esquerda: 'M15 5l-7 7 7 7',
  sair: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 16l-4-4 4-4 M6 12h10',
  direita: 'M9 5l7 7-7 7',
  relogio: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  riscar: 'M7 19l5-14 5 14M8.8 14h6.4M3 11.5h18',
  lupa: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  bandeira: 'M5 21V4m0 0h11l-2 4 2 4H5',
  embaralhar: 'M4 7h3l10 10h3M4 17h3l3-3m4-4l3-3h3M17 4l3 3-3 3M17 14l3 3-3 3',
  repetir: 'M4 12a8 8 0 0114-5.3L20 9M20 4v5h-5M20 12a8 8 0 01-14 5.3L4 15M4 20v-5h5',
  lixo: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copiar: 'M9 9h10v11H9zM5 15V4h10',
  livro: 'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM4 20.5A2.5 2.5 0 016.5 18H20v3H6.5A2.5 2.5 0 014 20.5z',
  cartas: 'M8 6h11v14H8zM5 17V4h11',
  chama: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2.2 1-3.7 2.3-4.8.2 1.6 1 2.6 2.2 3.1C11 9 11.2 6 12 3z',
  calendario: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
  casa: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5',
  lista: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  grafico: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  usuario: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5a7.5 7.5 0 0115 0',
  menu: 'M4 7h16M4 12h16M4 17h16',
  raiox: 'M12 3v18M8 7c-2 0-3 1-3 3M16 7c2 0 3 1 3 3M7 12h10M8 16h8M5 20h14',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
  alvo: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  cadeado: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  video: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  estetoscopio: 'M6 3v6a4 4 0 008 0V3M10 13v3a5 5 0 0010 0v-2M20 14a2 2 0 100-4 2 2 0 000 4z',
  pessoas: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6 6 0 013.5 6',
};

export function Icone({ nome, tamanho = 18, titulo }) {
  return (
    <svg className="icone" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden={titulo ? undefined : 'true'}
      role={titulo ? 'img' : undefined}>
      {titulo && <title>{titulo}</title>}
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}

export function Estrela({ cheia }) {
  return (
    <svg className="icone" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
      strokeLinejoin="round" fill={cheia ? 'currentColor' : 'none'} aria-hidden="true">
      <path d={CAMINHOS.estrela} />
    </svg>
  );
}

/** Avatar do mentor: iniciais num círculo com a cor da área. */
export function AvatarMentor({ mentor, tamanho = 40 }) {
  const iniciais = mentor.nome.replace(/^Dra?\.\s*/, '').split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <span className="avatar-mentor" aria-hidden="true"
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.38, background: `var(--serie-${infoArea(mentor.area).cor})` }}>
      {iniciais}
    </span>
  );
}

/** Fala curta de um mentor, com nome e cargo. */
export function FalaMentor({ mentor, children }) {
  if (!mentor) return null;
  return (
    <aside className="fala-mentor">
      <AvatarMentor mentor={mentor} />
      <div className="fala-texto">
        <span className="fala-quem">{mentor.nome} · <span className="mudo">{tc(mentor, 'titulo')}</span></span>
        <div className="fala-corpo">{children}</div>
      </div>
    </aside>
  );
}

export function TagArea({ area, curto = true }) {
  const info = infoArea(area);
  return (
    <span className="tag-area">
      <span className="ponto" style={{ background: `var(--serie-${info.cor})` }} aria-hidden="true" />
      {t(curto ? info.curto : info.nome)}
    </span>
  );
}

export function Selo({ children, tom = 'neutro' }) {
  return <span className={`selo selo-${tom}`}>{children}</span>;
}

/** Barras horizontais a partir de uma linha de base; o valor fica na ponta. */
export function ListaBarras({ itens, max, formato = (v) => v, rotuloLargura = '16rem', vazio }) {
  const topo = max ?? Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <p className="mudo">{vazio || t('Sem dados ainda.')}</p>;
  return (
    <ul className="barras" style={{ '--rotulo': rotuloLargura }}>
      {itens.map((item) => (
        <li key={item.chave ?? item.rotulo} className="barra-linha" tabIndex={0}>
          <span className="barra-rotulo">
            {item.cor !== undefined && (
              <span className="ponto" style={{ background: `var(--serie-${item.cor})` }} aria-hidden="true" />
            )}
            <span className="barra-texto">{item.rotulo}</span>
          </span>
          <span className="barra-trilho">
            <span className="barra" style={{ width: `${(item.valor / topo) * 100}%`,
              background: item.cor !== undefined ? `var(--serie-${item.cor})` : 'var(--sequencial)' }} />
            <span className="barra-valor">{formato(item.valor, item)}</span>
          </span>
          {item.dica && <span className="dica" role="tooltip">{item.dica}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Numero({ rotulo, valor, detalhe }) {
  return (
    <div className="numero">
      <span className="numero-rotulo">{rotulo}</span>
      <span className="numero-valor">{valor}</span>
      {detalhe && <span className="numero-detalhe">{detalhe}</span>}
    </div>
  );
}

export function Vazio({ titulo, children, acao }) {
  return (
    <div className="vazio">
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
      {acao}
    </div>
  );
}

/** Confirmação dentro da página (o visualizador não exibe confirm()). */
export function Confirmar({ aberto, titulo, texto, rotuloOk, perigo, onOk, onCancelar }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const tecla = (e) => e.key === 'Escape' && onCancelar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aberto, onCancelar]);
  if (!aberto) return null;
  return (
    <div className="sobreposicao" role="presentation" onClick={onCancelar}>
      <div className="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo"
        onClick={(e) => e.stopPropagation()}>
        <h3 id="dialogo-titulo">{titulo}</h3>
        {texto && <p>{texto}</p>}
        <div className="linha-botoes">
          <button className="botao" onClick={onCancelar}>{t('Cancelar')}</button>
          <button className={`botao ${perigo ? 'botao-perigo' : 'botao-primario'}`} onClick={onOk} autoFocus>
            {rotuloOk}
          </button>
        </div>
      </div>
    </div>
  );
}

function Figura({ arquivo, rotulo }) {
  const [ampliada, setAmpliada] = useState(false);
  useEffect(() => {
    if (!ampliada) return undefined;
    const tecla = (e) => e.key === 'Escape' && setAmpliada(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [ampliada]);
  return (
    <figure className="figura">
      <button className="figura-botao" onClick={() => setAmpliada(true)} aria-label={t('Ampliar {r}', { r: rotulo })}>
        <img src={`img/${arquivo}`} alt={rotulo} loading="lazy" />
        <span className="figura-lupa"><Icone nome="lupa" tamanho={16} /> {t('Ampliar')}</span>
      </button>
      {ampliada && (
        <div className="sobreposicao zoom" role="dialog" aria-modal="true" aria-label={rotulo}
          onClick={() => setAmpliada(false)}>
          <img src={`img/${arquivo}`} alt={rotulo} />
          <button className="botao zoom-fechar" onClick={() => setAmpliada(false)}>
            <Icone nome="x" /> {t('Fechar')}
          </button>
        </div>
      )}
    </figure>
  );
}

export function Enunciado({ q }) {
  let figura = 0;
  return (
    <div className="enunciado">
      {q.enunciado.split('\n').map((parte, i) => {
        if (/^\[FIG:\d+\]$/.test(parte)) {
          const arquivo = q.figuras[figura++];
          return arquivo ? <Figura key={i} arquivo={arquivo} rotulo={t('Figura {f} da questão {n}', { f: figura, n: q.numero })} /> : null;
        }
        return <p key={i}>{parte}</p>;
      })}
    </div>
  );
}

/**
 * Uma questão no formato do caderno: enunciado, alternativas com bolhas de cartão-resposta,
 * opção de riscar alternativas e, depois de respondida, o gabarito oficial.
 */
export function Questao({ q, escolha, onEscolher, revelada, eliminadas, onEliminar, marcada, onMarcar,
  mostrarClassificacao, extra }) {
  return (
    <article className="questao" aria-labelledby={`titulo-${q.id}`}>
      <header className="questao-cabecalho">
        <div className="questao-selo" id={`titulo-${q.id}`}>
          <span className="questao-num">{t('QUESTÃO')} {q.numero}</span>
          <span className="questao-prova">{q.rotulo}</span>
        </div>
        <div className="questao-tags">
          <TagArea area={q.area} />
          {mostrarClassificacao && <Selo>{t(q.especialidade)}</Selo>}
          {q.dificuldade && <Selo tom={`dif-${q.dificuldade === 'fácil' ? 'facil' : q.dificuldade === 'difícil' ? 'dificil' : 'media'}`}>{t(q.dificuldade[0].toUpperCase() + q.dificuldade.slice(1))}</Selo>}
          {q.incidencia === 'alta' && <Selo tom="destaque">{t('Alta incidência')}</Selo>}
          {q.anulada && <Selo tom="aviso">{t('Anulada pelo Inep')}</Selo>}
          {onMarcar && (
            <button className={`botao-icone ${marcada ? 'ativo' : ''}`} onClick={onMarcar} aria-pressed={!!marcada}
              title={t(marcada ? 'Desmarcar questão (M)' : 'Marcar para rever depois (M)')}>
              <Estrela cheia={marcada} /><span className="sr">{t(marcada ? 'Desmarcar' : 'Marcar')}</span>
            </button>
          )}
        </div>
      </header>

      <Enunciado q={q} />

      <ol className="alternativas" role="radiogroup" aria-label={t('Alternativas')}>
        {q.alternativas.map((texto, i) => {
          const letra = LETRAS[i];
          const escolhida = escolha === letra;
          const certa = revelada && q.gabarito === letra;
          const errada = revelada && escolhida && q.gabarito !== letra;
          const riscada = !revelada && eliminadas?.has(letra);
          const classes = ['alternativa', escolhida && 'escolhida', certa && 'certa', errada && 'errada',
            riscada && 'riscada'].filter(Boolean).join(' ');
          return (
            <li key={letra} className={classes}>
              <button className="alternativa-botao" role="radio" aria-checked={escolhida}
                disabled={revelada || !onEscolher} onClick={() => onEscolher(escolhida ? null : letra)}>
                <span className="bolha" aria-hidden="true">{letra}</span>
                <span className="alternativa-texto">{texto}</span>
                {certa && <span className="marca-resultado certo"><Icone nome="check" tamanho={16} />{t('Gabarito')}</span>}
                {errada && <span className="marca-resultado errado"><Icone nome="x" tamanho={16} />{t('Sua resposta')}</span>}
              </button>
              {onEliminar && !revelada && (
                <button className="botao-icone riscar" onClick={() => onEliminar(letra)}
                  aria-pressed={!!riscada} title={t(riscada ? 'Desfazer: alternativa {l}' : 'Riscar alternativa {l}', { l: letra })}>
                  <Icone nome="riscar" tamanho={16} /><span className="sr">{t('Riscar {l}', { l: letra })}</span>
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {revelada && (
        <div className="questao-rodape">
          {q.anulada ? (
            <p className="nota-anulada">{t('O Inep anulou esta questão no gabarito definitivo. Ela não conta no seu desempenho.')}</p>
          ) : (
            <dl className="classificacao">
              <div><dt>{t('Especialidade')}</dt><dd>{t(q.especialidade)}</dd></div>
              {q.tema && <div><dt>{t('Tema')}</dt><dd>{q.tema}</dd></div>}
              {q.tipo && <div><dt>{t('Cobra')}</dt><dd>{t(q.tipo)}</dd></div>}
            </dl>
          )}
          {extra}
        </div>
      )}
    </article>
  );
}

// Aviso de limite do plano gratuito, com caminho direto para os planos.
export function AvisoLimite({ tipo }) {
  const { acesso, ir } = useApp();
  const texto = tipo === 'simulado'
    ? t('O plano gratuito inclui {n} simulado por mês, e você já usou o deste mês. Assine para fazer simulados ilimitados.', { n: acesso.limites.simuladosMes })
    : t('Você respondeu as {n} questões gratuitas de hoje. Amanhã liberam mais {n}, ou assine para treinar sem limite.', { n: acesso.limites.questoesDia });
  return (
    <div className="aviso-limite" role="status">
      <Icone nome="cadeado" />
      <p>{texto}</p>
      <button className="botao botao-primario" onClick={() => ir('planos')}>{t('Ver planos')}</button>
    </div>
  );
}
