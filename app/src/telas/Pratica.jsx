import { useState, useEffect, useRef, useMemo } from '../react.js';
import { useApp, Icone, Vazio, Numero, AvatarMentor, FalaMentor, Confirmar } from '../componentes.jsx';
import { AREAS, infoArea } from '../data.js';
import { formatarTempo, plural } from '../util.js';
import { t, tc, idiomaAtual } from '../i18n.js';
import Dupla from './Dupla.jsx';
import { iaDoServidor } from '../ia.js';
import Discursivas from './Discursivas.jsx';

const NIVEIS = { adequado: { rotulo: 'Adequado', fator: 1 }, parcial: { rotulo: 'Parcial', fator: 0.5 }, inadequado: { rotulo: 'Inadequado', fator: 0 } };

/** Função `sample` do visualizador (conversa com o Claude), `null` se indisponível, `undefined` enquanto verifica. */
export function useSample() {
  const [sample, setSample] = useState(undefined);
  useEffect(() => {
    let vivo = true;
    (async () => {
      // No site próprio, a IA vem do servidor; no claude.ai, do visualizador.
      let s = (await iaDoServidor())?.sample || null;
      if (!s) { try { s = window.claude?.use ? await window.claude.use('sample') : null; } catch { s = null; } }
      // Função no estado: passar via atualizador, senão o React a executaria como atualizador.
      if (vivo) setSample(() => s || null);
    })();
    return () => { vivo = false; };
  }, []);
  return sample;
}

const ERROS_SAMPLE = {
  not_granted: 'A conversa com a IA não foi autorizada. Siga no modo roteiro.',
  sampling_disabled: 'A IA não está disponível nesta conta. Siga no modo roteiro.',
  rate_limited: 'Muitas mensagens em pouco tempo. Espere um pouco antes de enviar de novo.',
  session_expired: 'Sua sessão no Claude expirou. Entre de novo para usar a IA.',
  refused: 'A IA não respondeu a essa mensagem. Reformule a pergunta.',
  quota: 'Você usou as interações com a IA de hoje. Assine um plano ou volte amanhã.',
};
const PERMANENTES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);
const mensagemDeErro = (e) => t(ERROS_SAMPLE[e?.code] || 'A IA não respondeu agora. Tente enviar de novo.');

function regrasDoPaciente(e) {
  const material = { paciente: e.paciente, exameFisico: e.exameFisico, exames: e.exames };
  return [
    'Você está simulando uma estação da prova prática (2ª etapa) do Revalida, para treino de um médico.',
    'Você faz dois papéis:',
    `1. O PACIENTE ${e.paciente.nome}, ${e.paciente.idade} anos, ${e.paciente.ocupacao}. Perfil: ${e.paciente.perfil}`,
    '2. O EXAMINADOR, que só entrega achados de exame físico e resultados de exames quando o candidato pedir explicitamente.',
    'Regras:',
    '- Responda em português do Brasil. Como paciente, fale de forma coloquial, em 1 a 3 frases, com a emoção do perfil.',
    '- Revele as informações do roteiro apenas quando o candidato perguntar sobre aquilo. Não adiante sintomas.',
    '- Nunca diga o diagnóstico, nunca sugira exames ou condutas e nunca avalie o candidato.',
    '- Se perguntarem algo que não está no material, responda de forma neutra e coerente, sem inventar sintomas ou achados importantes.',
    '- Quando o candidato pedir exame físico ou exames, responda começando com "[Examinador]" e entregue só o item pedido, com o texto do material. Se o item não existir no material, responda "[Examinador] Este exame não está disponível nesta estação."',
    '- Faça as perguntas do paciente (perguntasDoPaciente) em momentos naturais da conversa, principalmente quando o candidato explicar o diagnóstico ou a conduta.',
    '- Não saia do personagem, mesmo que peçam.',
    '',
    `MATERIAL DA ESTAÇÃO (JSON): ${JSON.stringify(material)}`,
  ].join('\n');
}

function promptDeCorrecao(e, mentor, registro, conclusao) {
  return [
    'Você é examinador da prova prática do Revalida. Corrija a estação abaixo com rigor e justiça.',
    `Estação: ${e.titulo} (${e.area}). Tarefas do candidato: ${e.tarefas.join(' ')}`,
    `Diagnóstico esperado: ${e.diagnostico}`,
    `Conduta esperada: ${e.condutaEsperada.join(' ')}`,
    `Checklist (PEP), avalie cada item: ${JSON.stringify(e.pep.map(({ id, item }) => ({ id, item })))}`,
    'Considere SOMENTE o que está no registro da consulta e na conclusão escrita pelo candidato. O que não aparece não foi feito.',
    'Para cada item use "adequado" (fez completo), "parcial" (fez em parte) ou "inadequado" (não fez ou fez errado), com um comentário de até 20 palavras.',
    `Depois escreva uma "devolutiva" de até 90 palavras na voz de ${mentor.nome}, ${mentor.titulo}. Personalidade: ${mentor.personalidade} Tom: ${mentor.tom}. Comece pelo que foi bem, depois o que mais custou pontos e uma dica prática.`,
    idiomaAtual() === 'es' ? 'Escreva os comentários e a devolutiva em espanhol (o candidato estuda em espanhol); mantenha em português os termos técnicos usados na prova.' : 'Escreva os comentários e a devolutiva em português do Brasil.',
    'Responda somente com JSON neste formato: {"itens":[{"id":"apresentacao","nivel":"parcial","comentario":"..."}],"devolutiva":"..."}',
    '',
    'REGISTRO DA CONSULTA:',
    registro || '(vazio)',
    '',
    'CONCLUSÃO ESCRITA PELO CANDIDATO:',
    conclusao || '(não escreveu)',
  ].join('\n');
}

function registroEmTexto(mensagens) {
  const quem = { candidato: 'Candidato', paciente: 'Paciente', examinador: 'Examinador' };
  return mensagens.filter((m) => quem[m.de]).map((m) => `${quem[m.de]}: ${m.texto}`).join('\n').slice(-60000);
}

function notaDe(e, avaliacao) {
  return e.pep.reduce((s, i) => s + i.peso * (NIVEIS[avaliacao[i.id]]?.fator ?? 0), 0);
}

/* ------------------------------------------------------------------ lista */

function Lista({ abrir, abrirDupla, abrirDiscursivas }) {
  const { banco, progresso } = useApp();
  return (
    <div className="tela-pratica">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Prática · 2ª etapa')}</span>
          <h1>{t('Estações com paciente simulado')}</h1>
          <p className="mudo">{t('Como na prova de habilidades clínicas: 10 minutos por estação, um paciente que responde ao que você pergunta e um checklist de avaliação com pesos. Converse com o paciente por IA ou siga o modo roteiro.')}</p>
          {idiomaAtual() === 'es' && <p className="aviso-idioma">{t('As estações são em português, como na prova: o paciente fala português e o checklist segue o do Inep.')}</p>}
        </div>
      </header>

      <section className="cartao dupla-chamada">
        <div>
          <span className="sobretitulo">{t('Novo')}</span>
          <h2>{t('Treinar em dupla')}</h2>
          <p className="mudo">{t('Chame um colega: um faz o candidato e o outro o paciente e examinador, por videochamada, com cronômetro, achados e checklist na tela.')}</p>
        </div>
        <button className="botao botao-primario botao-grande" onClick={abrirDupla}><Icone nome="pessoas" /> {t('Treinar em dupla')}</button>
      </section>

      {banco.discursivas.length > 0 && (
        <section className="cartao dupla-chamada">
          <div>
            <span className="sobretitulo">{t('Novo')}</span>
            <h2>{t('Questões discursivas')}</h2>
            <p className="mudo">{t('{n} casos da prova discursiva com o padrão de resposta oficial do Inep. Escreva, compare e veja sua nota.', { n: banco.discursivas.length })}</p>
          </div>
          <button className="botao botao-grande" onClick={abrirDiscursivas}>{t('Treinar discursivas')}</button>
        </section>
      )}

      <section className="secao">
        <h2>{t('Seus mentores')}</h2>
        <ul className="mentores">
          {banco.mentores.map((m) => (
            <li key={m.id} className="mentor-cartao">
              <AvatarMentor mentor={m} tamanho={48} />
              <div>
                <strong>{m.nome}</strong>
                <span className="mudo pequeno">{tc(m, 'titulo')}</span>
                <p className="mentor-bordao">"{tc(m, 'bordoes')[0]}"</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {AREAS.map((a) => {
        const lista = banco.estacoes.filter((e) => e.area === a.nome);
        if (!lista.length) return null;
        return (
          <section key={a.nome} className="secao">
            <h2 className="titulo-area"><span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.nome)}</h2>
            <div className="grade-estacoes">
              {lista.map((e) => {
                const tentativas = progresso.praticas[e.id] || [];
                const ultima = tentativas[tentativas.length - 1];
                return (
                  <button key={e.id} className="estacao-cartao" onClick={() => abrir(e.id)}>
                    <span className="sobretitulo">{t(e.especialidade)} · {e.duracaoMin} min</span>
                    <strong>{e.titulo}</strong>
                    <span className="mudo pequeno">{e.cenario.split('.')[0]}.</span>
                    <span className="estacao-rodape">
                      {ultima
                        ? <span>{t('Última nota')} <strong className="nota-pequena">{ultima.nota.toFixed(1).replace('.', ',')}</strong> · {plural(tentativas.length, 'tentativa', 'tentativas')}</span>
                        : <span className="mudo">{t('Ainda não feita')}</span>}
                      <Icone nome="direita" tamanho={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="mudo pequeno">{t('Casos fictícios elaborados para treino, com base nos protocolos citados em cada estação. Conteúdo em revisão médica: confira sempre a versão vigente dos protocolos oficiais.')}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ estação */

function Instrucoes({ e, modo, setModo, sample, iniciar, voltar }) {
  const { banco } = useApp();
  const mentor = banco.mentorPorId[e.mentor];
  return (
    <div className="estacao-instrucoes">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Todas as estações')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t(infoArea(e.area).curto)} · {t(e.especialidade)} · {e.duracaoMin} {t('minutos')}</span>
          <h1>{e.titulo}</h1>
        </div>
      </header>
      <div className="grade-2">
        <section className="cartao impresso">
          <span className="sobretitulo">{t('Cenário de atuação')}</span>
          <p>{e.cenario}</p>
          <span className="sobretitulo">{t('Paciente')}</span>
          <p>{e.paciente.nome}, {e.paciente.idade} anos, {e.paciente.ocupacao}.</p>
          <span className="sobretitulo">{t('Nos próximos {n} minutos, você deverá', { n: e.duracaoMin })}</span>
          <ol className="tarefas">{e.tarefas.map((t) => <li key={t}>{t}</li>)}</ol>
        </section>
        <div className="coluna">
          <section className="cartao">
            <span className="sobretitulo">{t('Como você quer treinar')}</span>
            <label className={`opcao-modo ${modo === 'ia' ? 'ativo' : ''} ${sample === null ? 'indisponivel' : ''}`}>
              <input type="radio" name="modo" id="modo-ia" checked={modo === 'ia'} disabled={sample === null} onChange={() => setModo('ia')} />
              <span>
                <strong>{t('Conversar com o paciente por IA')}</strong>
                <span className="mudo pequeno">{t(sample === undefined ? 'Verificando se a IA está disponível…'
                  : sample === null ? 'Indisponível agora. Entre na sua conta para conversar com o paciente por IA.'
                    : 'Você digita como falaria na estação. Na primeira mensagem o Claude pede sua autorização; usa o seu plano.')}</span>
              </span>
            </label>
            <label className={`opcao-modo ${modo === 'roteiro' ? 'ativo' : ''}`}>
              <input type="radio" name="modo" id="modo-roteiro" checked={modo === 'roteiro'} onChange={() => setModo('roteiro')} />
              <span>
                <strong>{t('Modo roteiro')}</strong>
                <span className="mudo pequeno">{t('Você escolhe o que perguntar e o que examinar numa lista; o paciente responde pelo roteiro.')}</span>
              </span>
            </label>
            <button className="botao botao-primario botao-grande" onClick={iniciar} disabled={modo === 'ia' && !sample}>
              <Icone nome="relogio" /> {t('Iniciar estação de {n} minutos', { n: e.duracaoMin })}
            </button>
          </section>
          <FalaMentor mentor={mentor}><p>{mentor && tc(mentor, 'mensagens').pratica}</p></FalaMentor>
        </div>
      </div>
    </div>
  );
}

function Roteiro({ e, revelados, revelar }) {
  const grupos = [
    { titulo: t('Anamnese'), de: 'paciente', itens: e.paciente.roteiro.map((r) => ({ chave: `a:${r.topico}`, rotulo: r.topico, pergunta: `Pergunta sobre: ${r.topico.toLowerCase()}`, resposta: r.resposta })) },
    { titulo: t('Exame físico'), de: 'examinador', itens: e.exameFisico.map((x) => ({ chave: `f:${x.item}`, rotulo: x.item, pergunta: `Solicita exame físico: ${x.item.toLowerCase()}`, resposta: x.achado })) },
    { titulo: t('Exames complementares'), de: 'examinador', itens: e.exames.map((x) => ({ chave: `x:${x.item}`, rotulo: x.item, pergunta: `Solicita: ${x.item}`, resposta: x.resultado })) },
  ];
  return (
    <div className="roteiro">
      {grupos.map((g) => (
        <div key={g.titulo} className="roteiro-grupo">
          <span className="rotulo-campo">{g.titulo}</span>
          <div className="chips">
            {g.itens.map((i) => (
              <button key={i.chave} className={`chip ${revelados.has(i.chave) ? 'ativo' : ''}`} disabled={revelados.has(i.chave)}
                onClick={() => revelar(i, g.de)}>{i.rotulo}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Consulta({ e, modo, sample, setModo, mensagens, setMensagens, conclusao, setConclusao, encerrar }) {
  const [texto, setTexto] = useState('');
  const [aguardando, setAguardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [inicio] = useState(Date.now());
  const [agora, setAgora] = useState(Date.now());
  const [confirmar, setConfirmar] = useState(false);
  const controle = useRef(null);
  const fim = useRef(null);
  const revelados = useMemo(() => new Set(mensagens.map((m) => m.chave).filter(Boolean)), [mensagens]);
  const restante = e.duracaoMin * 60 - (agora - inicio) / 1000;

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => { clearInterval(t); controle.current?.abort(); };
  }, []);
  useEffect(() => { if (restante <= 0) { controle.current?.abort(); encerrar(true); } }, [restante <= 0]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [mensagens]);

  const enviar = async (conteudo) => {
    const fala = conteudo.trim();
    if (!fala || aguardando) return;
    const historico = [...mensagens, { de: 'candidato', texto: fala }];
    setMensagens([...historico, { de: 'paciente', texto: '', pendente: true }]);
    setTexto('');
    setAguardando(true);
    setAviso('');
    const turnos = [{ role: 'user', content: regrasDoPaciente(e) }];
    for (const m of historico) {
      if (m.de === 'candidato') turnos.push({ role: 'user', content: m.texto });
      else if (m.de === 'paciente' || m.de === 'examinador') turnos.push({ role: 'assistant', content: m.de === 'examinador' ? `[Examinador] ${m.texto}` : m.texto });
    }
    const ctl = new AbortController();
    controle.current = ctl;
    const aplicar = (bruto, pendente) => {
      const ehExaminador = /^\s*\[Examinador\]/i.test(bruto);
      const limpo = bruto.replace(/^\s*\[Examinador\]\s*/i, '');
      setMensagens([...historico, { de: ehExaminador ? 'examinador' : 'paciente', texto: limpo, pendente }]);
    };
    try {
      const { text } = await sample(turnos, { modelTier: 'quick', cache: false, signal: ctl.signal, onText: ({ text: t }) => aplicar(t, true) });
      aplicar(text, false);
    } catch (err) {
      if (err?.code === 'cancelled') { setMensagens(historico); return; }
      setMensagens(err?.text ? [...historico, { de: 'paciente', texto: err.text }] : historico);
      setAviso(mensagemDeErro(err));
      if (PERMANENTES.has(err?.code)) setModo('roteiro');
    } finally {
      setAguardando(false);
    }
  };

  const revelar = (item, de) => setMensagens([...mensagens,
    { de: 'candidato', texto: item.pergunta, chave: item.chave }, { de, texto: item.resposta }]);

  const pedidos = [...e.exameFisico.map((x) => `Solicito exame físico: ${x.item.toLowerCase()}`), ...e.exames.map((x) => `Solicito: ${x.item}`)];

  return (
    <div className="estacao-consulta">
      <div className="barra-sessao fixa">
        <div>
          <span className="sobretitulo">{t(modo === 'ia' ? 'Paciente por IA' : 'Modo roteiro')} · {t(e.especialidade)}</span>
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
                <span className="mensagem-quem">{{ candidato: t('Você'), paciente: e.paciente.nome.split(',')[0], examinador: t('Examinador') }[m.de]}</span>
                <span className="mensagem-texto">{m.texto || (m.pendente ? t('Pensando…') : '')}</span>
              </li>
            ))}
            <li ref={fim} aria-hidden="true" />
          </ol>
          {aviso && <p className="aviso" role="status">{aviso}</p>}
          {modo === 'ia' ? (
            <form className="enviar" onSubmit={(ev) => { ev.preventDefault(); enviar(texto); }}>
              <label className="sr" htmlFor="fala">{t('Sua fala')}</label>
              <textarea id="fala" rows={2} value={texto} placeholder={t('Ex.: Bom dia, sou o médico de plantão. O que trouxe o senhor aqui hoje?')}
                onChange={(ev) => setTexto(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(texto); } }} />
              <div className="linha-botoes">
                {aguardando
                  ? <button type="button" className="botao" onClick={() => controle.current?.abort()}>{t('Parar')}</button>
                  : <button type="submit" className="botao botao-primario" disabled={!texto.trim()}>{t('Enviar')}</button>}
              </div>
              <details className="pedidos">
                <summary>{t('Pedir exame físico ou exames')}</summary>
                <div className="chips">
                  {pedidos.map((p) => <button type="button" key={p} className="chip" disabled={aguardando} onClick={() => enviar(p)}>{p.replace(/^Solicito( exame físico)?: /, '')}</button>)}
                </div>
              </details>
            </form>
          ) : (
            <Roteiro e={e} revelados={revelados} revelar={revelar} />
          )}
        </section>

        <aside className="consulta-lado">
          <section className="cartao impresso">
            <span className="sobretitulo">{t('Tarefas')}</span>
            <ol className="tarefas">{e.tarefas.map((t) => <li key={t}>{t}</li>)}</ol>
          </section>
          <label className="cartao conclusao">
            <span className="sobretitulo">{t('Sua hipótese e conduta')}</span>
            <textarea id="conclusao" rows={6} value={conclusao} onChange={(ev) => setConclusao(ev.target.value)}
              placeholder={t('Escreva o diagnóstico, os exames e a conduta com doses, como você diria ao examinador.')} />
          </label>
        </aside>
      </div>

      <Confirmar aberto={confirmar} titulo={t('Encerrar a estação?')} texto={t('Você vai para a correção pelo checklist. Não dá para voltar à consulta.')}
        rotuloOk={t('Encerrar e corrigir')} onOk={() => { setConfirmar(false); controle.current?.abort(); encerrar(false); }}
        onCancelar={() => setConfirmar(false)} />
    </div>
  );
}

function Avaliacao({ e, sample, mensagens, conclusao, tempoEsgotado, concluir }) {
  const { banco } = useApp();
  const mentor = banco.mentorPorId[e.mentor];
  const [avaliacao, setAvaliacao] = useState(() => Object.fromEntries(e.pep.map((i) => [i.id, ''])));
  const [comentarios, setComentarios] = useState({});
  const [corrigindo, setCorrigindo] = useState(false);
  const [aviso, setAviso] = useState('');
  const controle = useRef(null);
  useEffect(() => () => controle.current?.abort(), []);
  const completa = e.pep.every((i) => avaliacao[i.id]);

  const corrigirComIA = async () => {
    setCorrigindo(true);
    setAviso('');
    const ctl = new AbortController();
    controle.current = ctl;
    try {
      const r = await sample.json(promptDeCorrecao(e, mentor, registroEmTexto(mensagens), conclusao), { signal: ctl.signal, cache: false });
      const itens = Array.isArray(r?.itens) ? r.itens : [];
      const porId = Object.fromEntries(itens.map((i) => [String(i.id), i]));
      const niveis = Object.fromEntries(e.pep.map((i) => [i.id, NIVEIS[porId[i.id]?.nivel] ? porId[i.id].nivel : 'inadequado']));
      const coment = Object.fromEntries(e.pep.map((i) => [i.id, String(porId[i.id]?.comentario || '')]));
      concluir({ avaliacao: niveis, comentarios: coment, devolutiva: typeof r?.devolutiva === 'string' ? r.devolutiva : '', modo: 'ia' });
    } catch (err) {
      if (err?.code !== 'cancelled') setAviso(`${mensagemDeErro(err)} ${t('Você pode se autoavaliar pelo checklist abaixo.')}`);
    } finally {
      setCorrigindo(false);
    }
  };

  return (
    <div className="estacao-avaliacao">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t(tempoEsgotado ? 'Tempo esgotado' : 'Estação encerrada')} · {t('correção')}</span>
          <h1>{e.titulo}</h1>
          <p className="mudo">{t('A nota vem do checklist da estação (PEP), com pesos que somam 10.')}</p>
        </div>
        {sample && (
          <button className="botao botao-primario botao-grande" onClick={corrigirComIA} disabled={corrigindo}>
            {corrigindo ? t('Corrigindo… pode levar até um minuto') : t('Corrigir com {nome}', { nome: mentor?.nome || 'IA' })}
          </button>
        )}
      </header>
      {aviso && <p className="aviso" role="status">{aviso}</p>}

      <section className="secao">
        <h2>{t(sample ? 'Ou faça a autoavaliação' : 'Autoavaliação')}</h2>
        <p className="mudo">{t('Marque honestamente o que você fez durante a consulta.')}</p>
        <ol className="checklist">
          {e.pep.map((i) => (
            <li key={i.id}>
              <div className="checklist-item">
                <span>{i.item}</span>
                <span className="mudo pequeno">{t('peso')} {String(i.peso).replace('.', ',')}</span>
              </div>
              <div className="segmentado" role="group" aria-label={`${t('Avaliação')}: ${i.item}`}>
                {Object.entries(NIVEIS).map(([nivel, n]) => (
                  <button key={nivel} className={avaliacao[i.id] === nivel ? 'ativo' : ''} aria-pressed={avaliacao[i.id] === nivel}
                    onClick={() => setAvaliacao({ ...avaliacao, [i.id]: nivel })}>{t(n.rotulo)}</button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <button className="botao botao-primario" disabled={!completa}
          onClick={() => concluir({ avaliacao, comentarios, devolutiva: '', modo: 'autoavaliacao' })}>
          {t('Ver minha nota')}
        </button>
      </section>
    </div>
  );
}

function Resultado({ e, resultado, refazer, voltar }) {
  const { banco } = useApp();
  const mentor = banco.mentorPorId[e.mentor];
  const nota = notaDe(e, resultado.avaliacao);
  return (
    <div className="estacao-resultado">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Resultado')} · {t(resultado.modo === 'ia' ? 'corrigido pela IA' : 'autoavaliação')}</span>
          <h1>{e.titulo}</h1>
        </div>
      </header>
      <div className="numeros">
        <Numero rotulo={t('Nota da estação')} valor={`${nota.toFixed(1).replace('.', ',')} / 10`}
          detalhe={t(nota >= 6 ? 'acima de 6: bom desempenho' : 'abaixo de 6: refaça depois de revisar')} />
        <Numero rotulo={t('Itens adequados')} valor={e.pep.filter((i) => resultado.avaliacao[i.id] === 'adequado').length} detalhe={t('de {n} do checklist', { n: e.pep.length })} />
      </div>
      <FalaMentor mentor={mentor}><p>{resultado.devolutiva || (mentor && tc(mentor, 'mensagens').pratica)}</p></FalaMentor>

      <section className="secao">
        <h2>{t('Checklist')}</h2>
        <ol className="checklist resultado">
          {e.pep.map((i) => {
            const nivel = resultado.avaliacao[i.id];
            return (
              <li key={i.id} className={`nivel-${nivel}`}>
                <span className={`status ${nivel === 'adequado' ? 'status-certa' : nivel === 'inadequado' ? 'status-errada' : 'status-parcial'}`}>
                  {nivel === 'adequado' ? <Icone nome="check" tamanho={14} /> : nivel === 'inadequado' ? <Icone nome="x" tamanho={14} /> : '½'}
                </span>
                <div className="checklist-item">
                  <span>{i.item}</span>
                  {resultado.comentarios[i.id] && <span className="mudo pequeno">{resultado.comentarios[i.id]}</span>}
                </div>
                <span className="checklist-pontos">{(i.peso * NIVEIS[nivel].fator).toFixed(1).replace('.', ',')} / {String(i.peso).replace('.', ',')}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="secao grade-2">
        <div className="cartao impresso">
          <span className="sobretitulo">{t('Diagnóstico esperado')}</span>
          <p>{e.diagnostico}</p>
          <span className="sobretitulo">{t('Conduta esperada')}</span>
          <ul className="lista-conduta">{e.condutaEsperada.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        <div className="cartao">
          <span className="sobretitulo">{t('Referências')}</span>
          <ul className="lista-conduta">{e.referencias.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mudo pequeno">{t('Caso fictício para treino. Confira a versão vigente de cada protocolo.')}</p>
        </div>
      </section>
      <div className="linha-botoes">
        <button className="botao botao-primario" onClick={refazer}><Icone nome="repetir" /> {t('Refazer estação')}</button>
        <button className="botao" onClick={voltar}>{t('Outras estações')}</button>
      </div>
    </div>
  );
}

function Estacao({ e, voltar }) {
  const { despachar } = useApp();
  const sample = useSample();
  const [fase, setFase] = useState('instrucoes');
  const [modo, setModo] = useState('roteiro');
  const [mensagens, setMensagens] = useState([]);
  const [conclusao, setConclusao] = useState('');
  const [tempoEsgotado, setTempoEsgotado] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [rodada, setRodada] = useState(0);

  useEffect(() => { if (sample) setModo('ia'); }, [sample]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [fase]);

  const iniciar = () => {
    setMensagens([{ de: 'paciente', texto: e.paciente.abertura }]);
    setConclusao('');
    setTempoEsgotado(false);
    setResultado(null);
    setRodada((r) => r + 1);
    setFase('consulta');
  };
  const concluir = (r) => {
    setResultado(r);
    despachar({ tipo: 'registrarPratica', id: e.id, resultado: { t: Date.now(), nota: notaDe(e, r.avaliacao), modo: r.modo, itens: r.avaliacao } });
    setFase('resultado');
  };

  if (fase === 'consulta') {
    return <Consulta key={rodada} e={e} modo={modo} sample={sample} setModo={setModo} mensagens={mensagens} setMensagens={setMensagens}
      conclusao={conclusao} setConclusao={setConclusao} encerrar={(esgotado) => { setTempoEsgotado(esgotado); setFase('avaliacao'); }} />;
  }
  if (fase === 'avaliacao') {
    return <Avaliacao e={e} sample={sample} mensagens={mensagens} conclusao={conclusao} tempoEsgotado={tempoEsgotado} concluir={concluir} />;
  }
  if (fase === 'resultado' && resultado) {
    return <Resultado e={e} resultado={resultado} refazer={() => setFase('instrucoes')} voltar={voltar} />;
  }
  return <Instrucoes e={e} modo={modo} setModo={setModo} sample={sample} iniciar={iniciar} voltar={voltar} />;
}

export default function Pratica() {
  const { banco } = useApp();
  const [estacaoId, setEstacaoId] = useState(null);
  const [dupla, setDupla] = useState(false);
  const [discursivas, setDiscursivas] = useState(false);
  const estacao = banco.estacoes.find((e) => e.id === estacaoId);
  if (!banco.estacoes.length) {
    return <Vazio titulo={t('Nenhuma estação disponível')}>{t('O conteúdo da prática não carregou. Recarregue a página.')}</Vazio>;
  }
  if (dupla) return <Dupla voltar={() => setDupla(false)} />;
  if (discursivas) return <Discursivas voltar={() => setDiscursivas(false)} />;
  if (estacao) return <Estacao key={estacao.id} e={estacao} voltar={() => setEstacaoId(null)} />;
  return <Lista abrir={setEstacaoId} abrirDupla={() => setDupla(true)} abrirDiscursivas={() => setDiscursivas(true)} />;
}
