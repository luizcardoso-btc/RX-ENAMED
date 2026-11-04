import { useState, useEffect, useRef, useMemo } from '../../react.js';
import { useApp, Icone, Numero, Confirmar } from '../../componentes.jsx';
import { AREAS, infoArea } from '../../data.js';
import { formatarTempo } from '../../util.js';
import { t } from '../../i18n.js';
import { api } from '../../pratica-api.js';
import { corrigir } from '../../../../compartilhado/estacoes.js';
import { ChecklistPep, ResultadoEstacao } from './Estacao.jsx';
import { SeloOrigem, Impresso, useRestante, notaTexto } from './comum.jsx';

const CHAVE_SALA = 'rx:dupla-sala';
const PAPEL = { medico: 'Médico (candidato)', ator: 'Ator (paciente e examinador)' };

function SeletorEstacao({ estacoes, valor, mudar, rotulo }) {
  const [area, setArea] = useState('');
  const [origem, setOrigem] = useState('');
  const lista = estacoes.filter((e) => (!area || e.area === area) && (!origem || e.origem === origem));
  return (
    <div className="seletor-estacao">
      <span className="rotulo-campo">{rotulo}</span>
      <div className="linha-filtros">
        <select aria-label={t('Área')} value={area} onChange={(ev) => setArea(ev.target.value)}>
          <option value="">{t('Todas as áreas')}</option>
          {AREAS.map((a) => <option key={a.nome} value={a.nome}>{t(a.nome)}</option>)}
        </select>
        <select aria-label={t('Origem')} value={origem} onChange={(ev) => setOrigem(ev.target.value)}>
          <option value="">{t('Oficiais e autorais')}</option>
          <option value="oficial">{t('Oficiais do Inep')}</option>
          <option value="autoral">{t('Autorais RX MED')}</option>
        </select>
      </div>
      <select id="dupla-estacao" aria-label={t('Estação')} value={valor} onChange={(ev) => mudar(ev.target.value)}>
        <option value="aleatoria">{t('Sortear uma estação')}</option>
        {lista.map((e) => <option key={e.id} value={e.id}>{e.edicao ? `${e.edicao.replace('Revalida ', '')} · ` : ''}{t(infoArea(e.area).curto)} · {e.titulo}</option>)}
      </select>
    </div>
  );
}

function CampoMeet({ valor, mudar }) {
  return (
    <div className="campo">
      <span>{t('Chamada de vídeo (Google Meet)')}</span>
      <div className="linha-meet">
        <input id="dupla-meet" type="url" inputMode="url" placeholder="https://meet.google.com/abc-defg-hij" value={valor} onChange={(ev) => mudar(ev.target.value)} />
        <a className="botao" href="https://meet.google.com/new" target="_blank" rel="noopener"><Icone nome="video" tamanho={16} /> {t('Criar reunião no Meet')}</a>
      </div>
      <span className="mudo pequeno">{t('Crie a reunião, copie o link e cole aqui. Os dois entram pelo botão da sala.')}</span>
    </div>
  );
}

function Lobby({ estacoes, entrar, voltar }) {
  const [papel, setPapel] = useState('ator');
  const [estacao, setEstacao] = useState('aleatoria');
  const [meet, setMeet] = useState('');
  const [modoProva, setModoProva] = useState(true);
  const [minutos, setMinutos] = useState(10);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const agir = async (fn) => {
    setOcupado(true);
    setErro('');
    try { entrar(await fn()); } catch (err) { setErro(err.message); setOcupado(false); }
  };
  return (
    <div className="dupla">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Prática · 2ª etapa')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Treinar em dupla')}</span>
          <h1>{t('Médico e ator, como na prova')}</h1>
          <p className="mudo">{t('Um faz o médico (candidato) e o outro o ator, que interpreta o paciente, entrega os impressos e preenche o PEP. Vocês conversam pelo Google Meet; aqui ficam o cronômetro, os impressos e a nota.')}</p>
        </div>
      </header>
      {erro && <p className="aviso" role="alert">{erro}</p>}
      <div className="grade-2">
        <section className="cartao dupla-criar">
          <h2>{t('Criar sala')}</h2>
          <div className="campo">
            <span>{t('Seu papel')}</span>
            <div className="segmentado" role="group" aria-label={t('Seu papel')}>
              {['ator', 'medico'].map((p) => <button key={p} className={papel === p ? 'ativo' : ''} aria-pressed={papel === p} onClick={() => setPapel(p)}>{t(PAPEL[p])}</button>)}
            </div>
          </div>
          <SeletorEstacao estacoes={estacoes} valor={estacao} mudar={setEstacao} rotulo={t('Estação')} />
          <CampoMeet valor={meet} mudar={setMeet} />
          <label className="opcao-linha"><input type="checkbox" checked={modoProva} onChange={(ev) => setModoProva(ev.target.checked)} /> {t('Modo prova: o médico não vê o tema, o roteiro nem o PEP até o fim')}</label>
          <label className="campo campo-curto"><span>{t('Minutos')}</span><input type="number" min={5} max={20} value={minutos} onChange={(ev) => setMinutos(Number(ev.target.value) || 10)} /></label>
          <button className="botao botao-primario botao-grande" disabled={ocupado}
            onClick={() => agir(() => api().criarSala({ papel, estacaoId: estacao, meetUrl: meet.trim(), modoProva, minutos }))}>
            <Icone nome="pessoas" /> {t('Criar sala')}
          </button>
        </section>
        <section className="cartao dupla-entrar">
          <h2>{t('Entrar com código')}</h2>
          <p className="mudo">{t('Peça o código de 6 letras a quem criou a sala.')}</p>
          <label className="campo">
            <span>{t('Código da sala')}</span>
            <input id="dupla-codigo" value={codigo} maxLength={12} autoCapitalize="none" onChange={(ev) => setCodigo(ev.target.value)} placeholder="ex.: k7m2pq" />
          </label>
          <button className="botao botao-grande" disabled={ocupado || codigo.trim().length < 4} onClick={() => agir(() => api().entrarSala(codigo.trim()))}>{t('Entrar')}</button>
        </section>
      </div>
    </div>
  );
}

function Sala({ inicial, estacoes, sair }) {
  const { despachar } = useApp();
  const [s, setS] = useState(inicial);
  const [eventos, setEventos] = useState(inicial.eventos || []);
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState('');
  const [notas, setNotas] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [meet, setMeet] = useState(inicial.meetUrl || '');
  const ultimo = useRef(Math.max(0, ...(inicial.eventos || []).map((x) => x.id)));
  const registrado = useRef(null);
  const desvio = useMemo(() => new Date(s.agora).getTime() - Date.now(), [s.agora]);
  const restante = useRestante(s.iniciadaEm ? new Date(s.iniciadaEm).getTime() : null, s.minutos, desvio);

  const aplicar = (v) => {
    setS(v);
    if (v.eventos?.length) {
      ultimo.current = Math.max(ultimo.current, ...v.eventos.map((x) => x.id));
      setEventos((l) => [...l, ...v.eventos.filter((x) => !l.some((y) => y.id === x.id))].slice(-120));
    }
  };
  useEffect(() => {
    let vivo = true;
    const id = setInterval(async () => {
      try { const v = await api().sala(s.codigo, ultimo.current); if (vivo) { aplicar(v); setErro(''); } } catch (err) { if (vivo) setErro(err.message); }
    }, 2000);
    return () => { vivo = false; clearInterval(id); };
  }, [s.codigo]);
  useEffect(() => { try { localStorage.setItem(CHAVE_SALA, s.codigo); } catch { /* sem armazenamento */ } }, [s.codigo]);
  // Tempo esgotado: o ator encerra; o médico também pode (o servidor só aceita depois do tempo).
  useEffect(() => { if (s.estado === 'em_andamento' && restante <= 0 && s.papel === 'ator') acao({ tipo: 'encerrar' }); }, [restante <= 0, s.estado]);
  // Nota no histórico do médico (uma vez por rodada).
  useEffect(() => {
    if (s.estado === 'encerrada' && s.papel === 'medico' && s.resultado && s.correcao && registrado.current !== s.encerradaEm) {
      registrado.current = s.encerradaEm;
      const pep = s.correcao.pep;
      const niveis = Object.fromEntries(s.resultado.itens.map((i) => [i.id, i.nivel]));
      despachar({ tipo: 'registrarPratica', id: s.correcao.id, resultado: {
        t: Date.now(), nota: s.resultado.nota, modo: 'dupla', itens: niveis, area: s.correcao.area, origem: s.correcao.origem, titulo: s.correcao.titulo,
        criticos: s.resultado.criticos, perdidos: pep.filter((c) => niveis[c.id] !== 'adequado').map((c) => c.descricao.slice(0, 160)).slice(0, 12),
      } });
    }
  }, [s.estado, s.encerradaEm]);

  async function acao(corpo) {
    setErro('');
    try { aplicar(await api().acaoSala(s.codigo, corpo)); } catch (err) { setErro(err.message); }
  }
  const sairDaSala = async () => {
    try { await api().sairSala(s.codigo); } catch { /* segue */ }
    try { localStorage.removeItem(CHAVE_SALA); } catch { /* sem armazenamento */ }
    sair();
  };

  const souAtor = s.papel === 'ator';
  const e = s.estacao;
  const r = s.reservado;
  const mensagens = eventos.filter((x) => x.tipo === 'mensagem');
  const notaParcial = souAtor && r ? corrigir({ pep: r.pep }, s.avaliacao || {}).nota : null;

  return (
    <div className="dupla-sala">
      <div className="barra-sessao fixa">
        <div>
          <span className="sobretitulo">{t('Sala')} <strong className="codigo-sala">{s.codigo}</strong> · {t('você é')} {t(PAPEL[s.papel] || '')}</span>
          <h2 className="titulo-sessao">{e?.titulo || t('Aguardando a escolha da estação')}</h2>
        </div>
        <div className="controles-simulado">
          {s.meetUrl && <a className="botao" href={s.meetUrl} target="_blank" rel="noopener"><Icone nome="video" tamanho={16} /> {t('Abrir o Meet')}</a>}
          {s.estado === 'em_andamento' && <span className={`cronometro ${restante < 120 ? 'alerta' : ''}`} role="timer" aria-label={t('Tempo restante')}><Icone nome="relogio" tamanho={16} /> {formatarTempo(restante)}</span>}
          {s.estado === 'em_andamento' && (souAtor || restante <= 0) && <button className="botao botao-primario" onClick={() => setConfirmar(true)}>{t('Encerrar estação')}</button>}
        </div>
      </div>
      {erro && <p className="aviso" role="alert">{erro}</p>}

      <div className="dupla-participantes">
        <span className={s.participantes?.medico ? 'presente' : ''}><Icone nome="estetoscopio" tamanho={16} /> {t('Médico')}: {s.participantes?.medico || t('aguardando')}</span>
        <span className={s.participantes?.ator ? 'presente' : ''}><Icone nome="usuario" tamanho={16} /> {t('Ator')}: {s.participantes?.ator || t('aguardando')}</span>
        {s.estado === 'aguardando' && <span className="mudo pequeno">{t('Envie o código {c} ao colega: ele entra em Prática › Treinar em dupla › Entrar com código.', { c: s.codigo })}</span>}
      </div>

      {s.estado === 'aguardando' && (
        <section className="cartao">
          {(souAtor || s.criador) ? (
            <>
              <SeletorEstacao estacoes={estacoes} valor={s.reservado?.id || e?.id || 'aleatoria'} mudar={(v) => acao({ tipo: 'configurar', estacaoId: v })} rotulo={t('Estação desta rodada')} />
              <CampoMeet valor={meet} mudar={setMeet} />
              {meet !== (s.meetUrl || '') && <button className="botao" onClick={() => acao({ tipo: 'configurar', meetUrl: meet.trim() })}>{t('Salvar link do Meet')}</button>}
              <div className="linha-botoes">
                <label className="opcao-linha"><input type="checkbox" checked={s.modoProva} onChange={(ev) => acao({ tipo: 'configurar', modoProva: ev.target.checked })} /> {t('Modo prova')}</label>
                <button className="botao" onClick={() => acao({ tipo: 'configurar', trocarPapeis: true })}>{t('Trocar papéis')}</button>
              </div>
            </>
          ) : <p className="mudo">{t('O ator escolhe a estação e inicia. Enquanto isso, entre na chamada do Meet.')}</p>}
          {souAtor && (
            <button className="botao botao-primario botao-grande" disabled={!s.participantes?.medico || !r} onClick={() => acao({ tipo: 'iniciar' })}>
              <Icone nome="relogio" /> {s.participantes?.medico ? t('Iniciar estação de {n} minutos', { n: s.minutos }) : t('Aguardando o médico entrar')}
            </button>
          )}
          {souAtor && r && <p className="mudo pequeno">{t('Leia o roteiro abaixo antes de iniciar.')}</p>}
        </section>
      )}

      {s.estado !== 'encerrada' && (
        <div className="grade-2 dupla-corpo">
          <div className="coluna">
            {e?.cenario && (
              <section className="cartao impresso">
                <span className="sobretitulo">{t('Impresso da porta (o que o médico recebe)')}</span>
                <p>{e.cenario}</p>
                {(e.instrucoes || []).map((x) => <p key={x}>{x}</p>)}
                <ol className="tarefas">{(e.tarefas || []).map((x) => <li key={x}>{x}</li>)}</ol>
                <SeloOrigem origem={e.origem} edicao={e.edicao} />
              </section>
            )}
            {!souAtor && s.liberados.length > 0 && (
              <section className="cartao">
                <span className="sobretitulo">{t('Impressos recebidos')}</span>
                {s.liberados.map((x) => <Impresso key={x.chave} rotulo={x.rotulo} texto={x.texto} imagem={x.imagem} />)}
              </section>
            )}
            {!souAtor && s.estado === 'em_andamento' && (
              <label className="cartao conclusao">
                <span className="sobretitulo">{t('Rascunho (só você vê)')}</span>
                <textarea rows={5} value={notas} onChange={(ev) => setNotas(ev.target.value)} placeholder={t('Anote achados, hipótese e conduta. Fale tudo em voz alta para o ator.')} />
              </label>
            )}
            {s.pep && !souAtor && <section className="cartao"><span className="sobretitulo">{t('PEP (modo estudo)')}</span><ChecklistPep pep={s.pep} niveis={{}} setNivel={() => {}} somenteLeitura /></section>}
          </div>
          <div className="coluna">
            {souAtor && r && (
              <>
                <section className="cartao reservado">
                  <span className="sobretitulo">{t('Roteiro do paciente (reservado ao ator)')}</span>
                  {r.pacienteCompleto?.perfil && <p className="mudo">{r.pacienteCompleto.perfil}</p>}
                  <ul className="lista-conduta">{(r.pacienteCompleto?.roteiro || []).map((x, i) => <li key={i}><strong>{x.topico}:</strong> {x.resposta}</li>)}</ul>
                  {!r.pacienteCompleto?.roteiro?.length && <p className="aviso">{t('Esta estação não tem roteiro publicado: responda de forma coerente com o caso e os impressos.')}</p>}
                  {r.pacienteCompleto?.perguntasDoPaciente?.length > 0 && <>
                    <span className="sobretitulo">{t('Perguntas que o paciente faz')}</span>
                    <ul className="lista-conduta">{r.pacienteCompleto.perguntasDoPaciente.map((x) => <li key={x}>{x}</li>)}</ul>
                  </>}
                </section>
                <section className="cartao reservado">
                  <span className="sobretitulo">{t('Impressos: entregue só quando o médico pedir')}</span>
                  {[...r.exameFisico.map((x, i) => ({ ...x, chave: `f${i}`, texto: x.achado })), ...r.exames.map((x, i) => ({ ...x, chave: `x${i}`, texto: x.resultado }))].map((x) => {
                    const ja = s.liberados.some((l) => l.chave === x.chave);
                    return (
                      <details key={x.chave} className="impresso-ator">
                        <summary>
                          <span>{x.item}</span>
                          <button className={`botao ${ja ? '' : 'botao-primario'}`} disabled={ja || s.estado !== 'em_andamento'} onClick={(ev) => { ev.preventDefault(); acao({ tipo: 'liberar', chave: x.chave }); }}>
                            {ja ? t('Entregue') : t('Entregar')}
                          </button>
                        </summary>
                        <Impresso texto={x.texto} imagem={x.imagem} />
                      </details>
                    );
                  })}
                </section>
                <section className="cartao reservado">
                  <span className="sobretitulo">{t('PEP: marque enquanto o médico atende')} · {t('nota parcial')} {notaTexto(notaParcial)}</span>
                  <ChecklistPep pep={r.pep} niveis={s.avaliacao || {}} setNivel={(id, nivel) => acao({ tipo: 'avaliar', criterioId: id, nivel: s.avaliacao?.[id] === nivel ? null : nivel })} />
                </section>
              </>
            )}
            <section className="cartao dupla-chat">
              <span className="sobretitulo">{t('Mensagens (opcional; a conversa é no Meet)')}</span>
              <ol className="mensagens">
                {mensagens.map((m) => <li key={m.id} className={`mensagem ${m.meu ? 'mensagem-candidato' : 'mensagem-paciente'}`}><span className="mensagem-quem">{t(m.dados.papel === 'ator' ? 'Ator' : 'Médico')}</span><span className="mensagem-texto">{m.dados.texto}</span></li>)}
              </ol>
              <form className="enviar" onSubmit={(ev) => { ev.preventDefault(); if (texto.trim()) { acao({ tipo: 'mensagem', texto }); setTexto(''); } }}>
                <input id="dupla-fala" value={texto} maxLength={500} onChange={(ev) => setTexto(ev.target.value)} placeholder={t('Escreva uma mensagem')} />
                <button type="submit" className="botao" disabled={!texto.trim()}>{t('Enviar')}</button>
              </form>
            </section>
          </div>
        </div>
      )}

      {s.estado === 'encerrada' && s.correcao && s.resultado && (
        <>
          <ResultadoEstacao e={s.correcao} correcao={s.correcao} resultado={{ ...s.resultado, avaliadoPor: 'ator' }} />
          <div className="linha-botoes">
            <button className="botao botao-primario" onClick={() => acao({ tipo: 'nova_rodada', trocarPapeis: true })}><Icone nome="repetir" /> {t('Nova rodada trocando os papéis')}</button>
            <button className="botao" onClick={() => acao({ tipo: 'nova_rodada', trocarPapeis: false })}>{t('Nova rodada com os mesmos papéis')}</button>
          </div>
        </>
      )}
      <div className="linha-botoes"><button className="botao-texto" onClick={sairDaSala}>{t('Sair da sala')}</button></div>

      <Confirmar aberto={confirmar} titulo={t('Encerrar a estação?')} texto={t('A nota sai do PEP marcado pelo ator e vai para o histórico do médico.')}
        rotuloOk={t('Encerrar')} onOk={() => { setConfirmar(false); acao({ tipo: 'encerrar' }); }} onCancelar={() => setConfirmar(false)} />
    </div>
  );
}

export default function DuplaServidor({ estacoes, voltar }) {
  const [sala, setSala] = useState(null);
  const [verificando, setVerificando] = useState(true);
  // Volta para a sala aberta (recarregou a página no meio do treino).
  useEffect(() => {
    let codigo = null;
    try { codigo = localStorage.getItem(CHAVE_SALA); } catch { codigo = null; }
    if (!codigo) { setVerificando(false); return; }
    api().sala(codigo).then(setSala).catch(() => { try { localStorage.removeItem(CHAVE_SALA); } catch { /* sem armazenamento */ } })
      .finally(() => setVerificando(false));
  }, []);
  if (verificando) return <p className="carregando" role="status">{t('Carregando…')}</p>;
  if (sala) return <Sala key={sala.codigo} inicial={sala} estacoes={estacoes} sair={() => setSala(null)} />;
  return <Lobby estacoes={estacoes} entrar={setSala} voltar={voltar} />;
}
