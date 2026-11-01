import { useState, useEffect, useMemo, useRef } from '../react.js';
import { useApp, Questao, Icone, Numero, ListaBarras, Confirmar, Selo, AvisoLimite } from '../componentes.jsx';
import { AREAS, infoArea, idEdicao } from '../data.js';
import { ultimaResposta } from '../progresso.js';
import { embaralhar, formatarTempo, formatarDuracao, formatarData, formatarPct, pct, plural } from '../util.js';
import { t } from '../i18n.js';

const SEGUNDOS_POR_QUESTAO = 180; // 5 horas para 100 questões, como no Revalida

function montarPersonalizado(banco, progresso, { quantidade, edicoes, priorizarNovas }) {
  const base = banco.questoes.filter((q) => !q.anulada && (!edicoes.length || edicoes.includes(idEdicao(q))));
  const filas = AREAS.map((a) => {
    const daArea = base.filter((q) => q.area === a.nome);
    const novas = embaralhar(daArea.filter((q) => !ultimaResposta(progresso, q.id)));
    const feitas = embaralhar(daArea.filter((q) => ultimaResposta(progresso, q.id)));
    return priorizarNovas ? [...novas, ...feitas] : embaralhar(daArea);
  });
  // Mesmo rodízio de áreas do caderno do Inep: Clínica, Cirurgia, Pediatria, GO, MFC...
  const ids = [];
  for (let rodada = 0; ids.length < quantidade && filas.some((f) => f.length > rodada); rodada++) {
    for (const fila of filas) if (fila[rodada] && ids.length < quantidade) ids.push(fila[rodada].id);
  }
  return ids;
}

function resultadoDe(sim, banco, fim) {
  const porArea = {};
  let certas = 0;
  let validas = 0;
  for (const id of sim.ids) {
    const q = banco.porId[id];
    if (q.anulada) continue;
    const a = (porArea[q.area] ||= { certas: 0, validas: 0 });
    a.validas++;
    validas++;
    if (sim.respostas[id] === q.gabarito) {
      a.certas++;
      certas++;
    }
  }
  return {
    id: sim.id, titulo: sim.titulo, tipo: sim.tipo, ids: sim.ids, respostas: sim.respostas, inicio: sim.inicio, fim,
    tempoUsado: Math.round((fim - sim.inicio - (sim.pausaAcumulada || 0)) / 1000), duracao: sim.duracao,
    certas, validas, porArea,
  };
}

function Configurar() {
  const { acesso, banco, progresso, despachar } = useApp();
  const [edicao, setEdicao] = useState(banco.edicoes[0]?.id || '');
  const [quantidade, setQuantidade] = useState(20);
  const [edicoes, setEdicoes] = useState([]);
  const [priorizarNovas, setPriorizarNovas] = useState(true);
  const disponiveis = banco.questoes.filter((q) => !q.anulada && (!edicoes.length || edicoes.includes(idEdicao(q)))).length;

  const iniciar = (tipo) => {
    if (!acesso.podeSimular) return;
    const agora = Date.now();
    let ids;
    let titulo;
    if (tipo === 'prova') {
      const ed = banco.edicoes.find((e) => e.id === edicao);
      ids = banco.questoes.filter((q) => idEdicao(q) === edicao).sort((a, b) => a.numero - b.numero).map((q) => q.id);
      titulo = t('{ed} na íntegra', { ed: ed.rotulo });
    } else {
      ids = montarPersonalizado(banco, progresso, { quantidade, edicoes, priorizarNovas });
      titulo = t('Simulado de {n} questões', { n: ids.length });
    }
    despachar({ tipo: 'iniciarSimulado', simulado: {
      id: `sim-${agora}`, tipo, titulo, ids, inicio: agora, duracao: ids.length * SEGUNDOS_POR_QUESTAO,
      respostas: {}, duvidas: {}, indice: 0, pausaAcumulada: 0, pausadoEm: null,
    } });
  };

  return (
    <div className="grade-cartoes">
      {!acesso.podeSimular && <div className="grade-largura-total"><AvisoLimite tipo="simulado" /></div>}
      <section className="cartao">
        <span className="sobretitulo">{t('Como no dia da prova')}</span>
        <h2>{t('Prova na íntegra')}</h2>
        <p className="mudo">{t('As 100 questões na ordem do caderno, com 5 horas de prova. O gabarito só aparece quando você entregar.')}</p>
        <label className="campo">
          <span className="rotulo-campo">{t('Edição')}</span>
          <select id="simulado-edicao" value={edicao} onChange={(e) => setEdicao(e.target.value)}>
            {banco.edicoes.map((e) => <option key={e.id} value={e.id}>{e.rotulo} · {t('{n} questões', { n: e.questoes })}</option>)}
          </select>
        </label>
        <button className="botao botao-primario" onClick={() => iniciar('prova')} disabled={!edicao || !acesso.podeSimular}>
          <Icone nome="relogio" /> {t('Começar prova de 5 horas')}
        </button>
      </section>

      <section className="cartao">
        <span className="sobretitulo">{t('Rápido e equilibrado')}</span>
        <h2>{t('Simulado sob medida')}</h2>
        <p className="mudo">{t('Mesma proporção do Inep: um quinto de cada grande área, em rodízio. 3 minutos por questão.')}</p>
        <div className="filtro-grupo">
          <span className="rotulo-campo">{t('Quantidade')}</span>
          <div className="segmentado" role="group" aria-label={t('Quantidade de questões')}>
            {[10, 20, 30, 50, 100].map((n) => (
              <button key={n} className={quantidade === n ? 'ativo' : ''} aria-pressed={quantidade === n}
                onClick={() => setQuantidade(n)} disabled={n > disponiveis}>{n}</button>
            ))}
          </div>
        </div>
        <div className="filtro-grupo">
          <span className="rotulo-campo">{t('Provas de origem')}</span>
          <div className="chips">
            {banco.edicoes.map((e) => (
              <button key={e.id} className={`chip ${edicoes.includes(e.id) ? 'ativo' : ''}`} aria-pressed={edicoes.includes(e.id)}
                onClick={() => setEdicoes(edicoes.includes(e.id) ? edicoes.filter((x) => x !== e.id) : [...edicoes, e.id])}>
                {e.rotulo}
              </button>
            ))}
            {!edicoes.length && <span className="mudo pequeno">{t('todas')}</span>}
          </div>
        </div>
        <label className="alternador">
          <input id="simulado-novas" type="checkbox" checked={priorizarNovas} onChange={(e) => setPriorizarNovas(e.target.checked)} />
          {t('Priorizar questões que ainda não fiz')}
        </label>
        <button className="botao botao-primario" onClick={() => iniciar('personalizado')} disabled={!acesso.podeSimular}>
          {t('Começar')} · {formatarDuracao(Math.min(quantidade, disponiveis) * SEGUNDOS_POR_QUESTAO)}
        </button>
      </section>
    </div>
  );
}

function Historico({ abrir }) {
  const { progresso } = useApp();
  if (!progresso.simulados.length) return null;
  return (
    <section className="secao">
      <h2>{t('Simulados anteriores')}</h2>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead><tr><th>{t('Data')}</th><th>{t('Simulado')}</th><th className="num">{t('Acertos')}</th><th className="num">{t('Tempo')}</th><th /></tr></thead>
          <tbody>
            {progresso.simulados.map((s) => (
              <tr key={s.id}>
                <td>{formatarData(s.fim)}</td>
                <td>{s.titulo}</td>
                <td className="num">{formatarPct(s.certas, s.validas)} <span className="mudo">({s.certas}/{s.validas})</span></td>
                <td className="num">{formatarDuracao(s.tempoUsado)}</td>
                <td><button className="botao-texto" onClick={() => abrir(s.id)}>{t('Ver resultado')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Resultado({ resultado, voltar }) {
  const { iniciarSessao } = useApp();
  const itens = AREAS.filter((a) => resultado.porArea[a.nome]).map((a) => {
    const r = resultado.porArea[a.nome];
    return { chave: a.nome, rotulo: t(a.curto), cor: a.cor, valor: pct(r.certas, r.validas),
      dica: `${t(a.nome)}: ${t('{n} de {total} certas', { n: r.certas, total: r.validas })}` };
  });
  const brancas = resultado.ids.filter((id) => !resultado.respostas[id]).length;
  return (
    <section className="resultado-simulado">
      <span className="sobretitulo">{t('Resultado')} · {formatarData(resultado.fim)}</span>
      <h2>{resultado.titulo}</h2>
      <div className="numeros">
        <Numero rotulo={t('Acertos')} valor={formatarPct(resultado.certas, resultado.validas)}
          detalhe={t('{n} de {q}', { n: resultado.certas, q: plural(resultado.validas, 'questão válida', 'questões válidas') })} />
        <Numero rotulo={t('Tempo usado')} valor={formatarDuracao(resultado.tempoUsado)} detalhe={t('de {d}', { d: formatarDuracao(resultado.duracao) })} />
        <Numero rotulo={t('Em branco')} valor={brancas} detalhe={t(brancas ? 'contam como erro' : 'respondeu todas')} />
      </div>
      <h3>{t('Acertos por grande área')}</h3>
      <ListaBarras itens={itens} max={100} formato={(v) => `${v}%`} rotuloLargura="11rem" />
      <p className="mudo pequeno">{t('Questões anuladas pelo Inep não entram na conta. As erradas já foram para a sua revisão espaçada.')}</p>
      <div className="linha-botoes">
        <button className="botao botao-primario" onClick={() => iniciarSessao({
          titulo: resultado.titulo, ids: resultado.ids, origem: 'simulado-revisao', fixas: resultado.respostas })}>
          {t('Corrigir questão por questão')}
        </button>
        <button className="botao" onClick={voltar}>{t('Novo simulado')}</button>
      </div>
    </section>
  );
}

function EmAndamento({ sim, aoFinalizar }) {
  const { banco, despachar } = useApp();
  const [agora, setAgora] = useState(Date.now());
  const [eliminadas, setEliminadas] = useState({});
  const [confirmar, setConfirmar] = useState(null);
  const finalizado = useRef(false);
  const pausado = !!sim.pausadoEm;
  const decorrido = ((pausado ? sim.pausadoEm : agora) - sim.inicio - (sim.pausaAcumulada || 0)) / 1000;
  const restante = sim.duracao - decorrido;
  const q = banco.porId[sim.ids[sim.indice]];
  const respondidas = Object.keys(sim.respostas).length;
  const atualizar = (dados) => despachar({ tipo: 'atualizarSimulado', dados });

  const finalizar = () => {
    if (finalizado.current) return;
    finalizado.current = true;
    const fim = Date.now();
    const resultado = resultadoDe(sim, banco, fim);
    const corretas = Object.fromEntries(sim.ids.filter((id) => !banco.porId[id].anulada).map((id) => [id, banco.porId[id].gabarito]));
    despachar({ tipo: 'finalizarSimulado', resultado, corretas });
    aoFinalizar(resultado.id);
  };

  useEffect(() => {
    if (pausado) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pausado]);
  useEffect(() => { if (restante <= 0 && !pausado) finalizar(); }, [restante <= 0]);

  const irPara = (i) => atualizar({ indice: Math.max(0, Math.min(sim.ids.length - 1, i)) });
  const pausar = () => (pausado
    ? atualizar({ pausadoEm: null, pausaAcumulada: (sim.pausaAcumulada || 0) + (Date.now() - sim.pausadoEm) })
    : atualizar({ pausadoEm: Date.now() }));

  return (
    <div className="tela-simulado">
      <div className="barra-sessao fixa">
        <div>
          <span className="sobretitulo">{t('Simulado')}</span>
          <h2 className="titulo-sessao">{sim.titulo}</h2>
        </div>
        <div className="controles-simulado">
          <span className={`cronometro ${restante < 600 ? 'alerta' : ''}`} role="timer" aria-label={t('Tempo restante')}>
            <Icone nome="relogio" tamanho={16} /> {formatarTempo(restante)}
          </span>
          <button className="botao" onClick={pausar}>{t(pausado ? 'Retomar' : 'Pausar')}</button>
          <button className="botao botao-primario" onClick={() => setConfirmar('entregar')}>{t('Entregar')}</button>
        </div>
      </div>

      <div className="simulado-corpo">
        <aside className="paleta" aria-label={t('Mapa de questões')}>
          <div className="paleta-legenda">
            <span>{respondidas}/{sim.ids.length} {t('respondidas')}</span>
          </div>
          <div className="paleta-grade">
            {sim.ids.map((id, i) => {
              const classes = ['paleta-item', sim.respostas[id] && 'respondida', sim.duvidas[id] && 'duvida',
                i === sim.indice && 'atual'].filter(Boolean).join(' ');
              return (
                <button key={id} className={classes} onClick={() => irPara(i)}
                  aria-label={`${t('Questão')} ${i + 1}${sim.respostas[id] ? t(', respondida') : ''}${sim.duvidas[id] ? t(', com dúvida') : ''}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <ul className="paleta-chave">
            <li><span className="amostra respondida" />{t('Respondida')}</li>
            <li><span className="amostra duvida" />{t('Com dúvida')}</li>
            <li><span className="amostra" />{t('Em branco')}</li>
          </ul>
          <button className="botao-texto perigo" onClick={() => setConfirmar('descartar')}>{t('Descartar simulado')}</button>
        </aside>

        <div className="simulado-questao">
          {pausado ? (
            <div className="pausa">
              <h3>{t('Simulado pausado')}</h3>
              <p className="mudo">{t('O cronômetro está parado. As questões ficam ocultas até você retomar.')}</p>
              <button className="botao botao-primario" onClick={pausar}>{t('Retomar')}</button>
            </div>
          ) : (
            <>
              <Questao q={{ ...q, numero: sim.tipo === 'prova' ? q.numero : sim.indice + 1, rotulo: sim.tipo === 'prova' ? q.rotulo : `${q.rotulo} · Q${q.numero}` }}
                escolha={sim.respostas[q.id] || null} revelada={false}
                onEscolher={(letra) => {
                  const { [q.id]: _, ...resto } = sim.respostas;
                  atualizar({ respostas: letra ? { ...resto, [q.id]: letra } : resto });
                }}
                eliminadas={eliminadas[q.id]}
                onEliminar={(letra) => setEliminadas((s) => {
                  const atual = new Set(s[q.id]);
                  atual.has(letra) ? atual.delete(letra) : atual.add(letra);
                  return { ...s, [q.id]: atual };
                })} />
              <nav className="navegacao-questao" aria-label={t('Navegação entre questões')}>
                <button className="botao" onClick={() => irPara(sim.indice - 1)} disabled={sim.indice === 0}>
                  <Icone nome="esquerda" /> {t('Anterior')}
                </button>
                <button className={`botao ${sim.duvidas[q.id] ? 'botao-aviso' : ''}`} aria-pressed={!!sim.duvidas[q.id]}
                  onClick={() => {
                    const { [q.id]: marcada, ...resto } = sim.duvidas;
                    atualizar({ duvidas: marcada ? resto : { ...resto, [q.id]: true } });
                  }}>
                  <Icone nome="bandeira" /> {t(sim.duvidas[q.id] ? 'Com dúvida' : 'Marcar dúvida')}
                </button>
                {sim.indice < sim.ids.length - 1 ? (
                  <button className="botao botao-primario" onClick={() => irPara(sim.indice + 1)}>
                    {t('Próxima')} <Icone nome="direita" />
                  </button>
                ) : (
                  <button className="botao botao-primario" onClick={() => setConfirmar('entregar')}>{t('Entregar')}</button>
                )}
              </nav>
            </>
          )}
        </div>
      </div>

      <Confirmar aberto={confirmar === 'entregar'} titulo={t('Entregar o simulado?')}
        texto={respondidas < sim.ids.length
          ? t('Você deixou {q} em branco. Questões em branco contam como erro.', { q: plural(sim.ids.length - respondidas, 'questão', 'questões') })
          : t('Você respondeu todas as questões. Depois de entregar, o gabarito aparece.')}
        rotuloOk={t('Entregar e ver resultado')} onOk={finalizar} onCancelar={() => setConfirmar(null)} />
      <Confirmar aberto={confirmar === 'descartar'} titulo={t('Descartar este simulado?')} perigo
        texto={t('As respostas deste simulado serão apagadas e não entram no seu desempenho.')}
        rotuloOk={t('Descartar')} onOk={() => { despachar({ tipo: 'descartarSimulado' }); setConfirmar(null); }}
        onCancelar={() => setConfirmar(null)} />
    </div>
  );
}

export default function Simulado() {
  const { progresso } = useApp();
  const [resultadoId, setResultadoId] = useState(null);
  const resultado = useMemo(() => progresso.simulados.find((s) => s.id === resultadoId), [progresso.simulados, resultadoId]);

  if (progresso.simuladoAtivo) return <EmAndamento sim={progresso.simuladoAtivo} aoFinalizar={setResultadoId} />;
  if (resultado) return <Resultado resultado={resultado} voltar={() => setResultadoId(null)} />;
  return (
    <div className="tela-simulado-config">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Simulado')}</span>
          <h1>{t('Treine com tempo de prova')}</h1>
          <p className="mudo">{t('Sem gabarito durante a prova. No final você vê o desempenho por área e corrige questão por questão.')}</p>
        </div>
      </header>
      <Configurar />
      <Historico abrir={setResultadoId} />
    </div>
  );
}
