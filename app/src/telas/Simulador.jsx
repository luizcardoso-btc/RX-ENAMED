import { useState, useEffect, useRef, useMemo } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { AREAS, FILTRO_INICIAL } from '../data.js';
import { normalizar } from '../util.js';
import { t, idiomaAtual } from '../i18n.js';
import { useSample } from './Pratica.jsx';
import { ECGS, CHAVES_ECG, svgEcg } from '../ecg.js';

// Simulador clínico com IA: caso real em consulta (anamnese, exame físico, exames, ECG, conduta e prescrição),
// leitura de ECG e busca de qualquer tema médico com questões geradas na hora.

const lingua = () => (idiomaAtual() === 'es' ? 'espanhol (termos técnicos e nomes de fármacos como no Brasil)' : 'português do Brasil');
const ERROS = {
  quota: 'Você usou as interações com a IA de hoje. Assine um plano ou volte amanhã.',
  rate_limited: 'Muitas mensagens em pouco tempo. Espere um minuto.',
  session_expired: 'Sua sessão expirou. Entre de novo na sua conta.',
  sampling_disabled: 'A IA ainda não foi ativada nesta plataforma.',
  refused: 'A IA não respondeu a esse pedido. Reformule.',
};
const erroIa = (e) => t(ERROS[e?.code] || 'A IA não respondeu agora. Tente de novo.');
const sorteio = (lista) => lista[Math.floor(Math.random() * lista.length)];
const embaralhar = (lista) => lista.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

const SISTEMAS = [
  ['geral', 'Estado geral'], ['cabeca', 'Cabeça e pescoço'], ['cardio', 'Cardiovascular'], ['resp', 'Respiratório'],
  ['abdome', 'Abdome'], ['neuro', 'Neurológico'], ['extremidades', 'Extremidades e pele'], ['especifico', 'Exame específico'],
];
const SUGESTOES_EXAMES = ['Hemograma', 'PCR', 'Função renal e eletrólitos', 'Glicemia', 'Gasometria arterial', 'Troponina', 'Urina tipo 1', 'Raio-X de tórax', 'USG de abdome', 'TC de crânio', 'Beta-hCG'];

function Ecg({ chave, fc, semente }) {
  const html = useMemo(() => svgEcg(chave, { fc, semente }), [chave, fc, semente]);
  return <div className="ecg-moldura" dangerouslySetInnerHTML={{ __html: html }} />;
}

function AvisoSemIa({ sample }) {
  if (sample) return null;
  return (
    <div className="aviso-ia">
      <Icone nome="cadeado" />
      <p>{t(sample === undefined ? 'Verificando se a IA está disponível…'
        : 'A IA precisa da sua conta: entre na plataforma para usar o simulador de casos e a busca. O treino de ECG funciona sem IA.')}</p>
    </div>
  );
}

/* --------------------------------------------------------------- caso clínico */

function promptCaso({ area, tema, dificuldade, colado }) {
  return [
    'Crie um caso clínico para treino de um médico que vai fazer o ENAMED/Revalida. O aluno vai conversar com o paciente, examinar, pedir exames e propor conduta e prescrição.',
    colado ? `Baseie o caso neste texto enviado pelo aluno (complete o que faltar, mantendo a coerência):\n"""${colado.slice(0, 6000)}"""`
      : `Grande área: ${area}. ${tema ? `Tema: ${tema}.` : 'Escolha um tema de alta incidência nas provas do Inep.'} Dificuldade: ${dificuldade}.`,
    'O cenário deve ser brasileiro (UBS, UPA, pronto-socorro, enfermaria ou ambulatório do SUS) e as condutas devem seguir protocolos do Ministério da Saúde e diretrizes brasileiras.',
    `Se o ECG for relevante, escolha "ecg" entre: ${CHAVES_ECG.join(', ')}. Se não for relevante, use "normal".`,
    `Escreva em ${lingua()}. A "queixa" é o que o paciente fala ao entrar (1 frase, sem revelar o diagnóstico).`,
    'Responda só com JSON neste formato:',
    JSON.stringify({
      titulo: 'título neutro, sem o diagnóstico', cenario: 'local e contexto', queixa: '...',
      paciente: { nome: '', idade: 0, sexo: '', ocupacao: '', perfil: 'personalidade e emoção' },
      historia: 'TODOS os fatos da anamnese (HDA, antecedentes, medicações, alergias, hábitos, família, social) que o paciente revela se perguntado',
      sinaisVitais: { PA: '', FC: 0, FR: 0, Temp: '', SatO2: '', outros: '' },
      exameFisico: Object.fromEntries(SISTEMAS.map(([k]) => [k, '...'])),
      exames: [{ nome: '', resultado: 'resultado com valores e unidades' }],
      ecg: 'normal', diagnostico: '', diferenciais: [''], condutaEsperada: [''], prescricaoModelo: 'prescrição completa com dose, via e frequência', pontosChave: [''],
    }),
  ].join('\n');
}

function sistemaPaciente(c) {
  return [
    `Você é o PACIENTE ${c.paciente?.nome}, ${c.paciente?.idade} anos, ${c.paciente?.ocupacao}, num caso clínico simulado para treino médico. Perfil: ${c.paciente?.perfil}`,
    `Cenário: ${c.cenario}. Sua queixa: ${c.queixa}`,
    `Fatos que você sabe (revele só o que for perguntado, com palavras de leigo): ${c.historia}`,
    'Regras: responda em 1 a 3 frases, coloquial, com a emoção do perfil. Não adiante sintomas. Nunca diga o diagnóstico nem sugira exames ou condutas.',
    'Você não sabe resultados de exame físico nem de exames: se pedirem, diga que o médico pode examinar ou pedir os exames.',
    'Se perguntarem algo fora dos fatos, responda de forma neutra e coerente, sem inventar achados importantes. Não saia do personagem.',
    `Fale em ${lingua()}.`,
  ].join('\n');
}

function conversaParaTexto(mensagens) {
  const quem = { aluno: 'Médico', paciente: 'Paciente', exame: 'Exame', sistema: 'Registro' };
  return mensagens.filter((m) => quem[m.de] && !m.pendente).map((m) => `${quem[m.de]}: ${m.texto}`).join('\n').slice(-30000);
}

function ConfigCaso({ sample, iniciar }) {
  const [area, setArea] = useState(AREAS[0].nome);
  const [tema, setTema] = useState('');
  const [dificuldade, setDificuldade] = useState('intermediária');
  const [colado, setColado] = useState('');
  const [modo, setModo] = useState('gerar');
  const [estado, setEstado] = useState('');
  const [erro, setErro] = useState('');

  const gerar = async () => {
    setEstado('gerando'); setErro('');
    try {
      const c = await sample.json(promptCaso({ area, tema: tema.trim(), dificuldade, colado: modo === 'colar' ? colado.trim() : '' }), { modelTier: 'default', cache: false });
      if (!c?.paciente || !c?.diagnostico) throw Object.assign(new Error(), { code: 'invalid_json' });
      iniciar({ ...c, area, ecg: ECGS[c.ecg] ? c.ecg : 'normal' });
    } catch (e) {
      setErro(erroIa(e)); setEstado('');
    }
  };

  return (
    <section className="cartao sim-config">
      <div className="segmentado" role="tablist">
        <button role="tab" aria-selected={modo === 'gerar'} className={modo === 'gerar' ? 'ativo' : ''} onClick={() => setModo('gerar')}>{t('Gerar um caso')}</button>
        <button role="tab" aria-selected={modo === 'colar'} className={modo === 'colar' ? 'ativo' : ''} onClick={() => setModo('colar')}>{t('Colar meu caso')}</button>
      </div>
      {modo === 'gerar' ? (
        <div className="sim-campos">
          <label className="campo">
            <span>{t('Grande área')}</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => <option key={a.nome} value={a.nome}>{t(a.nome)}</option>)}
            </select>
          </label>
          <label className="campo">
            <span>{t('Tema (opcional)')}</span>
            <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder={t('Ex.: dor torácica, sepse, pré-eclâmpsia')} maxLength={120} />
          </label>
          <label className="campo">
            <span>{t('Dificuldade')}</span>
            <select value={dificuldade} onChange={(e) => setDificuldade(e.target.value)}>
              <option value="básica">{t('Básica')}</option>
              <option value="intermediária">{t('Intermediária')}</option>
              <option value="avançada">{t('Avançada')}</option>
            </select>
          </label>
        </div>
      ) : (
        <label className="campo">
          <span>{t('Cole um caso clínico (de uma questão, de um resumo ou do plantão)')}</span>
          <textarea rows={6} value={colado} onChange={(e) => setColado(e.target.value)} maxLength={6000}
            placeholder={t('Ex.: Homem, 58 anos, dor torácica em aperto há 40 minutos, sudorese…')} />
        </label>
      )}
      {erro && <p className="erro-texto" role="alert">{erro}</p>}
      <div className="linha-botoes">
        <button className="botao botao-primario botao-grande" onClick={gerar} disabled={!sample || estado === 'gerando' || (modo === 'colar' && colado.trim().length < 30)}>
          {estado === 'gerando' ? t('Montando o caso…') : <><Icone nome="pessoas" /> {t('Começar atendimento')}</>}
        </button>
      </div>
    </section>
  );
}

function Atendimento({ caso, sample, encerrar }) {
  const [mensagens, setMensagens] = useState([{ de: 'paciente', texto: caso.queixa }]);
  const [texto, setTexto] = useState('');
  const [aguardando, setAguardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [aba, setAba] = useState('exame');
  const [vistos, setVistos] = useState({});
  const [pedido, setPedido] = useState('');
  const [ecgAberto, setEcgAberto] = useState(false);
  const [resposta, setResposta] = useState({ hipotese: '', conduta: '', prescricao: '', ecg: '' });
  const fim = useRef(null);
  const controle = useRef(null);
  useEffect(() => () => controle.current?.abort(), []);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }); }, [mensagens]);
  const fc = Number(caso.sinaisVitais?.FC) || undefined;

  const falar = async (conteudo) => {
    const fala = conteudo.trim();
    if (!fala || aguardando) return;
    const historico = [...mensagens, { de: 'aluno', texto: fala }];
    setMensagens([...historico, { de: 'paciente', texto: '', pendente: true }]);
    setTexto(''); setAguardando(true); setAviso('');
    const turnos = [];
    for (const m of historico) {
      if (m.de === 'aluno') turnos.push({ role: 'user', content: m.texto });
      else if (m.de === 'paciente') turnos.push({ role: 'assistant', content: m.texto });
    }
    if (turnos[0]?.role === 'assistant') turnos.unshift({ role: 'user', content: 'Bom dia, pode entrar. O que traz o(a) senhor(a) aqui?' });
    const ctl = new AbortController();
    controle.current = ctl;
    try {
      const { text } = await sample(turnos, {
        sistema: sistemaPaciente(caso), modelTier: 'quick', cache: false, signal: ctl.signal,
        onText: ({ text: parcial }) => setMensagens([...historico, { de: 'paciente', texto: parcial, pendente: true }]),
      });
      setMensagens([...historico, { de: 'paciente', texto: text.trim() }]);
    } catch (e) {
      if (e?.code === 'cancelled') return;
      setMensagens(historico);
      setAviso(erroIa(e));
    } finally {
      setAguardando(false);
    }
  };

  const examinar = (k, rotulo) => {
    if (vistos[k]) return;
    setVistos({ ...vistos, [k]: true });
    const achado = k === 'vitais'
      ? Object.entries(caso.sinaisVitais || {}).filter(([, v]) => v !== '' && v != null).map(([n, v]) => `${n}: ${v}`).join(' · ')
      : caso.exameFisico?.[k] || t('Sem alterações.');
    setMensagens((ms) => [...ms, { de: 'aluno', texto: t('Examina: {s}', { s: t(rotulo) }) }, { de: 'exame', texto: achado }]);
  };

  const pedirExames = async () => {
    const lista = pedido.trim();
    if (!lista || aguardando) return;
    setPedido(''); setAviso('');
    const quer = normalizar(lista);
    const pedeEcg = /\b(ecg|eletro)/.test(quer);
    const semEcg = lista.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s && !/^(ecg|eletro)/i.test(normalizar(s)));
    const base = [...mensagens, { de: 'aluno', texto: t('Solicita: {s}', { s: lista }) }];
    if (pedeEcg) { setEcgAberto(true); base.push({ de: 'exame', texto: t('ECG de 12 derivações realizado: veja o traçado abaixo e escreva o seu laudo.') }); }
    if (!semEcg.length) { setMensagens(base); return; }
    setMensagens([...base, { de: 'exame', texto: t('Coletando e processando…'), pendente: true }]);
    setAguardando(true);
    try {
      const r = await sample.json([
        'Você é o laboratório e o serviço de imagem de um caso clínico simulado. Devolva os resultados dos exames pedidos.',
        `Caso (secreto): diagnóstico ${caso.diagnostico}. Exames já definidos: ${JSON.stringify(caso.exames || [])}. Sinais vitais: ${JSON.stringify(caso.sinaisVitais || {})}.`,
        'Use os resultados já definidos quando o exame pedido for o mesmo. Para outros, crie resultados coerentes com o caso (normais quando não tiverem relação), com valores, unidades e valores de referência. Laudos de imagem em linguagem de radiologista.',
        'Não diga o diagnóstico. Não comente o resultado. Não inclua exames que não foram pedidos.',
        `Escreva em ${lingua()}. Responda só com JSON: {"resultados":[{"nome":"...","resultado":"..."}]}`,
        `EXAMES PEDIDOS: ${semEcg.join('; ')}`,
      ].join('\n'), { modelTier: 'quick', cache: false });
      const itens = Array.isArray(r?.resultados) ? r.resultados : [];
      setMensagens([...base, ...itens.map((x) => ({ de: 'exame', texto: `${x.nome}: ${x.resultado}` }))]);
    } catch (e) {
      setMensagens(base);
      setAviso(erroIa(e));
    } finally {
      setAguardando(false);
    }
  };

  const podeEncerrar = resposta.hipotese.trim().length > 2;

  return (
    <div className="sim-atendimento">
      <header className="sim-caso-topo cartao">
        <div>
          <span className="sobretitulo">{t(caso.area)} · {caso.cenario}</span>
          <h2>{caso.titulo}</h2>
          <p className="mudo">{caso.paciente?.nome}, {caso.paciente?.idade} {t('anos')}{caso.paciente?.ocupacao ? `, ${caso.paciente.ocupacao}` : ''}</p>
        </div>
        <button className="botao" onClick={() => encerrar(null)}>{t('Sair do caso')}</button>
      </header>

      <div className="consulta-corpo">
        <section className="conversa" aria-label={t('Consulta')}>
          <ol className="mensagens" aria-live="polite">
            {mensagens.map((m, i) => (
              <li key={i} className={`mensagem mensagem-${m.de === 'aluno' ? 'candidato' : m.de === 'exame' ? 'examinador' : 'paciente'}`}>
                <span className="mensagem-quem">{m.de === 'aluno' ? t('Você') : m.de === 'exame' ? t('Exame') : caso.paciente?.nome?.split(' ')[0] || t('Paciente')}</span>
                <span className="mensagem-texto">{m.texto || '…'}</span>
              </li>
            ))}
            <li ref={fim} aria-hidden="true" />
          </ol>
          {aviso && <p className="erro-texto" role="alert">{aviso}</p>}
          <form className="enviar" onSubmit={(e) => { e.preventDefault(); falar(texto); }}>
            <label htmlFor="fala-sim" className="visualmente-oculto">{t('Sua pergunta ao paciente')}</label>
            <textarea id="fala-sim" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={800}
              placeholder={t('Pergunte ao paciente: início, características, antecedentes, medicações…')}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); falar(texto); } }} />
            <div className="linha-botoes"><button className="botao botao-primario" disabled={aguardando || !texto.trim()}>{t('Perguntar')}</button></div>
          </form>
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
                <button className="chip" disabled={vistos.vitais} onClick={() => examinar('vitais', 'Sinais vitais')}>{t('Sinais vitais')}</button>
                {SISTEMAS.map(([k, r]) => <button key={k} className="chip" disabled={vistos[k]} onClick={() => examinar(k, r)}>{t(r)}</button>)}
              </div>
            </div>
          )}
          {aba === 'exames' && (
            <div className="cartao sim-painel">
              <form onSubmit={(e) => { e.preventDefault(); pedirExames(); }} className="enviar">
                <label className="campo">
                  <span>{t('Quais exames você pede?')}</span>
                  <textarea rows={2} value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={400} placeholder={t('Ex.: hemograma, troponina, ECG')} />
                </label>
                <button className="botao botao-primario" disabled={aguardando || !pedido.trim()}>{t('Solicitar')}</button>
              </form>
              <div className="chips">
                {['ECG', ...SUGESTOES_EXAMES].map((s) => (
                  <button key={s} className="chip" onClick={() => setPedido((p) => (p ? `${p}, ${t(s)}` : t(s)))}>{t(s)}</button>
                ))}
              </div>
            </div>
          )}
          {aba === 'conduta' && (
            <div className="cartao sim-painel conclusao">
              <label className="campo"><span>{t('Hipótese diagnóstica')}</span>
                <textarea rows={2} value={resposta.hipotese} onChange={(e) => setResposta({ ...resposta, hipotese: e.target.value })} maxLength={600} /></label>
              {ecgAberto && <label className="campo"><span>{t('Seu laudo do ECG')}</span>
                <textarea rows={2} value={resposta.ecg} onChange={(e) => setResposta({ ...resposta, ecg: e.target.value })} maxLength={600} /></label>}
              <label className="campo"><span>{t('Conduta')}</span>
                <textarea rows={3} value={resposta.conduta} onChange={(e) => setResposta({ ...resposta, conduta: e.target.value })} maxLength={1500}
                  placeholder={t('Internação, medidas iniciais, encaminhamento, orientações…')} /></label>
              <label className="campo"><span>{t('Prescrição')}</span>
                <textarea rows={4} value={resposta.prescricao} onChange={(e) => setResposta({ ...resposta, prescricao: e.target.value })} maxLength={2000}
                  placeholder={t('1. Medicamento, dose, via, frequência; 2. …')} /></label>
              <button className="botao botao-primario" disabled={!podeEncerrar || aguardando} onClick={() => encerrar({ mensagens, resposta, ecgAberto })}>
                {t('Encerrar e ver correção')}
              </button>
            </div>
          )}
        </aside>
      </div>
      {ecgAberto && (
        <section className="cartao sim-ecg">
          <span className="sobretitulo">{t('Eletrocardiograma')}</span>
          <Ecg chave={caso.ecg} fc={fc} semente={caso.titulo?.length || 7} />
        </section>
      )}
    </div>
  );
}

function Correcao({ caso, registro, sample, novoCaso }) {
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const [chat, setChat] = useState([]);
  const [texto, setTexto] = useState('');
  const [aguardando, setAguardando] = useState(false);
  const { despachar } = useApp();

  const corrigir = async () => {
    setErro('');
    try {
      const res = await sample.json([
        'Você é preceptor de um curso preparatório para ENAMED/Revalida. Corrija o atendimento do aluno no caso simulado abaixo, com rigor e de forma didática.',
        `CASO (gabarito): ${JSON.stringify({ diagnostico: caso.diagnostico, diferenciais: caso.diferenciais, condutaEsperada: caso.condutaEsperada, prescricaoModelo: caso.prescricaoModelo, pontosChave: caso.pontosChave, ecg: ECGS[caso.ecg]?.laudo, historia: caso.historia })}`,
        `REGISTRO DO ATENDIMENTO:\n${conversaParaTexto(registro.mensagens)}`,
        `HIPÓTESE DO ALUNO: ${registro.resposta.hipotese}`,
        registro.ecgAberto ? `LAUDO DE ECG DO ALUNO: ${registro.resposta.ecg || '(não escreveu)'}` : 'O aluno não pediu ECG.',
        `CONDUTA DO ALUNO: ${registro.resposta.conduta || '(não escreveu)'}`,
        `PRESCRIÇÃO DO ALUNO: ${registro.resposta.prescricao || '(não escreveu)'}`,
        'Avalie: anamnese (perguntas essenciais feitas ou esquecidas), exame físico, exames (pertinentes, desnecessários, faltantes), diagnóstico, ECG (se pedido), conduta e prescrição (doses, vias, erros perigosos).',
        `Escreva em ${lingua()}, frases curtas. Nota de 0 a 10 com uma casa decimal.`,
        'Responda só com JSON: {"nota":7.5,"resumo":"até 50 palavras","partes":[{"nome":"Anamnese","nota":8,"comentario":"...","faltou":["..."]},{"nome":"Exame físico",...},{"nome":"Exames",...},{"nome":"Diagnóstico",...},{"nome":"Conduta",...},{"nome":"Prescrição",...}],"errosPerigosos":["..."],"respostaModelo":{"diagnostico":"...","conduta":"...","prescricao":"..."},"dica":"uma dica de prova sobre o tema"}',
      ].join('\n'), { modelTier: 'default', cache: false });
      if (typeof res?.nota !== 'number') throw Object.assign(new Error(), { code: 'invalid_json' });
      setR(res);
      despachar({ tipo: 'simulacaoClinica', registro: { em: Date.now(), area: caso.area, diagnostico: caso.diagnostico, nota: res.nota } });
    } catch (e) {
      setErro(erroIa(e));
    }
  };
  useEffect(() => { corrigir(); }, []);

  const perguntar = async (e) => {
    e.preventDefault();
    const fala = texto.trim();
    if (!fala || aguardando) return;
    const hist = [...chat, { role: 'user', content: fala }];
    setChat([...hist, { role: 'assistant', content: '' }]); setTexto(''); setAguardando(true);
    try {
      const { text } = await sample(hist, {
        sistema: [
          'Você é o preceptor que acabou de corrigir este caso. Discuta com o aluno: tire dúvidas, explique fisiopatologia, diagnóstico diferencial, condutas e como o tema cai nas provas do Inep. Seja direto e didático, até 150 palavras por resposta.',
          `Caso: ${JSON.stringify(caso)}`, `Correção: ${JSON.stringify(r)}`, `Fale em ${lingua()}.`,
        ].join('\n'),
        modelTier: 'quick', cache: false,
        onText: ({ text: p }) => setChat([...hist, { role: 'assistant', content: p }]),
      });
      setChat([...hist, { role: 'assistant', content: text.trim() }]);
    } catch (err) {
      setChat(hist.slice(0, -1));
      setErro(erroIa(err));
    } finally {
      setAguardando(false);
    }
  };

  if (!r) {
    return (
      <section className="cartao sim-config">
        <h2>{t('Corrigindo o seu atendimento…')}</h2>
        {erro ? <><p className="erro-texto">{erro}</p><button className="botao" onClick={corrigir}>{t('Tentar de novo')}</button></>
          : <p className="mudo">{t('O preceptor está lendo a consulta, os exames, a conduta e a prescrição.')}</p>}
      </section>
    );
  }
  return (
    <div className="sim-correcao">
      <section className="destaque sim-nota">
        <div>
          <span className="sobretitulo">{t('Resultado do caso')}</span>
          <h2>{caso.diagnostico}</h2>
          <p>{r.resumo}</p>
        </div>
        <strong className="sim-nota-valor">{Number(r.nota).toFixed(1)}<small>/10</small></strong>
      </section>
      {r.errosPerigosos?.filter(Boolean).length > 0 && (
        <section className="cartao sim-alerta">
          <h3><Icone nome="x" /> {t('Erros que custariam caro')}</h3>
          <ul>{r.errosPerigosos.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      <ul className="sim-partes">
        {(r.partes || []).map((p) => (
          <li key={p.nome} className="cartao">
            <div className="sim-parte-topo"><strong>{p.nome}</strong><span className="sim-parte-nota">{p.nota}/10</span></div>
            <p>{p.comentario}</p>
            {p.faltou?.filter(Boolean).length > 0 && <p className="mudo pequeno">{t('Faltou')}: {p.faltou.filter(Boolean).join(' · ')}</p>}
          </li>
        ))}
      </ul>
      <section className="cartao">
        <h3>{t('Resposta-modelo')}</h3>
        <dl className="sim-modelo">
          <dt>{t('Diagnóstico')}</dt><dd>{r.respostaModelo?.diagnostico || caso.diagnostico}</dd>
          <dt>{t('Conduta')}</dt><dd>{r.respostaModelo?.conduta || caso.condutaEsperada?.join(' ')}</dd>
          <dt>{t('Prescrição')}</dt><dd className="pre">{r.respostaModelo?.prescricao || caso.prescricaoModelo}</dd>
          {registro.ecgAberto && <><dt>{t('ECG')}</dt><dd>{ECGS[caso.ecg]?.laudo}</dd></>}
        </dl>
        {r.dica && <p className="sim-dica"><Icone nome="alvo" /> {r.dica}</p>}
      </section>
      <section className="conversa">
        <h3>{t('Discuta o caso com o preceptor')}</h3>
        {chat.length > 0 && (
          <ol className="mensagens">
            {chat.map((m, i) => (
              <li key={i} className={`mensagem mensagem-${m.role === 'user' ? 'candidato' : 'paciente'}`}>
                <span className="mensagem-quem">{m.role === 'user' ? t('Você') : t('Preceptor')}</span>
                <span className="mensagem-texto">{m.content || '…'}</span>
              </li>
            ))}
          </ol>
        )}
        <form className="enviar" onSubmit={perguntar}>
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={800} aria-label={t('Pergunta ao preceptor')}
            placeholder={t('Ex.: por que não trombolisar aqui? Como isso cai na prova?')} />
          <div className="linha-botoes">
            <button className="botao" type="button" onClick={novoCaso}>{t('Novo caso')}</button>
            <button className="botao botao-primario" disabled={aguardando || !texto.trim()}>{t('Perguntar')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CasoClinico({ sample }) {
  const [caso, setCaso] = useState(null);
  const [registro, setRegistro] = useState(null);
  const novo = () => { setCaso(null); setRegistro(null); };
  if (caso && registro) return <Correcao caso={caso} registro={registro} sample={sample} novoCaso={novo} />;
  if (caso) return <Atendimento caso={caso} sample={sample} encerrar={(reg) => (reg ? setRegistro(reg) : novo())} />;
  return (
    <>
      <AvisoSemIa sample={sample} />
      <ConfigCaso sample={sample} iniciar={setCaso} />
      <ul className="sim-passos">
        {[['pessoas', 'Converse com o paciente', 'Faça a anamnese como no plantão: o paciente responde só ao que você pergunta.'],
          ['alvo', 'Examine e peça exames', 'Exame físico por sistema, laboratório, imagem e ECG com traçado real para laudar.'],
          ['livro', 'Conduta e prescrição', 'Escreva o diagnóstico, a conduta e a prescrição com dose, via e frequência.'],
          ['estrela', 'Correção e discussão', 'Nota por etapa, erros perigosos, resposta-modelo e um preceptor para tirar dúvidas.']].map(([i, ti, tx]) => (
          <li key={ti} className="cartao"><Icone nome={i} tamanho={22} /><strong>{t(ti)}</strong><span className="mudo">{t(tx)}</span></li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------------ ECG */

function TreinoEcg({ sample }) {
  const [rodada, setRodada] = useState(() => ({ chave: sorteio(CHAVES_ECG), semente: Math.floor(Math.random() * 9999) }));
  const [escolha, setEscolha] = useState(null);
  const [laudo, setLaudo] = useState('');
  const [ia, setIa] = useState({ estado: '', texto: '' });
  const [placar, setPlacar] = useState({ certos: 0, total: 0 });
  const e = ECGS[rodada.chave];
  const opcoes = useMemo(() => embaralhar([rodada.chave, ...embaralhar(CHAVES_ECG.filter((k) => k !== rodada.chave)).slice(0, 3)]), [rodada]);

  const responder = (k) => {
    if (escolha) return;
    setEscolha(k);
    setPlacar((p) => ({ certos: p.certos + (k === rodada.chave ? 1 : 0), total: p.total + 1 }));
  };
  const proximo = () => {
    let chave = sorteio(CHAVES_ECG);
    if (chave === rodada.chave) chave = sorteio(CHAVES_ECG);
    setRodada({ chave, semente: Math.floor(Math.random() * 9999) });
    setEscolha(null); setLaudo(''); setIa({ estado: '', texto: '' });
  };
  const corrigirLaudo = async () => {
    setIa({ estado: 'carregando', texto: '' });
    try {
      const { text } = await sample([
        'Você é cardiologista e professor. Corrija o laudo de ECG escrito por um aluno de medicina.',
        `Diagnóstico do traçado: ${e.nome}. Achados esperados: ${e.achados.join('; ')}. Laudo-modelo: ${e.laudo}`,
        `LAUDO DO ALUNO: ${laudo}`,
        `Em até 90 palavras, em ${lingua()}: o que ele acertou, o que faltou (ritmo, FC, PR, QRS, eixo, ST-T) e a conduta ligada a esse achado.`,
      ].join('\n'), { modelTier: 'quick', cache: false, onText: ({ text: p }) => setIa({ estado: 'carregando', texto: p }) });
      setIa({ estado: 'ok', texto: text.trim() });
    } catch (err) {
      setIa({ estado: 'erro', texto: erroIa(err) });
    }
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
                <button className={`alternativa-botao${escolha ? (k === rodada.chave ? ' certa' : k === escolha ? ' errada' : '') : ''}`} disabled={!!escolha} onClick={() => responder(k)}>
                  {t(ECGS[k].nome)}
                </button>
              </li>
            ))}
          </ul>
          <label className="campo">
            <span>{t('Escreva o laudo (opcional): ritmo, FC, PR, QRS, eixo, ST-T')}</span>
            <textarea rows={3} value={laudo} onChange={(ev) => setLaudo(ev.target.value)} maxLength={800} />
          </label>
          <div className="linha-botoes">
            {sample && <button className="botao" disabled={laudo.trim().length < 10 || ia.estado === 'carregando'} onClick={corrigirLaudo}>{t('Corrigir laudo com IA')}</button>}
            <button className="botao botao-primario" onClick={proximo}>{t('Próximo ECG')} <Icone nome="direita" /></button>
          </div>
          {ia.texto && <p className={ia.estado === 'erro' ? 'erro-texto' : 'sim-ia-texto'}>{ia.texto}</p>}
        </section>
        {escolha && (
          <section className="cartao sim-gabarito">
            <h3>{escolha === rodada.chave ? t('Acertou!') : t('Resposta: {r}', { r: t(e.nome) })}</h3>
            <ul>{e.achados.map((a) => <li key={a}>{t(a)}</li>)}</ul>
            <p><strong>{t('Laudo')}:</strong> {t(e.laudo)}</p>
          </section>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- busca */

function BuscaMedica({ sample }) {
  const { banco, setFiltro, ir } = useApp();
  const [termo, setTermo] = useState('');
  const [consulta, setConsulta] = useState('');
  const [resumo, setResumo] = useState({ estado: '', dados: null, erro: '' });
  const [quiz, setQuiz] = useState({ estado: '', itens: [], respostas: {} });

  const doBanco = useMemo(() => {
    const n = normalizar(consulta);
    return n.length > 2 ? banco.questoes.filter((q) => !q.anulada && q.busca.includes(n)) : [];
  }, [consulta, banco]);

  const buscar = async (ev) => {
    ev.preventDefault();
    const q = termo.trim();
    if (q.length < 3) return;
    setConsulta(q); setQuiz({ estado: '', itens: [], respostas: {} });
    if (!sample) return;
    setResumo({ estado: 'carregando', dados: null, erro: '' });
    try {
      const d = await sample.json([
        'Você é professor de um curso preparatório para ENAMED e Revalida. Faça um resumo de estudo do tema pedido, focado no que cai nas provas do Inep e em protocolos do Ministério da Saúde.',
        `Escreva em ${lingua()}, em tópicos curtos e objetivos. Se o tema não for de medicina, responda {"foraDoTema":true}.`,
        'Responda só com JSON: {"titulo":"...","definicao":"...","secoes":[{"nome":"Quadro clínico","itens":["..."]},{"nome":"Diagnóstico","itens":["..."]},{"nome":"Tratamento","itens":["..."]}],"pegadinhas":["..."],"comoCai":"como o tema costuma ser cobrado"}',
        `TEMA: ${q}`,
      ].join('\n'), { modelTier: 'default', cache: true });
      if (d?.foraDoTema) throw Object.assign(new Error(), { code: 'fora' });
      setResumo({ estado: 'ok', dados: d, erro: '' });
    } catch (e) {
      setResumo({ estado: 'erro', dados: null, erro: e?.code === 'fora' ? t('A busca é só para temas de medicina.') : erroIa(e) });
    }
  };

  const gerarQuiz = async () => {
    setQuiz({ estado: 'carregando', itens: [], respostas: {} });
    try {
      const d = await sample.json([
        'Crie 5 questões de múltipla escolha no estilo ENAMED/Revalida (Inep) sobre o tema, com caso clínico curto, 4 alternativas (A a D) e uma única correta.',
        `Escreva em ${lingua()}. Varie: diagnóstico, conduta, exame e prevenção.`,
        'Responda só com JSON: {"questoes":[{"enunciado":"...","alternativas":["...","...","...","..."],"gabarito":"A","comentario":"até 40 palavras"}]}',
        `TEMA: ${consulta}`,
      ].join('\n'), { modelTier: 'default', cache: false });
      const itens = (d?.questoes || []).filter((q) => q?.enunciado && Array.isArray(q.alternativas) && q.alternativas.length >= 4);
      if (!itens.length) throw Object.assign(new Error(), { code: 'invalid_json' });
      setQuiz({ estado: 'ok', itens, respostas: {} });
    } catch (e) {
      setQuiz({ estado: 'erro', itens: [], respostas: {}, erro: erroIa(e) });
    }
  };

  const treinarBanco = () => { setFiltro({ ...FILTRO_INICIAL, busca: consulta }); ir('questoes'); };
  const letras = ['A', 'B', 'C', 'D', 'E'];

  return (
    <div className="sim-busca">
      <form className="cartao sim-busca-form" role="search" onSubmit={buscar}>
        <Icone nome="lupa" />
        <input value={termo} onChange={(ev) => setTermo(ev.target.value)} placeholder={t('Busque qualquer tema: cetoacidose, sífilis congênita, apendicite…')}
          aria-label={t('Tema médico')} maxLength={120} />
        <button className="botao botao-primario" disabled={termo.trim().length < 3}>{t('Buscar')}</button>
      </form>
      <AvisoSemIa sample={sample} />
      {consulta && (
        <section className="cartao sim-banco">
          <div>
            <strong>{t('{n} questões oficiais sobre "{q}" no banco', { n: doBanco.length, q: consulta })}</strong>
            <span className="mudo pequeno">{t('Provas anteriores do Inep, com comentário.')}</span>
          </div>
          <div className="linha-botoes">
            {doBanco.length > 0 && <button className="botao" onClick={treinarBanco}>{t('Treinar no banco')}</button>}
            {sample && <button className="botao botao-primario" onClick={gerarQuiz} disabled={quiz.estado === 'carregando'}>
              {quiz.estado === 'carregando' ? t('Gerando questões…') : t('Simular 5 questões novas')}</button>}
          </div>
        </section>
      )}
      {resumo.estado === 'carregando' && <section className="cartao"><p className="mudo">{t('Montando o resumo…')}</p></section>}
      {resumo.estado === 'erro' && <p className="erro-texto">{resumo.erro}</p>}
      {resumo.dados && (
        <article className="cartao sim-resumo">
          <span className="sobretitulo">{t('Resumo de estudo')}</span>
          <h2>{resumo.dados.titulo}</h2>
          {resumo.dados.definicao && <p>{resumo.dados.definicao}</p>}
          {(resumo.dados.secoes || []).map((s) => (
            <section key={s.nome}>
              <h3>{s.nome}</h3>
              <ul>{(s.itens || []).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </section>
          ))}
          {resumo.dados.pegadinhas?.length > 0 && (
            <section className="sim-pegadinhas"><h3>{t('Pegadinhas de prova')}</h3><ul>{resumo.dados.pegadinhas.map((x, i) => <li key={i}>{x}</li>)}</ul></section>
          )}
          {resumo.dados.comoCai && <p className="sim-dica"><Icone nome="alvo" /> {resumo.dados.comoCai}</p>}
          <p className="mudo pequeno">{t('Resumo gerado por IA para estudo. Confira doses e condutas nos protocolos oficiais.')}</p>
        </article>
      )}
      {quiz.estado === 'erro' && <p className="erro-texto">{quiz.erro}</p>}
      {quiz.itens.length > 0 && (
        <ol className="sim-quiz">
          {quiz.itens.map((q, i) => {
            const r = quiz.respostas[i];
            return (
              <li key={i} className="cartao">
                <p className="sim-quiz-enunciado"><strong>{i + 1}.</strong> {q.enunciado}</p>
                <ul className="sim-opcoes">
                  {q.alternativas.slice(0, 5).map((a, j) => {
                    const l = letras[j];
                    const classe = r ? (l === q.gabarito ? ' certa' : l === r ? ' errada' : '') : '';
                    return (
                      <li key={l}>
                        <button className={`alternativa-botao${classe}`} disabled={!!r}
                          onClick={() => setQuiz({ ...quiz, respostas: { ...quiz.respostas, [i]: l } })}>
                          <b>{l})</b> {a}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {r && <p className="sim-ia-texto"><strong>{r === q.gabarito ? t('Correto.') : t('Gabarito: {g}.', { g: q.gabarito })}</strong> {q.comentario}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- tela */

// A função do visualizador (claude.ai) não recebe `sistema`: as instruções vão no primeiro turno.
function comSistema(base) {
  if (!base || base.servidor) return base;
  const juntar = (entrada, opts = {}) => {
    if (!opts.sistema) return entrada;
    const turnos = typeof entrada === 'string' ? [{ role: 'user', content: entrada }] : entrada;
    return [{ role: 'user', content: `${opts.sistema}\n\n${turnos[0].content}` }, ...turnos.slice(1)];
  };
  const f = (entrada, opts = {}) => base(juntar(entrada, opts), opts);
  f.json = (entrada, opts = {}) => base.json(juntar(entrada, opts), opts);
  return f;
}

export default function Simulador() {
  const bruto = useSample();
  const sample = useMemo(() => comSistema(bruto), [bruto]);
  const [aba, setAba] = useState('caso');
  return (
    <div className="tela-simulador">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Simulador clínico com IA')}</span>
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
      {aba === 'caso' && <CasoClinico sample={sample} />}
      {aba === 'ecg' && <TreinoEcg sample={sample} />}
      {aba === 'busca' && <BuscaMedica sample={sample} />}
    </div>
  );
}
