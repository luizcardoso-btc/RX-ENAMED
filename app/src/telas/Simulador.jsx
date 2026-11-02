import { useState, useEffect, useRef, useMemo } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { AREAS, FILTRO_INICIAL } from '../data.js';
import { normalizar } from '../util.js';
import { t, idiomaAtual } from '../i18n.js';
import { ECGS, CHAVES_ECG, svgEcg } from '../ecg.js';
import {
  CASOS, CASO_POR_ID, EXAMES, EXAME_POR_ID, GRUPOS_EXAME, SISTEMAS, perguntasDoCaso, responder, achadoFisico, resultadoExame,
  examesDoTexto, corrigir,
} from '../casos.js';

// Simulador clínico: casos escritos pela equipe, paciente que responde ao que é perguntado, exames com resultado
// definido, ECG, conduta e prescrição, correção por checklist. Tudo no navegador, sem IA e sem custo.

const sorteio = (lista) => lista[Math.floor(Math.random() * lista.length)];
const embaralhar = (lista) => lista.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const alternar = (set, id) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
const nomeSistema = (k) => SISTEMAS.find(([s]) => s === k)?.[1] || k;

function Ecg({ chave, fc, semente }) {
  const html = useMemo(() => svgEcg(chave, { fc, semente }), [chave, fc, semente]);
  return <div className="ecg-moldura" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* -------------------------------------------------------------- lista de casos */

function ListaCasos({ abrir }) {
  const { progresso } = useApp();
  const [area, setArea] = useState('');
  const melhor = useMemo(() => {
    const m = {};
    for (const r of progresso.casosClinicos || []) if (r.casoId && (m[r.casoId] == null || r.nota > m[r.casoId])) m[r.casoId] = r.nota;
    return m;
  }, [progresso.casosClinicos]);
  const lista = CASOS.filter((c) => !area || c.area === area);
  const feitos = CASOS.filter((c) => melhor[c.id] != null).length;
  return (
    <>
      {idiomaAtual() === 'es' && <p className="aviso-idioma">{t('Os casos são em português, como na prova: o paciente fala português.')}</p>}
      <section className="cartao sim-config">
        <div className="sim-lista-topo">
          <div>
            <strong>{t('{n} casos clínicos', { n: CASOS.length })}</strong>
            <span className="mudo pequeno">{t('{f} feitos. Escolha um caso ou sorteie.', { f: feitos })}</span>
          </div>
          <div className="linha-botoes">
            <select value={area} onChange={(e) => setArea(e.target.value)} aria-label={t('Filtrar por área')}>
              <option value="">{t('Todas as áreas')}</option>
              {AREAS.map((a) => <option key={a.nome} value={a.nome}>{t(a.nome)}</option>)}
            </select>
            <button className="botao botao-primario" onClick={() => abrir(sorteio(lista.length ? lista : CASOS).id)}><Icone nome="embaralhar" /> {t('Caso aleatório')}</button>
          </div>
        </div>
      </section>
      <ul className="sim-casos">
        {lista.map((c) => (
          <li key={c.id}>
            <button className="cartao sim-caso-cartao" onClick={() => abrir(c.id)}>
              <span className="sobretitulo">{t(c.area)} · {t(c.dificuldade)}</span>
              <strong>{c.titulo}</strong>
              <span className="mudo pequeno">{c.cenario}</span>
              <span className={`sim-caso-nota${melhor[c.id] != null ? ' feito' : ''}`}>
                {melhor[c.id] != null ? t('Melhor nota: {n}', { n: melhor[c.id].toFixed(1) }) : t('Não feito')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <ul className="sim-passos">
        {[['pessoas', 'Converse com o paciente', 'Pergunte como no plantão: o paciente responde só ao que você pergunta.'],
          ['alvo', 'Examine e peça exames', 'Exame físico por sistema, laboratório, imagem e ECG com traçado para laudar.'],
          ['livro', 'Diagnóstico, conduta e prescrição', 'Escolha o diagnóstico e marque a conduta e a prescrição certas, sem cair nas armadilhas.'],
          ['estrela', 'Correção com checklist', 'Nota por etapa, o que faltou perguntar, exames desnecessários, erros perigosos e pontos-chave de prova.']].map(([i, ti, tx]) => (
          <li key={ti} className="cartao"><Icone nome={i} tamanho={22} /><strong>{t(ti)}</strong><span className="mudo">{t(tx)}</span></li>
        ))}
      </ul>
    </>
  );
}

/* ----------------------------------------------------------------- atendimento */

function Atendimento({ caso, encerrar, sair }) {
  const [mensagens, setMensagens] = useState([{ de: 'paciente', texto: caso.queixa }]);
  const [texto, setTexto] = useState('');
  const [perguntas, setPerguntas] = useState(new Set());
  const [sistemas, setSistemas] = useState(new Set());
  const [exames, setExames] = useState(new Set());
  const [pedido, setPedido] = useState('');
  const [aviso, setAviso] = useState('');
  const [aba, setAba] = useState('exame');
  const [usouRoteiro, setUsouRoteiro] = useState(false);
  const [decisao, setDecisao] = useState({ diagnostico: '', conduta: new Set(), prescricao: new Set() });
  const fim = useRef(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [mensagens]);
  const roteiro = useMemo(() => embaralhar(perguntasDoCaso(caso)), [caso]);
  const opcoes = useMemo(() => ({ dx: embaralhar(caso.diagnostico.opcoes), conduta: embaralhar(caso.conduta), prescricao: embaralhar(caso.prescricao) }), [caso]);
  const fc = Number(/FC (\d+)/.exec(caso.vitais)?.[1]) || undefined;
  const nome = caso.paciente.nome.split(' ')[0];

  const perguntar = (fala, item) => {
    const f = fala.trim();
    if (!f) return;
    const r = item ? { pergunta: item, texto: item.resposta } : responder(caso, f, perguntas);
    if (r.pergunta) setPerguntas((s) => new Set(s).add(r.pergunta.id));
    setMensagens((ms) => [...ms, { de: 'aluno', texto: f }, { de: 'paciente', texto: r.texto }]);
    setTexto('');
  };

  const examinar = (k) => {
    if (sistemas.has(k)) return;
    setSistemas((s) => new Set(s).add(k));
    setMensagens((ms) => [...ms, { de: 'aluno', texto: t('Examina: {s}', { s: t(nomeSistema(k)) }) }, { de: 'exame', texto: achadoFisico(caso, k) }]);
  };

  const solicitar = (ids) => {
    const novos = ids.filter((id) => !exames.has(id));
    if (!novos.length) { setAviso(ids.length ? t('Esses exames já foram pedidos.') : t('Não reconheci o exame. Escolha na lista abaixo.')); return; }
    setAviso('');
    setExames((s) => new Set([...s, ...novos]));
    setMensagens((ms) => [...ms, { de: 'aluno', texto: t('Solicita: {s}', { s: novos.map((id) => t(EXAME_POR_ID[id].nome)).join(', ') }) },
      ...novos.map((id) => ({ de: 'exame', texto: `${t(EXAME_POR_ID[id].nome)}: ${resultadoExame(caso, id)}` }))]);
    setPedido('');
  };

  const podeEncerrar = decisao.diagnostico && (decisao.conduta.size > 0 || decisao.prescricao.size > 0);

  return (
    <div className="sim-atendimento">
      <header className="sim-caso-topo cartao">
        <div>
          <span className="sobretitulo">{t(caso.area)} · {caso.cenario}</span>
          <h2>{caso.titulo}</h2>
          <p className="mudo">{caso.paciente.nome}, {caso.paciente.idade}{typeof caso.paciente.idade === 'number' ? ` ${t('anos')}` : ''}, {caso.paciente.ocupacao}</p>
        </div>
        <button className="botao" onClick={sair}>{t('Sair do caso')}</button>
      </header>

      <div className="consulta-corpo">
        <section className="conversa" aria-label={t('Consulta')}>
          <ol className="mensagens" aria-live="polite">
            {mensagens.map((m, i) => (
              <li key={i} className={`mensagem mensagem-${m.de === 'aluno' ? 'candidato' : m.de === 'exame' ? 'examinador' : 'paciente'}`}>
                <span className="mensagem-quem">{m.de === 'aluno' ? t('Você') : m.de === 'exame' ? t('Exame') : nome}</span>
                <span className="mensagem-texto">{m.texto}</span>
              </li>
            ))}
            <li ref={fim} aria-hidden="true" />
          </ol>
          <form className="enviar" onSubmit={(e) => { e.preventDefault(); perguntar(texto); }}>
            <label htmlFor="fala-sim" className="visualmente-oculto">{t('Sua pergunta ao paciente')}</label>
            <textarea id="fala-sim" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
              placeholder={t('Pergunte ao paciente: início, características, antecedentes, medicações…')}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(texto); } }} />
            <div className="linha-botoes"><button className="botao botao-primario" disabled={!texto.trim()}>{t('Perguntar')}</button></div>
          </form>
          <details className="pedidos" onToggle={(e) => { if (e.currentTarget.open) setUsouRoteiro(true); }}>
            <summary>{t('Travou? Ver perguntas possíveis')}</summary>
            <div className="chips">
              {roteiro.map((p) => (
                <button key={p.id} className="chip" disabled={perguntas.has(p.id)} onClick={() => perguntar(p.rotulo, p)}>{p.rotulo}</button>
              ))}
            </div>
          </details>
        </section>

        <aside className="consulta-lado sim-lado">
          <div className="segmentado" role="tablist">
            {[['exame', 'Exame físico'], ['exames', 'Exames'], ['conduta', 'Conduta']].map(([k, r]) => (
              <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>{t(r)}</button>
            ))}
          </div>
          {aba === 'exame' && (
            <div className="cartao sim-painel">
              <div className="chips">
                {SISTEMAS.map(([k, r]) => <button key={k} className="chip" disabled={sistemas.has(k)} onClick={() => examinar(k)}>{t(r)}</button>)}
              </div>
            </div>
          )}
          {aba === 'exames' && (
            <div className="cartao sim-painel">
              <form onSubmit={(e) => { e.preventDefault(); solicitar(examesDoTexto(pedido)); }} className="enviar">
                <label className="campo">
                  <span>{t('Quais exames você pede?')}</span>
                  <input value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={300} placeholder={t('Ex.: hemograma, troponina, ECG')} />
                </label>
                <button className="botao botao-primario" disabled={!pedido.trim()}>{t('Solicitar')}</button>
              </form>
              {aviso && <p className="erro-texto" role="alert">{aviso}</p>}
              {GRUPOS_EXAME.map((g) => (
                <div key={g} className="sim-grupo-exames">
                  <span className="sobretitulo">{t(g)}</span>
                  <div className="chips">
                    {EXAMES.filter((e) => e.grupo === g).map((e) => (
                      <button key={e.id} className="chip" disabled={exames.has(e.id)} onClick={() => solicitar([e.id])}>{t(e.nome)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {aba === 'conduta' && (
            <div className="cartao sim-painel sim-decisao">
              <fieldset>
                <legend>{t('Diagnóstico')}</legend>
                {opcoes.dx.map((o) => (
                  <label key={o.id} className="sim-escolha">
                    <input type="radio" name="dx" checked={decisao.diagnostico === o.id} onChange={() => setDecisao({ ...decisao, diagnostico: o.id })} />
                    <span>{o.texto}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t('Conduta (marque tudo o que faria)')}</legend>
                {opcoes.conduta.map((o) => (
                  <label key={o.id} className="sim-escolha">
                    <input type="checkbox" checked={decisao.conduta.has(o.id)} onChange={() => setDecisao({ ...decisao, conduta: alternar(decisao.conduta, o.id) })} />
                    <span>{o.texto}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>{t('Prescrição (marque o que prescreveria)')}</legend>
                {opcoes.prescricao.map((o) => (
                  <label key={o.id} className="sim-escolha">
                    <input type="checkbox" checked={decisao.prescricao.has(o.id)} onChange={() => setDecisao({ ...decisao, prescricao: alternar(decisao.prescricao, o.id) })} />
                    <span>{o.texto}</span>
                  </label>
                ))}
              </fieldset>
              <button className="botao botao-primario" disabled={!podeEncerrar}
                onClick={() => encerrar({ perguntas, sistemas, exames, usouRoteiro, ...decisao })}>
                {t('Encerrar e ver correção')}
              </button>
            </div>
          )}
        </aside>
      </div>
      {exames.has('ecg') && (
        <section className="cartao sim-ecg">
          <span className="sobretitulo">{t('Eletrocardiograma')}</span>
          <Ecg chave={caso.ecg || 'normal'} fc={caso.ecg ? undefined : fc} semente={caso.id.length * 13} />
          <p className="mudo pequeno">{t('Laude o traçado antes de decidir: ritmo, frequência, PR, QRS, eixo e ST-T.')}</p>
        </section>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- correção */

function Correcao({ caso, registro, refazer, outro }) {
  const { despachar } = useApp();
  const r = useMemo(() => corrigir(caso, registro), [caso, registro]);
  const salvo = useRef(false);
  useEffect(() => {
    if (salvo.current) return;
    salvo.current = true;
    despachar({ tipo: 'simulacaoClinica', registro: { em: Date.now(), casoId: caso.id, area: caso.area, nota: r.nota } });
  }, []);
  const p = r.partes;
  const linhas = [
    ['Anamnese', p.anamnese, p.anamnese.faltou.length ? `${t('Faltou perguntar')}: ${p.anamnese.faltou.join(' · ')}` : t('Perguntou tudo o que era essencial.')],
    ['Exame físico', p.fisico, p.fisico.faltou.length ? `${t('Faltou examinar')}: ${p.fisico.faltou.map((s) => t(s)).join(' · ')}` : t('Examinou o que era essencial.')],
    ['Exames', p.exames, [p.exames.faltou.length && `${t('Faltou pedir')}: ${p.exames.faltou.join(' · ')}`, p.exames.desnecessarios.length && `${t('Desnecessários')}: ${p.exames.desnecessarios.join(' · ')}`].filter(Boolean).join('. ') || t('Pediu os exames certos, sem excessos.')],
    ['Diagnóstico', p.diagnostico, p.diagnostico.nota ? t('Correto.') : `${t('Você escolheu')}: ${p.diagnostico.escolhido || '—'}. ${p.diagnostico.comentario}`],
    ['Conduta', p.conduta, p.conduta.faltou.length ? `${t('Faltou')}: ${p.conduta.faltou.join(' · ')}` : t('Conduta completa.')],
    ['Prescrição', p.prescricao, p.prescricao.faltou.length ? `${t('Faltou')}: ${p.prescricao.faltou.join(' · ')}` : t('Prescrição completa.')],
  ];
  const certo = caso.diagnostico.opcoes.find((o) => o.certo);
  const marcadas = new Set([...registro.conduta, ...registro.prescricao]);
  return (
    <div className="sim-correcao">
      <section className="destaque sim-nota">
        <div>
          <span className="sobretitulo">{t('Resultado do caso')}</span>
          <h2>{certo.texto}</h2>
          <p>{r.perigosos.length ? t('Cada erro perigoso tirou 1 ponto da nota: na prova, um erro grave pode custar a estação.') : r.nota >= 8 ? t('Excelente atendimento: você passaria nesta estação.') : r.nota >= 6 ? t('Bom atendimento, com pontos a ajustar.') : t('Reveja os pontos abaixo e refaça o caso.')}</p>
        </div>
        <strong className="sim-nota-valor">{r.nota.toFixed(1)}<small>/10</small></strong>
      </section>
      {r.perigosos.length > 0 && (
        <section className="cartao sim-alerta">
          <h3><Icone nome="x" /> {t('Erros que custariam caro')}</h3>
          <ul>{r.perigosos.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      <ul className="sim-partes">
        {linhas.map(([nome, parte, txt]) => (
          <li key={nome} className="cartao">
            <div className="sim-parte-topo"><strong>{t(nome)}</strong><span className="sim-parte-nota">{parte.nota.toFixed(1)}/10</span></div>
            <p>{txt}</p>
          </li>
        ))}
      </ul>
      {registro.usouRoteiro && <p className="mudo pequeno">{t('Você abriu as perguntas possíveis. Na prova não há roteiro: refaça o caso só com as suas perguntas.')}</p>}
      <section className="cartao">
        <h3>{t('Gabarito da conduta e da prescrição')}</h3>
        <ul className="sim-gabarito-lista">
          {[...caso.conduta, ...caso.prescricao].map((o) => {
            const marcou = marcadas.has(o.id);
            const estado = o.certo ? (marcou ? 'acertou' : o.opcional ? 'opcional' : 'faltou') : (marcou ? 'errou' : 'evitou');
            return (
              <li key={o.id} className={`sim-gab sim-gab-${estado}`}>
                <span className="sim-gab-selo">{t({ acertou: 'Certo', faltou: 'Faltou', opcional: 'Opcional', errou: 'Errado', evitou: 'Evitou' }[estado])}</span>
                <span>{o.texto}{o.comentario && !o.certo ? <em className="mudo"> · {o.comentario}</em> : null}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="cartao">
        <h3>{t('Pontos-chave para a prova')}</h3>
        <ul className="sim-chave">{caso.pontosChave.map((x) => <li key={x}>{x}</li>)}</ul>
        {caso.ecg && <p className="sim-dica"><Icone nome="grafico" /> <span><strong>{t('ECG')}:</strong> {ECGS[caso.ecg].laudo}</span></p>}
      </section>
      <div className="linha-botoes">
        <button className="botao" onClick={refazer}><Icone nome="repetir" /> {t('Refazer este caso')}</button>
        <button className="botao botao-primario" onClick={outro}>{t('Outro caso')} <Icone nome="direita" /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- ECG */

function TreinoEcg() {
  const [rodada, setRodada] = useState(() => ({ chave: sorteio(CHAVES_ECG), semente: Math.floor(Math.random() * 9999) }));
  const [escolha, setEscolha] = useState(null);
  const [placar, setPlacar] = useState({ certos: 0, total: 0 });
  const e = ECGS[rodada.chave];
  const opcoes = useMemo(() => embaralhar([rodada.chave, ...embaralhar(CHAVES_ECG.filter((k) => k !== rodada.chave)).slice(0, 3)]), [rodada]);

  const responderEcg = (k) => {
    if (escolha) return;
    setEscolha(k);
    setPlacar((p) => ({ certos: p.certos + (k === rodada.chave ? 1 : 0), total: p.total + 1 }));
  };
  const proximo = () => {
    let chave = sorteio(CHAVES_ECG);
    if (chave === rodada.chave) chave = sorteio(CHAVES_ECG);
    setRodada({ chave, semente: Math.floor(Math.random() * 9999) });
    setEscolha(null);
  };

  return (
    <div className="sim-ecg-treino">
      <section className="cartao sim-ecg">
        <div className="sim-ecg-topo">
          <span className="sobretitulo">{t('Qual é o diagnóstico deste ECG?')}</span>
          <span className="mudo pequeno">{t('Acertos: {c} de {n}', { c: placar.certos, n: placar.total })}</span>
        </div>
        <Ecg chave={rodada.chave} semente={rodada.semente} />
      </section>
      <div className="sim-ecg-resposta">
        <section className="cartao">
          <ul className="sim-opcoes">
            {opcoes.map((k) => (
              <li key={k}>
                <button className={`alternativa-botao${escolha ? (k === rodada.chave ? ' certa' : k === escolha ? ' errada' : '') : ''}`} disabled={!!escolha} onClick={() => responderEcg(k)}>
                  {t(ECGS[k].nome)}
                </button>
              </li>
            ))}
          </ul>
          <div className="linha-botoes">
            <button className="botao botao-primario" onClick={proximo}>{t('Próximo ECG')} <Icone nome="direita" /></button>
          </div>
        </section>
        {escolha ? (
          <section className="cartao sim-gabarito">
            <h3>{escolha === rodada.chave ? t('Acertou!') : t('Resposta: {r}', { r: t(e.nome) })}</h3>
            <ul>{e.achados.map((a) => <li key={a}>{a}</li>)}</ul>
            <p><strong>{t('Laudo')}:</strong> {e.laudo}</p>
          </section>
        ) : (
          <section className="cartao sim-gabarito">
            <h3>{t('Roteiro de leitura')}</h3>
            <ol className="sim-chave">
              {['Ritmo: há onda P antes de cada QRS? RR regular?', 'Frequência: 300 dividido pelo número de quadrados grandes entre dois R.', 'Intervalo PR (0,12–0,20 s) e duração do QRS (< 0,12 s).', 'Eixo: DI e aVF positivos = eixo normal.', 'Segmento ST e onda T: supra, infra, inversões, apiculamento.'].map((x) => <li key={x}>{t(x)}</li>)}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- busca */

function Aula({ aula }) {
  const a = (idiomaAtual() === 'es' && aula.es) || aula.pt;
  return (
    <details className="cartao sim-aula">
      <summary><Icone nome="livro" /> <strong>{a.titulo}</strong></summary>
      {a.resumo && <p>{a.resumo}</p>}
      {(a.secoes || []).map((s) => (
        <section key={s.titulo}>
          <h4>{s.titulo}</h4>
          {(s.paragrafos || []).map((x, i) => <p key={i}>{x}</p>)}
          {s.itens?.length > 0 && <ul>{s.itens.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </section>
      ))}
      {a.pegadinhas?.length > 0 && <section className="sim-pegadinhas"><h4>{t('Pegadinhas de prova')}</h4><ul>{a.pegadinhas.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
    </details>
  );
}

function Cartao({ c }) {
  const [virado, setVirado] = useState(false);
  const es = idiomaAtual() === 'es' && c.es;
  return (
    <li>
      <button className={`cartao sim-flash${virado ? ' virado' : ''}`} onClick={() => setVirado(!virado)} aria-pressed={virado}>
        <span className="sobretitulo">{c.tema}</span>
        <strong>{es ? c.es.frente : c.frente}</strong>
        {virado ? <span>{es ? c.es.verso : c.verso}</span> : <span className="mudo pequeno">{t('Toque para ver a resposta')}</span>}
      </button>
    </li>
  );
}

function QuizBanco({ questoes, comentarios }) {
  const [respostas, setRespostas] = useState({});
  const letras = ['A', 'B', 'C', 'D', 'E'];
  return (
    <ol className="sim-quiz">
      {questoes.map((q, i) => {
        const r = respostas[q.id];
        const com = comentarios[q.id]?.[idiomaAtual() === 'es' ? 'es' : 'pt'] || comentarios[q.id]?.pt;
        return (
          <li key={q.id} className="cartao">
            <span className="sobretitulo">{q.exame} {q.edicao} · {q.especialidade}</span>
            <p className="sim-quiz-enunciado"><strong>{i + 1}.</strong> {q.enunciado.replace(/\[FIG:\d+\]/g, '')}</p>
            <ul className="sim-opcoes">
              {q.alternativas.map((a, j) => {
                const l = letras[j];
                const classe = r ? (l === q.gabarito ? ' certa' : l === r ? ' errada' : '') : '';
                return (
                  <li key={l}>
                    <button className={`alternativa-botao${classe}`} disabled={!!r} onClick={() => setRespostas({ ...respostas, [q.id]: l })}>
                      <b>{l})</b> {a}
                    </button>
                  </li>
                );
              })}
            </ul>
            {r && <p className="sim-ia-texto"><strong>{r === q.gabarito ? t('Correto.') : t('Gabarito: {g}.', { g: q.gabarito })}</strong> {com?.resumo || ''}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function BuscaMedica({ abrirCaso }) {
  const { banco, setFiltro, ir } = useApp();
  const [termo, setTermo] = useState('');
  const [consulta, setConsulta] = useState('');
  const [quiz, setQuiz] = useState(null);

  const achados = useMemo(() => {
    const n = normalizar(consulta.trim());
    if (n.length < 3) return null;
    const tem = (...txt) => normalizar(txt.filter(Boolean).join(' ')).includes(n);
    const textoAula = (a) => [a.pt.titulo, a.pt.resumo, ...(a.pt.secoes || []).flatMap((s) => [s.titulo, ...(s.paragrafos || []), ...(s.itens || [])])].join(' ');
    return {
      aulas: banco.aulas.filter((a) => tem(textoAula(a), a.especialidade)),
      cartoes: banco.cartoes.filter((c) => tem(c.tema, c.frente, c.verso, c.especialidade)).slice(0, 12),
      questoes: banco.questoes.filter((q) => !q.anulada && q.gabarito && q.busca.includes(n)),
      casos: CASOS.filter((c) => tem(c.titulo, c.area, c.diagnostico.opcoes.find((o) => o.certo).texto, ...c.pontosChave)),
      ecgs: CHAVES_ECG.filter((k) => tem(ECGS[k].nome, ECGS[k].laudo)),
    };
  }, [consulta, banco]);

  const buscar = (ev) => { ev.preventDefault(); setConsulta(termo); setQuiz(null); };
  const simular = () => setQuiz(embaralhar(achados.questoes.filter((q) => !q.figuras?.length)).slice(0, 5));
  const nada = achados && !achados.aulas.length && !achados.cartoes.length && !achados.questoes.length && !achados.casos.length && !achados.ecgs.length;

  return (
    <div className="sim-busca">
      <form className="cartao sim-busca-form" role="search" onSubmit={buscar}>
        <Icone nome="lupa" />
        <input value={termo} onChange={(ev) => setTermo(ev.target.value)} placeholder={t('Busque um tema: cetoacidose, sífilis, apendicite, pré-eclâmpsia…')}
          aria-label={t('Tema médico')} maxLength={80} />
        <button className="botao botao-primario" disabled={termo.trim().length < 3}>{t('Buscar')}</button>
      </form>
      {nada && <p className="mudo">{t('Nada encontrado para "{q}". Tente outra palavra, como o nome da doença ou do sintoma.', { q: consulta })}</p>}
      {achados && achados.questoes.length > 0 && (
        <section className="cartao sim-banco">
          <div>
            <strong>{t('{n} questões oficiais sobre "{q}" no banco', { n: achados.questoes.length, q: consulta })}</strong>
            <span className="mudo pequeno">{t('Provas anteriores do Inep, com comentário.')}</span>
          </div>
          <div className="linha-botoes">
            <button className="botao" onClick={() => { setFiltro({ ...FILTRO_INICIAL, busca: consulta }); ir('questoes'); }}>{t('Ver no banco')}</button>
            <button className="botao botao-primario" onClick={simular}>{t('Simular 5 questões')}</button>
          </div>
        </section>
      )}
      {quiz && <QuizBanco key={quiz.map((q) => q.id).join()} questoes={quiz} comentarios={banco.comentarios} />}
      {achados?.casos.length > 0 && (
        <section className="sim-secao-busca">
          <h3>{t('Casos clínicos')}</h3>
          <ul className="sim-casos">
            {achados.casos.map((c) => (
              <li key={c.id}><button className="cartao sim-caso-cartao" onClick={() => abrirCaso(c.id)}>
                <span className="sobretitulo">{t(c.area)}</span><strong>{c.titulo}</strong><span className="mudo pequeno">{t('Atender este caso')}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}
      {achados?.aulas.length > 0 && (
        <section className="sim-secao-busca">
          <h3>{t('Aulas')}</h3>
          {achados.aulas.map((a) => <Aula key={a.id} aula={a} />)}
        </section>
      )}
      {achados?.cartoes.length > 0 && (
        <section className="sim-secao-busca">
          <h3>{t('Flashcards')}</h3>
          <ul className="sim-flashes">{achados.cartoes.map((c) => <Cartao key={c.id} c={c} />)}</ul>
        </section>
      )}
      {achados?.ecgs.length > 0 && (
        <section className="sim-secao-busca">
          <h3>{t('Eletrocardiograma')}</h3>
          {achados.ecgs.map((k) => (
            <details key={k} className="cartao sim-aula">
              <summary><Icone nome="grafico" /> <strong>{ECGS[k].nome}</strong></summary>
              <Ecg chave={k} semente={k.length * 7} />
              <ul>{ECGS[k].achados.map((x) => <li key={x}>{x}</li>)}</ul>
              <p>{ECGS[k].laudo}</p>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ tela */

export default function Simulador() {
  const [aba, setAba] = useState('caso');
  const [casoInicial, setCasoInicial] = useState(0);
  const abrirCaso = useRef(null);
  return (
    <div className="tela-simulador">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Simulador clínico')}</span>
          <h1>{t('Treine como se estivesse no plantão')}</h1>
          <p className="mudo">{t('Converse com o paciente, examine, peça exames, interprete o ECG, decida a conduta e prescreva. No fim, a correção mostra onde você ganharia ou perderia pontos.')}</p>
        </div>
      </header>
      <div className="segmentado sim-abas" role="tablist" aria-label={t('Modos do simulador')}>
        {[['caso', 'Caso clínico', 'pessoas'], ['ecg', 'ECG', 'grafico'], ['busca', 'Busca médica', 'lupa']].map(([k, r, i]) => (
          <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? 'ativo' : ''} onClick={() => setAba(k)}>
            <Icone nome={i} tamanho={16} /> {t(r)}
          </button>
        ))}
      </div>
      {aba === 'caso' && <CasoComAbertura inicial={abrirCaso} chave={casoInicial} />}
      {aba === 'ecg' && <TreinoEcg />}
      {aba === 'busca' && <BuscaMedica abrirCaso={(id) => { abrirCaso.current = id; setCasoInicial((n) => n + 1); setAba('caso'); }} />}
    </div>
  );
}

// Abre direto um caso vindo da busca; sem isso, mostra a lista.
function CasoComAbertura({ inicial, chave }) {
  return <CasoClinicoInicial key={chave} inicial={inicial.current} limpar={() => { inicial.current = null; }} />;
}

function CasoClinicoInicial({ inicial, limpar }) {
  useEffect(() => { limpar(); }, []);
  return <CasoClinicoCom inicial={inicial} />;
}

function CasoClinicoCom({ inicial }) {
  const [casoId, setCasoId] = useState(inicial || null);
  const [registro, setRegistro] = useState(null);
  const [rodada, setRodada] = useState(0);
  const caso = casoId && CASO_POR_ID[casoId];
  const lista = () => { setCasoId(null); setRegistro(null); };
  useEffect(() => { window.scrollTo?.(0, 0); }, [casoId, registro]);
  if (caso && registro) return <Correcao caso={caso} registro={registro} refazer={() => { setRegistro(null); setRodada((n) => n + 1); }} outro={lista} />;
  if (caso) return <Atendimento key={`${caso.id}-${rodada}`} caso={caso} encerrar={setRegistro} sair={lista} />;
  return <ListaCasos abrir={setCasoId} />;
}
