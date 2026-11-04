// Treino da 2ª etapa em dupla: duas pessoas na mesma sala, uma faz o candidato e a outra o paciente e
// examinador (com o roteiro, os achados e o checklist). A conversa por vídeo acontece numa sala Jitsi
// aberta em outra aba; aqui ficam o cronômetro, os achados liberados, o checklist e a nota.
// Usa a capacidade `room` do visualizador: o estado de cada um vai na sua presença, e o chat no tópico "fala".
import { useState, useEffect, useRef } from '../react.js';
import { useApp, Icone, Numero } from '../componentes.jsx';
import { formatarTempo } from '../util.js';
import { t } from '../i18n.js';

const NIVEIS = { adequado: { rotulo: 'Adequado', fator: 1 }, parcial: { rotulo: 'Parcial', fator: 0.5 }, inadequado: { rotulo: 'Inadequado', fator: 0 } };
const CHAVE_NOME = 'raiox-revalida:apelido';

function useRoom() {
  const [room, setRoom] = useState(undefined);
  useEffect(() => {
    let vivo = true;
    (async () => {
      let r = null;
      try { r = window.claude?.use ? await window.claude.use('room') : null; } catch { r = null; }
      if (vivo) setRoom(r || null);
    })();
    return () => { vivo = false; };
  }, []);
  return room;
}

const novoCodigo = () => Array.from({ length: 6 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
const limparCodigo = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

/** Itens que o examinador pode liberar ao candidato, com chaves curtas para caber na presença. */
function achadosDe(e) {
  return [
    ...e.exameFisico.map((x, i) => ({ chave: `f${i}`, grupo: 'Exame físico', rotulo: x.item, texto: x.achado })),
    ...e.exames.map((x, i) => ({ chave: `x${i}`, grupo: 'Exames complementares', rotulo: x.item, texto: x.resultado })),
  ];
}

const PAPEL_PROCURADO = { candidato: 'Quer treinar como candidato', ator: 'Quer fazer o paciente e examinador', tanto: 'Topa qualquer papel' };

/** Salas que outras pessoas abriram ao público agora (anunciadas na presença do saguão). */
function useSalasAbertas(room) {
  const [salas, setSalas] = useState([]);
  useEffect(() => {
    if (!room) return undefined;
    const ler = (lista) => setSalas(lista.filter((p) => !p.isMe && p.presence?.aberta && typeof p.presence.aberta.codigo === 'string')
      .map((p) => ({ peer: p.peer, ...p.presence.aberta, codigo: limparCodigo(p.presence.aberta.codigo), nome: String(p.presence.aberta.nome || '').slice(0, 40) }))
      .filter((x) => x.codigo.length >= 4));
    return room.onPeers((c) => ler(c.peers));
  }, [room]);
  return salas;
}

function Lobby({ room, entrar, voltar }) {
  const [nome, setNome] = useState(() => { try { return localStorage.getItem(CHAVE_NOME) || ''; } catch { return ''; } });
  const [codigo, setCodigo] = useState('');
  const [publica, setPublica] = useState(true);
  const [quero, setQuero] = useState('tanto');
  const salas = useSalasAbertas(room);
  const ir = (c, anuncio) => {
    try { localStorage.setItem(CHAVE_NOME, nome.trim()); } catch { /* sem armazenamento */ }
    entrar(c, nome.trim().slice(0, 40) || t('Participante'), anuncio);
  };
  return (
    <div className="dupla">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Todas as estações')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Prática · 2ª etapa')}</span>
          <h1>{t('Treinar em dupla')}</h1>
          <p className="mudo">{t('Uma pessoa faz o candidato; a outra faz o paciente e o examinador, com o roteiro, os achados e o checklist. Vocês conversam por vídeo e a plataforma cuida do tempo, dos achados e da nota.')}</p>
        </div>
      </header>
      {room === null ? (
        <p className="aviso">{t('O treino em dupla precisa da plataforma aberta no claude.ai, com as duas pessoas com acesso ao link. Aqui você pode treinar sozinho no modo roteiro.')}</p>
      ) : (
        <div className="grade-2">
          <section className="cartao">
            <label className="campo">
              <span className="rotulo-campo">{t('Seu nome na sala')}</span>
              <input id="dupla-nome" value={nome} maxLength={40} placeholder={t('Ex.: Ana')} onChange={(e) => setNome(e.target.value)} />
            </label>
            <h2>{t('Criar uma sala')}</h2>
            <p className="mudo">{t('Gera um código para enviar ao colega. Se deixar a sala aberta, qualquer aluno pode entrar para treinar com você.')}</p>
            <label className="opcao-linha"><input type="checkbox" id="dupla-publica" checked={publica} onChange={(e) => setPublica(e.target.checked)} /> {t('Mostrar minha sala em "Salas abertas agora"')}</label>
            {publica && (
              <label className="campo">
                <span className="rotulo-campo">{t('Eu quero')}</span>
                <select id="dupla-quero" value={quero} onChange={(e) => setQuero(e.target.value)}>
                  {Object.entries(PAPEL_PROCURADO).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                </select>
              </label>
            )}
            <button className="botao botao-primario" disabled={!room} onClick={() => ir(novoCodigo(), publica ? { quero } : null)}>
              <Icone nome="pessoas" /> {t('Criar sala')}
            </button>
          </section>
          <section className="cartao">
            <h2>{t('Entrar com código')}</h2>
            <label className="campo">
              <span className="rotulo-campo">{t('Código da sala')}</span>
              <input id="dupla-codigo" value={codigo} placeholder="ex.: k3v6q2" onChange={(e) => setCodigo(limparCodigo(e.target.value))} />
            </label>
            <button className="botao" disabled={!room || codigo.length < 4} onClick={() => ir(codigo)}>{t('Entrar')}</button>
            {room === undefined && <p className="mudo pequeno">{t('Conectando…')}</p>}
          </section>
          <section className="cartao salas-abertas">
            <h2>{t('Salas abertas agora')}</h2>
            <p className="mudo">{t('Alunos esperando um parceiro para treinar estações com ator humano. Entre e combine os papéis pela videochamada.')}</p>
            {salas.length ? (
              <ul className="lista-salas">
                {salas.map((x) => (
                  <li key={x.peer}>
                    <span><strong>{x.nome || t('Participante')}</strong> <span className="mudo pequeno">· {t(PAPEL_PROCURADO[x.quero] || PAPEL_PROCURADO.tanto)}</span></span>
                    <button className="botao" onClick={() => ir(x.codigo)}><Icone nome="pessoas" tamanho={16} /> {t('Treinar junto')}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="mudo pequeno">{t('Nenhuma sala aberta neste momento. Crie a sua com "Mostrar minha sala" marcado e espere alguém entrar.')}</p>}
          </section>
        </div>
      )}
    </div>
  );
}

function Sala({ sala, codigo, nome, sair, anunciar, estacoes }) {
  const { banco, despachar } = useApp();
  const [peers, setPeers] = useState(sala.peers());
  const [eu, setEu] = useState({ nome, papel: '' });
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [agora, setAgora] = useState(Date.now());
  const [copiado, setCopiado] = useState(false);
  const registrado = useRef(null);

  // Minha presença: aplico localmente e envio inteira.
  const atualizar = (patch) => setEu((p) => {
    const novo = { ...p, ...patch };
    sala.presence(novo).catch(() => {});
    return novo;
  });
  useEffect(() => {
    sala.presence(eu).catch(() => {});
    const offPeers = sala.onPeers((c) => setPeers(c.peers));
    const offFala = sala.on('fala', (m) => {
      const d = m.data || {};
      if (typeof d.texto !== 'string') return;
      setMensagens((l) => [...l.slice(-80), { de: String(d.nome || '').slice(0, 40), papel: d.papel, texto: d.texto.slice(0, 600), meu: m.isMe }]);
    });
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => { offPeers(); offFala(); clearInterval(relogio); };
  }, []);

  const outros = peers.filter((p) => !p.sameTab);
  // A sala sai da lista pública quando o colega entra, e volta se ele sair.
  useEffect(() => { anunciar(outros.length === 0); }, [outros.length]);
  const ator = eu.papel === 'ator' ? eu : outros.find((p) => p.presence?.papel === 'ator')?.presence;
  const candidato = eu.papel === 'candidato' ? eu : outros.find((p) => p.presence?.papel === 'candidato')?.presence;
  const e = estacoes.find((x) => x.id === ator?.estacao);
  const achados = e ? achadosDe(e) : [];
  const revelados = new Set(Array.isArray(ator?.revelados) ? ator.revelados : []);
  const restante = e && ator?.inicio ? e.duracaoMin * 60 - (agora - ator.inicio) / 1000 : null;
  const encerrada = !!ator?.encerrada;
  const avaliacao = (ator?.avaliacao && typeof ator.avaliacao === 'object') ? ator.avaliacao : {};
  const nota = e ? e.pep.reduce((s, i) => s + i.peso * (NIVEIS[avaliacao[i.id]]?.fator ?? 0), 0) : 0;

  // O candidato guarda a nota no próprio progresso quando o examinador encerra.
  useEffect(() => {
    if (eu.papel === 'candidato' && encerrada && e && registrado.current !== ator.inicio) {
      registrado.current = ator.inicio;
      despachar({ tipo: 'registrarPratica', id: e.id, resultado: { t: Date.now(), nota, modo: 'dupla', itens: avaliacao } });
    }
  }, [encerrada, eu.papel]);

  const enviar = () => {
    const fala = texto.trim();
    if (!fala) return;
    sala.emit('fala', { nome: eu.nome, papel: eu.papel, texto: fala.slice(0, 600) }).catch(() => {});
    setTexto('');
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); } catch { setCopiado(false); }
  };
  const nomeDe = (p) => String(p.presence?.nome || t('Participante')).slice(0, 40);
  const papelRotulo = (papel) => (papel === 'ator' ? t('Paciente e examinador') : papel === 'candidato' ? t('Candidato') : t('Escolhendo o papel'));

  return (
    <div className="dupla">
      <div className="dupla-topo">
        <div>
          <span className="sobretitulo">{t('Treino em dupla')}</span>
          <h1>{t('Sala {c}', { c: codigo })}</h1>
          <p className="mudo pequeno">{t('Envie o código ao colega. Ele entra em Prática › Treinar em dupla › Entrar com código.')}</p>
        </div>
        <div className="linha-botoes">
          <button className="botao" onClick={copiar}><Icone nome="copiar" /> {copiado ? t('Código copiado') : t('Copiar código')}</button>
          <a className="botao botao-primario" href={`https://meet.jit.si/rx-enamed-${codigo}`} target="_blank" rel="noopener noreferrer">
            <Icone nome="video" /> {t('Abrir videochamada')}
          </a>
          <button className="botao-texto perigo" onClick={sair}>{t('Sair da sala')}</button>
        </div>
      </div>

      <ul className="dupla-pessoas">
        <li className="voce"><strong>{eu.nome}</strong> <span className="mudo pequeno">({t('você')}) · {papelRotulo(eu.papel)}</span></li>
        {outros.map((p) => <li key={p.peer}><strong>{nomeDe(p)}</strong> <span className="mudo pequeno">· {papelRotulo(p.presence?.papel)}</span></li>)}
        {!outros.length && <li className="mudo">{t('Esperando o colega entrar…')}</li>}
      </ul>

      {!eu.papel && (
        <section className="cartao">
          <h2>{t('Qual é o seu papel?')}</h2>
          <div className="linha-botoes">
            <button className="botao botao-primario" disabled={candidato && eu.papel !== 'candidato'} onClick={() => atualizar({ papel: 'candidato' })}>{t('Serei o candidato')}</button>
            <button className="botao" disabled={!!ator} onClick={() => atualizar({ papel: 'ator', estacao: estacoes[0]?.id, revelados: [], avaliacao: {}, inicio: null, encerrada: false })}>
              {t('Serei o paciente e examinador')}
            </button>
          </div>
        </section>
      )}

      {eu.papel === 'ator' && !ator?.inicio && (
        <section className="cartao">
          <label className="campo">
            <span className="rotulo-campo">{t('Estação')}</span>
            <select id="dupla-estacao" value={eu.estacao || ''} onChange={(ev) => atualizar({ estacao: ev.target.value })}>
              {estacoes.map((x) => <option key={x.id} value={x.id}>{t(x.especialidade)} · {x.titulo}</option>)}
            </select>
          </label>
          <button className="botao botao-primario" disabled={!candidato} onClick={() => atualizar({ inicio: Date.now(), revelados: [], avaliacao: {}, encerrada: false })}>
            <Icone nome="relogio" /> {candidato ? t('Iniciar estação de {n} minutos', { n: e?.duracaoMin || 10 }) : t('Esperando o candidato')}
          </button>
        </section>
      )}

      {e && ator?.inicio && (
        <>
          <div className="barra-sessao">
            <div>
              <span className="sobretitulo">{t(e.especialidade)} · {e.duracaoMin} min</span>
              <h2 className="titulo-sessao">{e.titulo}</h2>
            </div>
            {!encerrada && restante !== null && (
              <span className={`cronometro ${restante < 120 ? 'alerta' : ''}`} role="timer" aria-label={t('Tempo restante')}>
                <Icone nome="relogio" tamanho={16} /> {formatarTempo(Math.max(0, restante))}
              </span>
            )}
          </div>

          {encerrada ? (
            <section className="secao">
              <div className="numeros">
                <Numero rotulo={t('Nota da estação')} valor={`${nota.toFixed(1).replace('.', ',')} / 10`}
                  detalhe={t(nota >= 6 ? 'acima de 6: bom desempenho' : 'abaixo de 6: refaça depois de revisar')} />
                <Numero rotulo={t('Itens adequados')} valor={e.pep.filter((i) => avaliacao[i.id] === 'adequado').length} detalhe={t('de {n} do checklist', { n: e.pep.length })} />
              </div>
              <ol className="checklist resultado">
                {e.pep.map((i) => (
                  <li key={i.id} className={`nivel-${avaliacao[i.id] || 'inadequado'}`}>
                    <div className="checklist-item"><span>{i.descricao || i.item}</span></div>
                    <span className="checklist-pontos">{t(NIVEIS[avaliacao[i.id]]?.rotulo || 'Inadequado')}</span>
                  </li>
                ))}
              </ol>
              <div className="cartao impresso">
                <span className="sobretitulo">{t('Diagnóstico esperado')}</span>
                <p>{e.diagnostico}</p>
                <span className="sobretitulo">{t('Conduta esperada')}</span>
                <ul className="lista-conduta">{e.condutaEsperada.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
              <div className="linha-botoes">
                <button className="botao botao-primario" onClick={() => atualizar(eu.papel === 'ator'
                  ? { papel: 'candidato', estacao: null, inicio: null, revelados: null, avaliacao: null, encerrada: null }
                  : { papel: 'ator', estacao: e.id, inicio: null, revelados: [], avaliacao: {}, encerrada: false })}>
                  <Icone nome="repetir" /> {t('Trocar de papel')}
                </button>
                {eu.papel === 'ator' && (
                  <button className="botao" onClick={() => atualizar({ inicio: null, revelados: [], avaliacao: {}, encerrada: false })}>{t('Nova estação')}</button>
                )}
              </div>
            </section>
          ) : (
            <div className="consulta-corpo">
              <section className="coluna">
                {eu.papel !== 'ator' ? (
                  <div className="cartao impresso">
                    <span className="sobretitulo">{t('Cenário de atuação')}</span>
                    <p>{e.cenario}</p>
                    <span className="sobretitulo">{t('Tarefas')}</span>
                    <ol className="tarefas">{e.tarefas.map((x) => <li key={x}>{x}</li>)}</ol>
                  </div>
                ) : (
                  <div className="cartao impresso roteiro-ator">
                    <span className="sobretitulo">{t('Roteiro do paciente (só você vê)')}</span>
                    <p><strong>{e.paciente.nome}</strong>, {e.paciente.idade} anos, {e.paciente.ocupacao}. {e.paciente.perfil}</p>
                    <p><em>{t('Fala de abertura:')}</em> "{e.paciente.abertura}"</p>
                    <dl className="roteiro-respostas">
                      {e.paciente.roteiro.map((r) => <div key={r.topico}><dt>{r.topico}</dt><dd>{r.resposta}</dd></div>)}
                    </dl>
                  </div>
                )}
                <section className="cartao">
                  <span className="sobretitulo">{t('Exame físico e exames')}</span>
                  <ul className="achados">
                    {achados.map((a) => {
                      const liberado = revelados.has(a.chave);
                      return (
                        <li key={a.chave} className={liberado ? 'liberado' : ''}>
                          <span className="rotulo-campo">{t(a.grupo)} · {a.rotulo}</span>
                          {(liberado || eu.papel === 'ator') && <span>{a.texto}</span>}
                          {eu.papel === 'ator' && !liberado && (
                            <button className="botao-texto" onClick={() => atualizar({ revelados: [...revelados, a.chave] })}>{t('Liberar ao candidato')}</button>
                          )}
                          {eu.papel === 'candidato' && !liberado && <span className="mudo pequeno">{t('Peça ao examinador')}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </section>

              <aside className="coluna">
                {eu.papel === 'ator' && (
                  <section className="cartao">
                    <span className="sobretitulo">{t('Checklist (PEP)')}</span>
                    <ol className="checklist">
                      {e.pep.map((i) => (
                        <li key={i.id}>
                          <div className="checklist-item"><span>{i.descricao || i.item}</span><span className="mudo pequeno">{t('peso')} {String(i.peso).replace('.', ',')}</span></div>
                          <div className="segmentado" role="group" aria-label={`${t('Avaliação')}: ${i.descricao || i.item}`}>
                            {Object.entries(NIVEIS).map(([nivel, n]) => (
                              <button key={nivel} className={avaliacao[i.id] === nivel ? 'ativo' : ''} aria-pressed={avaliacao[i.id] === nivel}
                                onClick={() => atualizar({ avaliacao: { ...avaliacao, [i.id]: nivel } })}>{t(n.rotulo)}</button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button className="botao botao-primario" onClick={() => atualizar({ encerrada: true })}>{t('Encerrar e dar a nota')}</button>
                  </section>
                )}
                {eu.papel === 'candidato' && (
                  <label className="cartao conclusao">
                    <span className="sobretitulo">{t('Sua hipótese e conduta')}</span>
                    <textarea id="dupla-conclusao" rows={5} maxLength={900} value={eu.conclusao || ''}
                      onChange={(ev) => atualizar({ conclusao: ev.target.value.slice(0, 900) })}
                      placeholder={t('Escreva o diagnóstico, os exames e a conduta com doses, como você diria ao examinador.')} />
                  </label>
                )}
                {eu.papel === 'ator' && candidato?.conclusao && (
                  <section className="cartao">
                    <span className="sobretitulo">{t('Conclusão do candidato')}</span>
                    <p>{String(candidato.conclusao).slice(0, 900)}</p>
                  </section>
                )}
                <section className="cartao chat-dupla">
                  <span className="sobretitulo">{t('Mensagens')}</span>
                  <ol className="mensagens" aria-live="polite">
                    {mensagens.map((m, i) => (
                      <li key={i} className={`mensagem ${m.meu ? 'mensagem-candidato' : 'mensagem-paciente'}`}>
                        <span className="mensagem-quem">{m.de}</span><span className="mensagem-texto">{m.texto}</span>
                      </li>
                    ))}
                    {!mensagens.length && <li className="mudo pequeno">{t('Use o chat se a videochamada falhar.')}</li>}
                  </ol>
                  <form className="enviar" onSubmit={(ev) => { ev.preventDefault(); enviar(); }}>
                    <label className="sr" htmlFor="dupla-fala">{t('Sua fala')}</label>
                    <input id="dupla-fala" value={texto} maxLength={600} onChange={(ev) => setTexto(ev.target.value)} />
                    <button type="submit" className="botao" disabled={!texto.trim()}>{t('Enviar')}</button>
                  </form>
                </section>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Espera a conexão com as salas (até `ms`), para não tentar entrar antes da plataforma responder. */
function esperarConexao(room, ms = 6000) {
  if (room.connected()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let off = () => {};
    const fim = setTimeout(() => { off(); resolve(false); }, ms);
    off = room.onConnection((ok) => { if (ok) { clearTimeout(fim); off(); resolve(true); } }, () => { clearTimeout(fim); resolve(false); });
  });
}

const MENSAGEM_ERRO = {
  not_permitted: 'Sua conta não pode usar salas neste link. Peça a quem compartilhou acesso de participante (Contributor) e abra de novo.',
  not_granted: 'As salas não estão disponíveis nesta visualização. Abra a plataforma pelo link do claude.ai, entrando com a sua conta.',
  revoked: 'O seu acesso a este link mudou. Recarregue a página.',
};

export default function Dupla({ voltar, estacoes = [] }) {
  const room = useRoom();
  const [sala, setSala] = useState(null);
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);
  const entrar = async (codigo, nome, anuncio) => {
    setErro('');
    setEntrando(true);
    let ultimo = null;
    await esperarConexao(room);
    // Falhas passageiras (upstream_error, limit_reached) ganham mais duas tentativas.
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const s = await room.join(`dupla-${codigo}`);
        setSala({ s, codigo, nome, anuncio });
        setEntrando(false);
        return;
      } catch (e) {
        ultimo = e?.code || 'upstream_error';
        if (MENSAGEM_ERRO[ultimo] || ultimo === 'invalid_argument') break;
        await new Promise((r) => setTimeout(r, 800 + tentativa * 1200));
      }
    }
    setEntrando(false);
    setErro(t(MENSAGEM_ERRO[ultimo] || 'Não foi possível entrar na sala agora. Tente de novo em instantes.'));
  };
  // Anúncio da sala na lista pública, pela presença no saguão.
  const anunciar = (ligado) => {
    if (!room || !sala) return;
    const aberta = ligado && sala.anuncio ? { codigo: sala.codigo, nome: sala.nome, quero: sala.anuncio.quero, desde: Date.now() } : null;
    room.presence({ aberta }).catch(() => {});
  };
  const sair = async () => {
    try { await room?.presence({ aberta: null }); } catch { /* sem anúncio */ }
    try { await sala?.s.leave(); } catch { /* já saiu */ }
    setSala(null);
  };
  useEffect(() => () => { sala?.s.leave().catch(() => {}); room?.presence({ aberta: null }).catch(() => {}); }, [sala]);
  if (sala) return <Sala sala={sala.s} codigo={sala.codigo} nome={sala.nome} sair={sair} anunciar={anunciar} estacoes={estacoes} />;
  return (
    <>
      {erro && <p className="aviso" role="status">{erro}</p>}
      {entrando && <p className="aviso" role="status">{t('Entrando na sala…')}</p>}
      <Lobby room={room} entrar={entrar} voltar={voltar} />
    </>
  );
}
