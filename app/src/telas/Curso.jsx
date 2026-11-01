import { useEffect, useMemo } from '../react.js';
import { useApp, Icone, FalaMentor, AvisoLimite } from '../componentes.jsx';
import { plural, pct, formatarDuracao } from '../util.js';
import { t, tc, idiomaAtual } from '../i18n.js';
import { montarBaralho, filaDeEstudo } from '../flashcards.js';
import { Sessao as SessaoFlashcards } from './Flashcards.jsx';
import { LIMIAR, SEGUNDOS_POR_QUESTAO, modulosDoCurso, montarSimuladoModulo, filaDoModulo, tipoSimulado } from '../modulos.js';

/** Conteúdo da aula no idioma escolhido (cai no português se faltar a tradução). */
const textoDaAula = (aula) => (idiomaAtual() === 'es' && aula.es) || aula.pt;

function Aula({ aula, voltar }) {
  const { banco, progresso, despachar, iniciarSessao, setFiltro, ir } = useApp();
  const texto = textoDaAula(aula);
  const mentor = banco.mentorPorId[aula.mentor];
  const questoes = aula.questoes.map((id) => banco.porId[id]).filter(Boolean);
  const feita = !!progresso.aulas[aula.id];
  useEffect(() => { window.scrollTo({ top: 0 }); }, [aula.id]);

  return (
    <article className="aula">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Voltar ao módulo')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t(aula.area)} · {t(aula.especialidade)} · {t('{n} min de leitura', { n: aula.duracaoMin })}</span>
          <h1>{texto.titulo}</h1>
          <p className="mudo">{texto.resumo}</p>
        </div>
      </header>
      {mentor && (
        <FalaMentor mentor={mentor}>
          <p>{tc(mentor, 'bordoes')[0]}</p>
        </FalaMentor>
      )}

      <div className="aula-corpo">
        <div className="aula-texto">
          {texto.secoes.map((s) => (
            <section key={s.titulo} className="aula-secao">
              <h2>{s.titulo}</h2>
              {s.paragrafos.map((p) => <p key={p}>{p}</p>)}
              {s.itens.length > 0 && <ul>{s.itens.map((i) => <li key={i}>{i}</li>)}</ul>}
              {(s.figuras || []).map((f) => (
                <figure key={f.arquivo} className="aula-figura">
                  <img src={`img/${f.arquivo}`} alt={f.alt} loading="lazy" />
                  <figcaption>{f.legenda}</figcaption>
                </figure>
              ))}
            </section>
          ))}
          <section className="aula-secao aula-pegadinhas">
            <h2>{t('Pegadinhas da banca')}</h2>
            <ul>{texto.pegadinhas.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        </div>

        <aside className="aula-lado">
          <section className="cartao">
            <span className="sobretitulo">{t('Caiu assim na prova')}</span>
            <p className="mudo pequeno">{t('As questões abrem em português, como na prova do Inep.')}</p>
            <div className="chips">
              {questoes.map((q) => (
                <button key={q.id} className="chip" onClick={() => iniciarSessao({ titulo: texto.titulo, ids: [q.id], origem: 'treino' })}>
                  {q.rotulo} · Q{q.numero}
                </button>
              ))}
            </div>
            <div className="linha-botoes">
              <button className="botao botao-primario" disabled={!questoes.length}
                onClick={() => iniciarSessao({ titulo: texto.titulo, ids: questoes.map((q) => q.id), origem: 'treino' })}>
                {t('Resolver as {n} questões da aula', { n: questoes.length })}
              </button>
              <button className="botao" onClick={() => { setFiltro((f) => ({ ...f, especialidade: aula.especialidade, areas: [], edicoes: [] })); ir('questoes'); }}>
                {t('Todas de {esp}', { esp: t(aula.especialidade) })}
              </button>
            </div>
          </section>
          <section className="cartao">
            <span className="sobretitulo">{t('Referências')}</span>
            <ul className="lista-conduta">{aula.referencias.map((r) => <li key={r}>{r}</li>)}</ul>
            {aula.revisao !== 'revisada' && <p className="mudo pequeno">{t('Texto em revisão médica. Confira sempre a versão vigente dos protocolos.')}</p>}
          </section>
          <button className={`botao botao-largo ${feita ? '' : 'botao-primario'}`} aria-pressed={feita}
            onClick={() => despachar({ tipo: 'concluirAula', id: aula.id, feita: !feita })}>
            {feita ? <><Icone nome="check" /> {t('Aula concluída')}</> : t('Marcar aula como concluída')}
          </button>
        </aside>
      </div>
    </article>
  );
}

const ROTULO_STATUS = { bloqueado: 'Bloqueado', novo: 'Não iniciado', andamento: 'Em andamento', concluido: 'Concluído' };
const ROTULO_PARTE = { questoes: 'Questões', flashcards: 'Flashcards', aulas: 'Aulas' };

function Anel({ fracao, cor, tamanho = 64 }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className="anel" width={tamanho} height={tamanho} viewBox="0 0 64 64" role="img" aria-label={`${Math.round(fracao * 100)}%`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--linha)" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={cor} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, fracao)} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="anel-texto">{Math.round(fracao * 100)}%</text>
    </svg>
  );
}

function Modulo({ m, proximo, abrirAula, voltar }) {
  const { acesso, banco, progresso, despachar, iniciarSessao, ir, cursoVista, setCursoVista } = useApp();
  const fila = filaDoModulo(progresso, m);
  const cor = `var(--serie-${m.area.cor})`;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [m.numero]);

  if (cursoVista.flashcards) {
    const baralho = montarBaralho(banco).filter((c) => c.tipo === 'conceito' && c.area === m.area.nome);
    return <SessaoFlashcards fila={filaDeEstudo(baralho, progresso.flashcards, { novos: 20 })} sair={() => setCursoVista({ ...cursoVista, flashcards: false })} />;
  }
  const responder = (ids, titulo) => iniciarSessao({ titulo, ids, origem: 'modulo' });
  const iniciarSimulado = () => {
    if (!acesso.podeSimular) return;
    const ids = montarSimuladoModulo(banco, progresso, m);
    const agora = Date.now();
    despachar({ tipo: 'iniciarSimulado', simulado: {
      id: `sim-${agora}`, tipo: tipoSimulado(m.area.nome), titulo: t('Simulado do módulo {n} · {area}', { n: m.numero, area: t(m.area.nome) }),
      ids, inicio: agora, duracao: ids.length * SEGUNDOS_POR_QUESTAO, respostas: {}, duvidas: {}, indice: 0, pausaAcumulada: 0, pausadoEm: null,
    } });
    ir('simulado');
  };
  const simuladoFeito = progresso.simulados.find((s) => s.tipo === tipoSimulado(m.area.nome));
  const nSimulado = montarSimuladoModulo(banco, progresso, m).length;

  return (
    <div className="modulo-tela">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Todos os módulos')}</button>
      <header className="modulo-topo" style={{ '--cor-modulo': cor }}>
        <Anel fracao={m.fracao} cor={cor} tamanho={84} />
        <div>
          <span className="sobretitulo">{t('Módulo {n}', { n: m.numero })} · {t(ROTULO_STATUS[m.status])}</span>
          <h1>{t(m.area.nome)}</h1>
          <p className="mudo">{m.fracao >= LIMIAR ? t('Simulado do módulo liberado.') : t('Chegue a 90% para liberar o simulado deste módulo.')}</p>
        </div>
      </header>

      <div className="modulo-partes">
        <section className="cartao parte">
          <span className="sobretitulo">{t('Questões')}</span>
          <strong className="parte-numero">{m.respondidas}<small>/{m.questoes.length}</small></strong>
          <span className="trilho-progresso"><span style={{ width: `${pct(m.respondidas, m.questoes.length)}%`, background: cor }} /></span>
          <p className="mudo pequeno">{t('Depois de cada resposta, o comentário explica por que a alternativa está certa ou errada.')}</p>
          <div className="linha-botoes">
            <button className="botao botao-primario" disabled={!fila.novas.length}
              onClick={() => responder(fila.novas, t('Módulo {n} · {area}', { n: m.numero, area: t(m.area.nome) }))}>
              {fila.novas.length ? t('Responder {q}', { q: plural(fila.novas.length, 'questão', 'questões') }) : t('Todas respondidas')}
            </button>
            {fila.erradas.length > 0 && (
              <button className="botao" onClick={() => responder(fila.erradas, t('Refazendo erradas'))}>{t('Refazer as {n} erradas', { n: fila.erradas.length })}</button>
            )}
          </div>
        </section>

        <section className="cartao parte">
          <span className="sobretitulo">{t('Flashcards')}</span>
          <strong className="parte-numero">{m.estudados}<small>/{m.cartoes.length}</small></strong>
          <span className="trilho-progresso"><span style={{ width: `${pct(m.estudados, m.cartoes.length)}%`, background: cor }} /></span>
          <p className="mudo pequeno">{t('Conceitos-chave da área com revisão espaçada.')}</p>
          <div className="linha-botoes">
            <button className="botao" disabled={!m.cartoes.length} onClick={() => setCursoVista({ ...cursoVista, flashcards: true })}>{t('Estudar flashcards')}</button>
          </div>
        </section>

        <section className="cartao parte">
          <span className="sobretitulo">{t('Aulas em texto')}</span>
          <strong className="parte-numero">{m.concluidas}<small>/{m.aulas.length}</small></strong>
          <span className="trilho-progresso"><span style={{ width: `${pct(m.concluidas, m.aulas.length)}%`, background: cor }} /></span>
          <ul className="lista-aulas">
            {m.aulas.map((a) => (
              <li key={a.id}>
                <button className="botao-texto" onClick={() => abrirAula(a.id)}>
                  {progresso.aulas[a.id] ? <Icone nome="check" tamanho={14} /> : <span className="ponto-aula" aria-hidden="true" />}
                  {textoDaAula(a).titulo}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={`cartao simulado-modulo ${m.simuladoLiberado ? '' : 'travado'}`}>
        <div>
          <span className="sobretitulo">{t('Fim do módulo')}</span>
          <h2>{t('Simulado do módulo')}</h2>
          <p className="mudo">{m.simuladoLiberado
            ? t('{q} com tempo de prova: todas as que você praticou e as novas da área. {d}.', { q: plural(nSimulado, 'questão', 'questões'), d: formatarDuracao(nSimulado * SEGUNDOS_POR_QUESTAO) })
            : t('Libera quando o módulo chegar a 90%. Agora: {p}%.', { p: Math.round(m.fracao * 100) })}</p>
          {simuladoFeito && <p className="mudo pequeno">{t('Último resultado: {p}% de acerto.', { p: pct(simuladoFeito.certas, simuladoFeito.validas) })}</p>}
        </div>
        <button className="botao botao-primario botao-grande" disabled={!m.simuladoLiberado || !!progresso.simuladoAtivo || !acesso.podeSimular} onClick={iniciarSimulado}>
          {m.simuladoLiberado ? <><Icone nome="relogio" /> {t(simuladoFeito ? 'Refazer o simulado' : 'Começar o simulado')}</> : <><Icone nome="cadeado" /> {t('Bloqueado')}</>}
        </button>
      </section>
      {m.simuladoLiberado && !acesso.podeSimular && <AvisoLimite tipo="simulado" />}
    </div>
  );
}

export default function Curso() {
  const { banco, progresso, cursoVista, setCursoVista } = useApp();
  const modulos = useMemo(() => modulosDoCurso(banco, progresso), [banco, progresso]);
  const indice = modulos.findIndex((m) => m.numero === cursoVista.modulo);
  const m = modulos[indice];
  const aula = m && banco.aulas.find((a) => a.id === cursoVista.aula);

  if (aula) return <Aula key={aula.id} aula={aula} voltar={() => setCursoVista({ modulo: m.numero })} />;
  if (m && m.liberado) {
    return <Modulo m={m} proximo={modulos[indice + 1]} abrirAula={(id) => setCursoVista({ modulo: m.numero, aula: id })}
      voltar={() => setCursoVista({})} />;
  }

  return (
    <div className="tela-curso">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Curso')}</span>
          <h1>{t('Curso completo do ENAMED')}</h1>
          <p className="mudo">{t('Um módulo por grande área e um de SUS. Todos estão abertos: estude na ordem que preferir. Com 90% entre questões, flashcards e aulas, o módulo libera o seu simulado.')}</p>
        </div>
      </header>
      <ol className="grade-modulos">
        {modulos.map((x) => {
          const cor = `var(--serie-${x.area.cor})`;
          return (
            <li key={x.numero}>
              <button className={`modulo-cartao modulo-${x.status}`} disabled={!x.liberado} style={{ '--cor-modulo': cor }}
                onClick={() => setCursoVista({ modulo: x.numero })}
                aria-label={`${t('Módulo {n} · {area}', { n: x.numero, area: t(x.area.nome) })}, ${t(ROTULO_STATUS[x.status])}, ${Math.round(x.fracao * 100)}%`}>
                <span className="modulo-cartao-topo">
                  <span className="modulo-cartao-num">{t('Módulo {n}', { n: x.numero })}</span>
                  {x.liberado ? <Anel fracao={x.fracao} cor={cor} tamanho={52} /> : <span className="cadeado"><Icone nome="cadeado" tamanho={22} /></span>}
                </span>
                <strong className="modulo-cartao-nome">{t(x.area.nome)}</strong>
                <span className="modulo-cartao-status">
                  {x.liberado ? t(ROTULO_STATUS[x.status]) : t('Libera com 90% do módulo {n}', { n: x.numero - 1 })}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
