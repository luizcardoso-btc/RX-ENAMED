import { useState, useEffect, useRef } from '../../react.js';
import { useApp, Icone, Numero, FalaMentor, Confirmar } from '../../componentes.jsx';
import { infoArea } from '../../data.js';
import { formatarTempo } from '../../util.js';
import { t, tc, idiomaAtual } from '../../i18n.js';
import { api } from '../../pratica-api.js';
import { NIVEIS, ORIGENS } from '../../../../compartilhado/estacoes.js';
import { SeloOrigem, Impresso, useRestante, Recomendacoes, notaTexto } from './comum.jsx';

const ROTULO_MODO = { gratuito: 'Paciente simulado gratuito', roteiro: 'Modo roteiro', ia: 'Paciente por IA' };

/* ------------------------------------------------------------------ instruções (impresso da porta) */

function Instrucoes({ e, modo, setModo, iaDisponivel, iniciar, voltar, simulado, carregando }) {
  const { banco } = useApp();
  const mentor = banco.mentorPorId[e.mentor];
  const semRoteiro = !e.modos?.gratuito;
  return (
    <div className="estacao-instrucoes">
      {!simulado && <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Todas as estações')}</button>}
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">
            {simulado ? `${t('Simulado')} · ${t('estação {i} de {n}', { i: simulado.indice + 1, n: simulado.total })} · ` : ''}
            {t(infoArea(e.area).curto)} · {e.duracaoMin} {t('minutos')}
          </span>
          <h1>{e.titulo}</h1>
          <SeloOrigem origem={e.origem} edicao={e.edicao} />
        </div>
      </header>
      <div className="grade-2">
        <section className="cartao impresso">
          <span className="sobretitulo">{t('Cenário de atuação')}</span>
          <p>{e.cenario}</p>
          {e.instrucoes?.length > 0 && <>
            <span className="sobretitulo">{t('Descrição do caso')}</span>
            {e.instrucoes.map((x) => <p key={x}>{x}</p>)}
          </>}
          {!e.instrucoes?.length && e.paciente && <>
            <span className="sobretitulo">{t('Paciente')}</span>
            <p>{[e.paciente.nome, e.paciente.idade && (typeof e.paciente.idade === 'number' ? `${e.paciente.idade} anos` : e.paciente.idade), e.paciente.ocupacao].filter(Boolean).join(', ')}.</p>
          </>}
          <span className="sobretitulo">{t('Nos próximos {n} minutos, você deverá', { n: simulado?.minutos || e.duracaoMin })}</span>
          <ol className="tarefas">{e.tarefas.map((x) => <li key={x}>{x}</li>)}</ol>
          {e.fonte?.url && <p className="mudo pequeno">{t('Fonte')}: Inep · {e.fonte.edicao}, {t('estação')} {e.fonte.estacao}. <a href={e.fonte.prova || e.fonte.url} target="_blank" rel="noopener">{t('Caderno oficial')}</a></p>}
        </section>
        <div className="coluna">
          <section className="cartao">
            {semRoteiro ? (
              <p className="aviso">{t('O documento oficial desta estação não traz o roteiro do paciente. Treine em dupla, com um colega fazendo o ator.')}</p>
            ) : simulado ? (
              <p className="mudo">{t('Modo do simulado')}: <strong>{t(ROTULO_MODO[modo])}</strong>. {t('O tempo começa quando você iniciar.')}</p>
            ) : (
              <>
                <span className="sobretitulo">{t('Como você quer treinar')}</span>
                {['gratuito', 'roteiro', 'ia'].map((m) => {
                  const indisponivel = m === 'ia' && !iaDisponivel;
                  return (
                    <label key={m} className={`opcao-modo ${modo === m ? 'ativo' : ''} ${indisponivel ? 'indisponivel' : ''}`}>
                      <input type="radio" name="modo" id={`modo-${m}`} checked={modo === m} disabled={indisponivel} onChange={() => setModo(m)} />
                      <span>
                        <strong>{t(ROTULO_MODO[m])}</strong>
                        <span className="mudo pequeno">{t({
                          gratuito: 'Você escreve como falaria na estação; o paciente responde só ao que for perguntado, pelo roteiro. Sem custo.',
                          roteiro: 'Você escolhe o que perguntar e o que pedir numa lista; bom para estudar o roteiro.',
                          ia: indisponivel ? 'Em breve: a conversa com IA ainda não está ativa na plataforma.' : 'Conversa livre com o paciente simulado por IA.',
                        }[m])}</span>
                      </span>
                    </label>
                  );
                })}
              </>
            )}
            {!semRoteiro && (
              <button className="botao botao-primario botao-grande" onClick={iniciar} disabled={carregando || (modo === 'ia' && !iaDisponivel)}>
                <Icone nome="relogio" /> {carregando ? t('Abrindo a estação…') : t('Iniciar estação de {n} minutos', { n: simulado?.minutos || e.duracaoMin })}
              </button>
            )}
          </section>
          {!simulado && mentor && <FalaMentor mentor={mentor}><p>{tc(mentor, 'mensagens').pratica}</p></FalaMentor>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ consulta */

function Consulta({ e, tentativa, modo, minutos, simulado, encerrar }) {
  const [mensagens, setMensagens] = useState(() => [{ de: 'paciente', texto: e.abertura || t('Bom dia, doutor(a).') }]);
  const [texto, setTexto] = useState('');
  const [conclusao, setConclusao] = useState('');
  const [aguardando, setAguardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [revelados, setRevelados] = useState(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [inicio] = useState(Date.now());
  const restante = useRestante(inicio, minutos);
  const fim = useRef(null);
  const controle = useRef(null);
  const encerrou = useRef(false);

  const sair = (esgotado) => {
    if (encerrou.current) return;
    encerrou.current = true;
    controle.current?.abort();
    encerrar({ conclusao, falas: mensagens.filter((m) => !m.pendente), revelados: [...revelados], esgotado });
  };
  useEffect(() => { if (restante <= 0) sair(true); }, [restante <= 0]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [mensagens]);
  useEffect(() => () => controle.current?.abort(), []);

  const marcar = (r) => setRevelados((s) => new Set([...s, ...(r.chave ? [r.chave] : [])]));

  const enviar = async (conteudo) => {
    const fala = conteudo.trim();
    if (!fala || aguardando) return;
    const historico = [...mensagens, { de: 'candidato', texto: fala }];
    setMensagens([...historico, { de: 'paciente', texto: '', pendente: true }]);
    setTexto('');
    setAguardando(true);
    setAviso('');
    try {
      if (modo === 'ia') {
        const ctl = new AbortController();
        controle.current = ctl;
        const aplicar = (bruto, pendente) => {
          const ehExaminador = /^\s*\[Examinador\]/i.test(bruto);
          setMensagens([...historico, { de: ehExaminador ? 'examinador' : 'paciente', texto: bruto.replace(/^\s*\[Examinador\]\s*/i, ''), pendente }]);
        };
        const final = await api().iaPaciente(tentativa, historico.map(({ de, texto: x }) => ({ de, texto: x })), { signal: ctl.signal, onText: (x) => aplicar(x, true) });
        aplicar(final, false);
      } else {
        const r = await api().falar(tentativa, fala);
        marcar(r);
        setMensagens([...historico, { de: r.de, texto: r.texto, rotulo: r.de === 'examinador' ? r.rotulo : null, imagem: r.imagem }]);
      }
    } catch (err) {
      if (err.codigo === 'cancelado') { setMensagens(historico); return; }
      setMensagens(err.texto ? [...historico, { de: 'paciente', texto: err.texto }] : historico);
      setAviso(err.message);
    } finally {
      setAguardando(false);
    }
  };

  const revelar = async (item) => {
    if (aguardando || revelados.has(item.chave)) return;
    setAguardando(true);
    try {
      const r = await api().revelar(tentativa, item.chave);
      marcar(r);
      setMensagens((l) => [...l, { de: 'candidato', texto: r.pergunta }, { de: r.de, texto: r.texto, rotulo: r.de === 'examinador' ? r.rotulo : null, imagem: r.imagem }]);
    } catch (err) {
      setAviso(err.message);
    } finally {
      setAguardando(false);
    }
  };

  const grupos = [
    { titulo: t('Anamnese'), itens: e.topicos || [] },
    { titulo: t('Exame físico'), itens: (e.pedidos || []).filter((p) => p.grupo === 'Exame físico') },
    { titulo: t('Exames complementares'), itens: (e.pedidos || []).filter((p) => p.grupo !== 'Exame físico') },
  ].filter((g) => g.itens.length);

  return (
    <div className="estacao-consulta">
      <div className="barra-sessao fixa">
        <div>
          <span className="sobretitulo">{t(ROTULO_MODO[modo])}{simulado ? ` · ${t('estação {i} de {n}', { i: simulado.indice + 1, n: simulado.total })}` : ''}</span>
          <h2 className="titulo-sessao">{e.titulo}</h2>
        </div>
        <div className="controles-simulado">
          <span className={`cronometro ${restante < 120 ? 'alerta' : ''}`} role="timer" aria-label={t('Tempo restante')}>
            <Icone nome="relogio" tamanho={16} /> {formatarTempo(restante)}
          </span>
          <button className="botao botao-primario" onClick={() => setConfirmar(true)}>{t('Encerrar estação')}</button>
        </div>
      </div>

      <div className="consulta-corpo">
        <section className="conversa" aria-label={t('Consulta')}>
          <ol className="mensagens" aria-live="polite">
            {mensagens.map((m, i) => (
              <li key={i} className={`mensagem mensagem-${m.de}`}>
                <span className="mensagem-quem">{{ candidato: t('Você'), paciente: e.paciente?.nome || t('Paciente'), examinador: t('Examinador') }[m.de]}</span>
                {m.de === 'examinador' && (m.rotulo || m.imagem)
                  ? <span className="mensagem-texto"><Impresso rotulo={m.rotulo} texto={m.texto} imagem={m.imagem} /></span>
                  : <span className="mensagem-texto">{m.texto || (m.pendente ? t('Pensando…') : '')}</span>}
              </li>
            ))}
            <li ref={fim} aria-hidden="true" />
          </ol>
          {aviso && <p className="aviso" role="status">{aviso}</p>}
          {modo === 'roteiro' ? (
            <div className="roteiro">
              {grupos.map((g) => (
                <div key={g.titulo} className="roteiro-grupo">
                  <span className="rotulo-campo">{g.titulo}</span>
                  <div className="chips">
                    {g.itens.map((i) => (
                      <button key={i.chave} className={`chip ${revelados.has(i.chave) ? 'ativo' : ''}`} disabled={revelados.has(i.chave) || aguardando} onClick={() => revelar(i)}>{i.rotulo}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <form className="enviar" onSubmit={(ev) => { ev.preventDefault(); enviar(texto); }}>
              <label className="sr" htmlFor="fala">{t('Sua fala')}</label>
              <textarea id="fala" rows={2} value={texto} placeholder={t('Ex.: Bom dia, sou o médico. O que trouxe o senhor aqui hoje? · Para exames: "Solicito hemograma e radiografia de tórax".')}
                onChange={(ev) => setTexto(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(texto); } }} />
              <div className="linha-botoes">
                {aguardando && modo === 'ia'
                  ? <button type="button" className="botao" onClick={() => controle.current?.abort()}>{t('Parar')}</button>
                  : <button type="submit" className="botao botao-primario" disabled={!texto.trim() || aguardando}>{t('Enviar')}</button>}
              </div>
              {!simulado && (e.pedidos || []).length > 0 && (
                <details className="pedidos">
                  <summary>{t('Ajuda: impressos disponíveis nesta estação')}</summary>
                  <div className="chips">
                    {e.pedidos.map((p) => <button type="button" key={p.chave} className="chip" disabled={aguardando} onClick={() => enviar(`Solicito ${p.rotulo.toLowerCase()}`)}>{p.rotulo}</button>)}
                  </div>
                </details>
              )}
            </form>
          )}
        </section>

        <aside className="consulta-lado">
          <section className="cartao impresso">
            <span className="sobretitulo">{t('Tarefas')}</span>
            <ol className="tarefas">{e.tarefas.map((x) => <li key={x}>{x}</li>)}</ol>
          </section>
          <label className="cartao conclusao">
            <span className="sobretitulo">{t('Sua hipótese e conduta')}</span>
            <textarea id="conclusao" rows={6} value={conclusao} onChange={(ev) => setConclusao(ev.target.value)}
              placeholder={t('Escreva o diagnóstico, os exames, a conduta e as orientações como você diria ao examinador. Manobras de exame físico: descreva o que faria.')} />
          </label>
        </aside>
      </div>

      <Confirmar aberto={confirmar} titulo={t('Encerrar a estação?')} texto={t('Você vai para a correção pelo PEP. Não dá para voltar à consulta.')}
        rotuloOk={t('Encerrar e corrigir')} onOk={() => { setConfirmar(false); sair(false); }} onCancelar={() => setConfirmar(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ avaliação pelo PEP */

export function ChecklistPep({ pep, niveis, setNivel, sugestao = {}, somenteLeitura = false }) {
  return (
    <ol className="checklist pep">
      {pep.map((c) => {
        const s = sugestao[c.id];
        return (
          <li key={c.id} className={niveis[c.id] ? `nivel-${niveis[c.id]}` : ''}>
            <div className="checklist-item">
              <span>{c.descricao}</span>
              <span className="mudo pequeno">
                {t('peso')} {String(c.peso).replace('.', ',')} · {t(ORIGENS[c.origem] ? { oficial: 'Oficial Inep', adaptado: 'Adaptado do Inep', autoral: 'Autoral RX MED' }[c.origem] : 'Autoral RX MED')}
                {c.critico ? ` · ${t('erro crítico')}` : ''}
                {s ? ` · ${t('sugestão automática: {k} de {n} itens', { k: s.cobertos, n: s.total })}` : ''}
              </span>
              <details className="criterio-detalhe">
                <summary>{t('Critérios de pontuação')}</summary>
                <p><strong>{t('Adequado')}:</strong> {c.integral} ({String(c.pontos.adequado).replace('.', ',')})</p>
                {c.parcial !== null && <p><strong>{t('Parcialmente adequado')}:</strong> {c.parcial} ({String(c.pontos.parcial).replace('.', ',')})</p>}
                <p><strong>{t('Inadequado')}:</strong> {c.inadequado} (0)</p>
                {c.evidencia && <p className="mudo pequeno">{c.evidencia}</p>}
              </details>
            </div>
            <div className="segmentado" role="group" aria-label={`${t('Avaliação')}: ${c.descricao.slice(0, 80)}`}>
              {Object.entries(NIVEIS).map(([nivel, n]) => (
                <button key={nivel} disabled={somenteLeitura || (nivel === 'parcial' && c.pontos.parcial === null)} className={niveis[c.id] === nivel ? 'ativo' : ''}
                  aria-pressed={niveis[c.id] === nivel} onClick={() => setNivel(c.id, nivel)}>{t(nivel === 'parcial' ? 'Parcial' : n.rotulo)}</button>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Avaliacao({ e, tentativa, fim, simulado, concluir }) {
  const { banco } = useApp();
  const mentor = banco.mentorPorId[e.mentor];
  const pep = fim.correcao.pep;
  const [niveis, setNiveis] = useState(() => Object.fromEntries(pep.map((c) => [c.id, fim.sugestao[c.id]?.nivel || ''])));
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const completa = pep.every((c) => niveis[c.id]);

  const gravar = async (n, avaliadoPor, extra = {}) => {
    setEnviando(true);
    setAviso('');
    try {
      const r = await api().gravar(tentativa, n, avaliadoPor);
      concluir({ ...r, niveis: n, avaliadoPor, ...extra });
    } catch (err) {
      setAviso(err.message);
      setEnviando(false);
    }
  };
  const corrigirComIa = async () => {
    setEnviando(true);
    setAviso('');
    try {
      const r = await api().iaAvaliar(tentativa, idiomaAtual());
      const porId = Object.fromEntries((r?.itens || []).map((i) => [String(i.id), i]));
      const n = Object.fromEntries(pep.map((c) => [c.id, NIVEIS[porId[c.id]?.nivel] ? porId[c.id].nivel : 'inadequado']));
      const comentarios = Object.fromEntries(pep.map((c) => [c.id, String(porId[c.id]?.comentario || '')]));
      await gravar(n, 'ia', { comentarios, devolutiva: typeof r?.devolutiva === 'string' ? r.devolutiva : '' });
    } catch (err) {
      setAviso(`${err.message} ${t('Você pode se autoavaliar pelo PEP abaixo.')}`);
      setEnviando(false);
    }
  };

  return (
    <div className="estacao-avaliacao">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t(fim.esgotado ? 'Tempo esgotado' : 'Estação encerrada')} · {t('correção pelo PEP')}</span>
          <h1>{e.titulo}</h1>
          <p className="mudo">{t('Marque o que você fez de verdade. As sugestões automáticas vêm do que você perguntou e escreveu; confira cada uma. Critérios de manobra no manequim dependem da sua honestidade.')}</p>
        </div>
        {fim.iaDisponivel && !simulado && (
          <button className="botao botao-primario botao-grande" onClick={corrigirComIa} disabled={enviando}>
            {enviando ? t('Corrigindo…') : t('Corrigir com {nome}', { nome: mentor?.nome || 'IA' })}
          </button>
        )}
      </header>
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      <ChecklistPep pep={pep} niveis={niveis} sugestao={fim.sugestao} setNivel={(id, n) => setNiveis({ ...niveis, [id]: n })} />
      <button className="botao botao-primario botao-grande" disabled={!completa || enviando} onClick={() => gravar(niveis, 'autoavaliacao')}>
        {simulado ? t(simulado.indice + 1 < simulado.total ? 'Salvar e ir para a próxima estação' : 'Salvar e ver o resultado do simulado') : t('Ver minha nota')}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ resultado */

export function ResultadoEstacao({ e, correcao, resultado, revelados = [], refazer, voltar }) {
  const { banco } = useApp();
  const mentor = banco.mentorPorId[e.mentor];
  const porId = Object.fromEntries(resultado.itens.map((i) => [i.id, i]));
  const naoPerguntados = (correcao.pacienteCompleto?.roteiro || []).map((r, i) => ({ ...r, chave: `a${i}` })).filter((r) => !revelados.includes(r.chave));
  return (
    <div className="estacao-resultado">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Resultado')} · {t({ ia: 'corrigido pela IA', ator: 'avaliado pelo ator', autoavaliacao: 'autoavaliação' }[resultado.avaliadoPor] || 'autoavaliação')}</span>
          <h1>{e.titulo}</h1>
          <SeloOrigem origem={e.origem} edicao={e.edicao} />
        </div>
      </header>
      <div className="numeros">
        <Numero rotulo={t('Nota da estação')} valor={`${notaTexto(resultado.nota)} / 10`} detalhe={t(resultado.nota >= 6 ? 'acima de 6: bom desempenho' : 'abaixo de 6: refaça depois de revisar')} />
        <Numero rotulo={t('Critérios cumpridos')} valor={resultado.cumpridos.length} detalhe={t('de {n} do PEP; {p} parciais', { n: correcao.pep.length, p: resultado.parciais.length })} />
        {resultado.criticos.length > 0 && <Numero rotulo={t('Erros críticos')} valor={resultado.criticos.length} detalhe={t('itens críticos não cumpridos')} />}
      </div>
      <FalaMentor mentor={mentor}><p>{resultado.devolutiva || (mentor && tc(mentor, 'mensagens').pratica)}</p></FalaMentor>

      <section className="secao">
        <h2>{t('PEP: o que contou ponto')}</h2>
        <ol className="checklist resultado">
          {correcao.pep.map((c) => {
            const it = porId[c.id] || { nivel: 'inadequado', pontos: 0 };
            return (
              <li key={c.id} className={`nivel-${it.nivel}`}>
                <span className={`status ${it.nivel === 'adequado' ? 'status-certa' : it.nivel === 'inadequado' ? 'status-errada' : 'status-parcial'}`}>
                  {it.nivel === 'adequado' ? <Icone nome="check" tamanho={14} /> : it.nivel === 'inadequado' ? <Icone nome="x" tamanho={14} /> : '½'}
                </span>
                <div className="checklist-item">
                  <span>{c.descricao}</span>
                  {resultado.comentarios?.[c.id] && <span className="mudo pequeno">{resultado.comentarios[c.id]}</span>}
                  {it.nivel !== 'adequado' && <span className="mudo pequeno">{t('Para pontuar tudo')}: {c.integral}</span>}
                </div>
                <span className="checklist-pontos">{notaTexto(it.pontos)} / {String(c.peso).replace('.', ',')}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="secao grade-2">
        <div className="cartao impresso">
          {correcao.diagnostico && <><span className="sobretitulo">{t('Diagnóstico esperado')}</span><p>{correcao.diagnostico}</p></>}
          {correcao.condutaEsperada?.length > 0 && <><span className="sobretitulo">{t('Conduta esperada')}</span><ul className="lista-conduta">{correcao.condutaEsperada.map((c) => <li key={c}>{c}</li>)}</ul></>}
          {correcao.procedimentos?.length > 0 && <><span className="sobretitulo">{t('Procedimentos esperados')}</span><ul className="lista-conduta">{correcao.procedimentos.map((c) => <li key={c}>{c}</li>)}</ul></>}
          {correcao.historia && <details><summary>{t('Síntese da estação')}</summary><p>{correcao.historia}</p></details>}
        </div>
        <div className="cartao">
          {naoPerguntados.length > 0 && (
            <details open={naoPerguntados.length <= 6}>
              <summary>{t('O que o paciente contaria se você perguntasse ({n})', { n: naoPerguntados.length })}</summary>
              <ul className="lista-conduta">{naoPerguntados.map((r) => <li key={r.chave}>{r.resposta}</li>)}</ul>
            </details>
          )}
          <span className="sobretitulo">{t('Referências')}</span>
          <ul className="lista-conduta">{correcao.referencias.map((r) => <li key={r}>{r}</li>)}</ul>
          {correcao.fonte?.url
            ? <p className="mudo pequeno">{t('Estação e PEP oficiais do Inep')} ({correcao.fonte.edicao}). <a href={correcao.fonte.url} target="_blank" rel="noopener">{t('Ver o PEP original')}</a></p>
            : <p className="mudo pequeno">{t('Caso autoral RX MED para treino, em revisão médica. Confira a versão vigente de cada protocolo.')}</p>}
        </div>
      </section>
      <Recomendacoes alvo={{ ...e, diagnostico: correcao.diagnostico }} titulo={t('Revise no curso')} />
      <div className="linha-botoes">
        {refazer && <button className="botao botao-primario" onClick={refazer}><Icone nome="repetir" /> {t('Refazer estação')}</button>}
        {voltar && <button className="botao" onClick={voltar}>{t('Outras estações')}</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ fluxo da estação */

/** Uma estação completa. Com `simulado`, pula a escolha de modo e o resultado detalhado (vai direto à próxima). */
export default function Estacao({ publica, voltar, iaDisponivel, simulado }) {
  const { despachar } = useApp();
  const [e, setE] = useState(null);
  const [fase, setFase] = useState('instrucoes');
  const [modo, setModo] = useState(simulado?.modo || 'gratuito');
  const [tentativa, setTentativa] = useState(null);
  const [fim, setFim] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    let vivo = true;
    api().candidato(publica.id).then((x) => vivo && setE(x)).catch((err) => vivo && setErro(err.message));
    return () => { vivo = false; };
  }, [publica.id]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [fase]);

  if (erro && !e) return <p className="aviso" role="alert">{erro}</p>;
  if (!e) return <p className="carregando" role="status">{t('Abrindo a estação…')}</p>;
  const minutos = simulado?.minutos || e.duracaoMin;

  const iniciar = async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await api().iniciar(e.id, modo, simulado?.id);
      setTentativa(r.id);
      setFim(null);
      setResultado(null);
      setRodada((x) => x + 1);
      setFase('consulta');
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };
  const encerrar = async ({ conclusao, falas, revelados, esgotado }) => {
    setFase('corrigindo');
    try {
      const r = await api().encerrar(tentativa, conclusao, modo === 'ia' ? falas.map(({ de, texto }) => ({ de, texto })) : undefined);
      setFim({ ...r, esgotado, revelados });
      setFase('avaliacao');
    } catch (err) {
      setErro(err.message);
      setFase('avaliacao');
    }
  };
  const concluir = (r) => {
    const pep = fim.correcao.pep;
    const entrada = {
      t: Date.now(), nota: r.nota, modo, itens: r.niveis, area: e.area, origem: e.origem, titulo: e.titulo,
      criticos: r.criticos, perdidos: pep.filter((c) => r.niveis[c.id] !== 'adequado').map((c) => c.descricao.slice(0, 160)).slice(0, 12),
      ...(simulado ? { simulado: simulado.id, simuladoTotal: simulado.total } : {}),
    };
    despachar({ tipo: 'registrarPratica', id: e.id, resultado: entrada });
    if (simulado) { simulado.aoConcluir({ ...r, estacao: e }); return; }
    setResultado(r);
    setFase('resultado');
  };

  if (fase === 'consulta') {
    return <Consulta key={rodada} e={e} tentativa={tentativa} modo={modo} minutos={minutos} simulado={simulado} encerrar={encerrar} />;
  }
  if (fase === 'corrigindo') return <p className="carregando" role="status">{t('Encerrando a estação…')}</p>;
  if (fase === 'avaliacao') {
    if (!fim) return <p className="aviso" role="alert">{erro || t('Não foi possível encerrar a estação.')}</p>;
    return <Avaliacao e={e} tentativa={tentativa} fim={fim} simulado={simulado} concluir={concluir} />;
  }
  if (fase === 'resultado' && resultado) {
    return <ResultadoEstacao e={e} correcao={fim.correcao} resultado={resultado} revelados={fim.revelados} refazer={() => setFase('instrucoes')} voltar={voltar} />;
  }
  return (
    <>
      {erro && <p className="aviso" role="alert">{erro}</p>}
      <Instrucoes e={e} modo={modo} setModo={setModo} iaDisponivel={iaDisponivel} iniciar={iniciar} voltar={voltar} simulado={simulado} carregando={carregando} />
    </>
  );
}
