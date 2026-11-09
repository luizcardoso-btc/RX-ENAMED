// Cronograma semanal: a semana do aluno, dia a dia, com aulas, questões, revisões, flashcards e o simulado de revisão.
// Diferente de um calendário fixo, ele se refaz com o desempenho: aulas da área mais fraca primeiro, revisões no dia
// em que vencem, o atraso de ontem volta hoje e tudo cabe no tempo que o aluno disse ter.
import { useState, useMemo } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { montarSemana, configDoAluno, CONFIG_PADRAO, OBJETIVOS, rotaQuartoAno } from '../cronograma.js';
import { modulosDoCurso } from '../modulos.js';
import { diasAte } from '../trilha.js';
import { useTrilha, iniciarPlano } from './Trilha.jsx';
import { DIA, plural } from '../util.js';
import { t, idiomaAtual } from '../i18n.js';

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS = { feito: 'Feito', andamento: 'Em andamento', pendente: 'A fazer', atrasado: 'Atrasado' };
const TIPO = {
  questoes: { rotulo: 'Desafio diário', icone: 'alvo' },
  revisao: { rotulo: 'Revisão espaçada', icone: 'repetir' },
  aula: { rotulo: 'Aula', icone: 'livro' },
  flashcards: { rotulo: 'Flashcards', icone: 'cartas' },
  simulado: { rotulo: 'Simulado de revisão', icone: 'relogio' },
};
const local = () => (idiomaAtual() === 'es' ? 'es' : 'pt-BR');
const dataCurta = (ts) => new Date(ts).toLocaleDateString(local(), { day: '2-digit', month: '2-digit' });
const duracao = (min) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min} min`);

function Chamas({ n }) {
  const rotulo = t(['', 'Incidência baixa na prova', 'Incidência média na prova', 'Incidência alta na prova'][n]);
  return (
    <span className="chamas" title={rotulo} aria-label={rotulo}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'acesa' : ''}><Icone nome="chama" tamanho={13} /></span>)}
    </span>
  );
}

function Atividade({ a, abrir }) {
  const tipo = TIPO[a.tipo];
  let titulo = t(tipo.rotulo);
  let detalhe = duracao(a.minutos);
  if (a.tipo === 'aula') { titulo = idiomaAtual() === 'es' && a.tituloEs ? a.tituloEs : a.titulo; detalhe = `${t(a.detalhe)} · ${duracao(a.minutos)}`; }
  if (a.tipo === 'questoes') detalhe = `${t('{f} de {n}', { f: a.feito, n: a.alvo })} · ${duracao(a.minutos)}`;
  if (a.tipo === 'revisao') detalhe = `${plural(a.alvo, 'questão vencendo', 'questões vencendo')} · ${duracao(a.minutos)}`;
  if (a.tipo === 'flashcards') detalhe = `${plural(a.alvo, 'cartão', 'cartões')} · ${duracao(a.minutos)}`;
  if (a.tipo === 'simulado') detalhe = `${t('{n} questões', { n: a.alvo })} · ${duracao(a.minutos)}`;
  const progresso = a.alvo ? Math.min(1, (a.feito || 0) / a.alvo) : a.status === 'feito' ? 1 : 0;
  return (
    <button className={`atividade atividade-${a.status}`} onClick={() => abrir(a)}>
      <span className="atividade-tipo"><Icone nome={tipo.icone} tamanho={14} /> {a.tipo === 'aula' ? t('Aula') : t(tipo.rotulo)}</span>
      {a.tipo === 'aula' && <strong className="atividade-titulo">{titulo}</strong>}
      <span className="atividade-detalhe">{detalhe}</span>
      {a.atraso > 0 && <span className="atividade-nota">{t('inclui {n} de dias anteriores', { n: a.atraso })}</span>}
      {a.tipo === 'simulado' && a.especialidades?.length > 0 && <span className="atividade-nota">{t('Foco: {e}', { e: a.especialidades.map((e) => t(e)).join(', ') })}</span>}
      {a.alvo > 1 && a.status !== 'feito' && <span className="mini-barra"><span style={{ width: `${progresso * 100}%` }} /></span>}
      <span className="atividade-rodape">
        <span className={`chip-status chip-${a.status}`}>{a.status === 'feito' && <Icone nome="check" tamanho={12} />} {t(STATUS[a.status])}</span>
        {a.chamas && <Chamas n={a.chamas} />}
      </span>
    </button>
  );
}

function Configurar({ fechar }) {
  const { progresso, despachar } = useApp();
  const cfg = configDoAluno(progresso.trilha);
  const [dias, setDias] = useState(cfg.diasEstudo);
  const [minutos, setMinutos] = useState(cfg.minutosDia);
  const [metaAcerto, setMetaAcerto] = useState(cfg.metaAcerto);
  const [metaDiaria, setMetaDiaria] = useState(progresso.trilha.metaDiaria || 20);
  const [dataProva, setDataProva] = useState(progresso.trilha.dataProva || '');
  const [objetivo, setObjetivo] = useState(progresso.trilha.objetivo || 'enamed6');
  const escolherObjetivo = (o) => {
    setObjetivo(o);
    const r = OBJETIVOS[o].ritmo;
    if (r) { setDias(r.diasEstudo); setMinutos(r.minutosDia); setMetaDiaria(r.metaDiaria); setMetaAcerto(r.metaAcerto); }
  };
  const alternar = (d) => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()));
  const salvar = () => {
    despachar({ tipo: 'configurarTrilha', dados: {
      cronograma: { ...(progresso.trilha.cronograma || {}), diasEstudo: dias.length ? dias : CONFIG_PADRAO.diasEstudo, minutosDia: minutos, metaAcerto, desde: progresso.trilha.cronograma?.desde || Date.now() },
      metaDiaria, dataProva, objetivo, ...(metaDiaria !== progresso.trilha.metaDiaria ? { plano: null } : {}),
    } });
    fechar();
  };
  return (
    <div className="sobreposicao" role="presentation">
      <div className="dialogo config-estudos" role="dialog" aria-modal="true" aria-labelledby="titulo-config">
        <h2 id="titulo-config">{t('Configurar estudos')}</h2>
        <p className="mudo">{t('O cronograma se ajusta a estes números: nada passa do tempo que você tem por dia.')}</p>
        <div className="campo">
          <span className="rotulo-campo">{t('Seu objetivo')}</span>
          <div className="segmentado" role="group" aria-label={t('Seu objetivo')}>
            {Object.entries(OBJETIVOS).map(([k, o]) => <button key={k} className={objetivo === k ? 'ativo' : ''} aria-pressed={objetivo === k} onClick={() => escolherObjetivo(k)}>{t(o.nome)}</button>)}
          </div>
          {objetivo === 'enamed4' && <p className="mudo pequeno">{t('Ritmo sugerido para o 4º ano: 4 dias por semana, 1 hora por dia. A prova do 4º ano é formativa; a do 6º ano é a que conta para o CRM e para o Enare.')}</p>}
        </div>
        <div className="campo">
          <span className="rotulo-campo">{t('Dias de estudo')}</span>
          <div className="segmentado dias-semana" role="group" aria-label={t('Dias de estudo')}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} className={dias.includes(d) ? 'ativo' : ''} aria-pressed={dias.includes(d)} onClick={() => alternar(d)}>{t(DIAS_CURTOS[d])}</button>
            ))}
          </div>
        </div>
        <div className="campo">
          <span className="rotulo-campo">{t('Tempo por dia')}</span>
          <div className="segmentado" role="group" aria-label={t('Tempo por dia')}>
            {[60, 90, 120, 180, 240, 360].map((m) => <button key={m} className={minutos === m ? 'ativo' : ''} aria-pressed={minutos === m} onClick={() => setMinutos(m)}>{duracao(m)}</button>)}
          </div>
        </div>
        <div className="campo">
          <span className="rotulo-campo">{t('Questões por dia')}</span>
          <div className="segmentado" role="group" aria-label={t('Questões por dia')}>
            {[10, 20, 30, 40, 60, 80].map((n) => <button key={n} className={metaDiaria === n ? 'ativo' : ''} aria-pressed={metaDiaria === n} onClick={() => setMetaDiaria(n)}>{n}</button>)}
          </div>
        </div>
        <div className="campo">
          <span className="rotulo-campo">{t('Meta de acerto')}</span>
          <div className="segmentado" role="group" aria-label={t('Meta de acerto')}>
            {[55, 60, 65, 70, 75, 80].map((n) => <button key={n} className={metaAcerto === n ? 'ativo' : ''} aria-pressed={metaAcerto === n} onClick={() => setMetaAcerto(n)}>{n}%</button>)}
          </div>
        </div>
        <label className="campo">
          <span className="rotulo-campo">{t('Data da sua prova')}</span>
          <input id="config-data-prova" type="date" value={dataProva} onChange={(e) => setDataProva(e.target.value)} />
        </label>
        <div className="linha-botoes">
          <button className="botao botao-primario" onClick={salvar}>{t('Salvar')}</button>
          <button className="botao" onClick={fechar}>{t('Cancelar')}</button>
        </div>
      </div>
    </div>
  );
}

export default function Cronograma() {
  const { banco, progresso, ir, iniciarSessao, setCursoVista, acesso } = useApp();
  const metaDia = acesso.completo ? null : Math.min(acesso.limites.questoesDia, 25);
  const { profs, plano, feitas } = useTrilha();
  const [deslocamento, setDeslocamento] = useState(null);
  const [config, setConfig] = useState(false);
  const atual = useMemo(() => montarSemana(progresso, banco, profs, Date.now(), Date.now(), metaDia), [progresso, banco, profs, metaDia]);
  // Sem nada a fazer desta semana em diante (ex.: domingo livre), abre direto a próxima.
  const restaHoje = atual.dias.some((d) => (d.hoje || !d.passado) && d.atividades.some((a) => a.status !== 'feito'));
  const semana = deslocamento ?? (restaHoje ? 0 : 1);
  const s = useMemo(() => (semana === 0 ? atual : montarSemana(progresso, banco, profs, Date.now() + semana * 7 * DIA, Date.now(), metaDia)), [semana, atual, progresso, banco, profs]);
  const dias = diasAte(progresso.trilha.dataProva);
  const hoje = s.dias.find((d) => d.hoje);

  const abrir = (a) => {
    if (a.tipo === 'questoes') return a.status === 'atrasado' || !plano ? ir('desafio') : iniciarPlano(iniciarSessao, plano, feitas);
    if (a.tipo === 'revisao') return ir('revisao');
    if (a.tipo === 'flashcards') return ir('flashcards');
    if (a.tipo === 'simulado') return ir('simulado');
    if (a.tipo === 'aula') { setCursoVista({ modulo: a.modulo, aula: a.aulaId }); return ir('curso'); }
    return ir('trilha');
  };

  return (
    <div className="tela-cronograma">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Cronograma')}</span>
          <h1>{t('Sua semana de estudos')}</h1>
          <p className="mudo">{t('Montado com o seu desempenho: a área mais fraca primeiro, revisões no dia certo e o que ficou para trás volta hoje.')}</p>
        </div>
        <button className="botao" onClick={() => setConfig(true)}><Icone nome="ajustes" /> {t('Configurar estudos')}</button>
      </header>

      {progresso.trilha.objetivo === 'enamed4' && <RotaQuartoAno />}

      <section className="resumo-semana">
        <div className="cartao">
          <span className="sobretitulo">{t('Esta semana')}</span>
          <strong className="numero-grande">{s.resumo.feitas}<small>/{s.resumo.total}</small></strong>
          <span className="mudo pequeno">{t('atividades concluídas')}</span>
          <span className="mini-barra"><span style={{ width: `${s.resumo.fracao * 100}%` }} /></span>
        </div>
        <div className="cartao">
          <span className="sobretitulo">{t('Hoje')}</span>
          <strong className="numero-grande">{hoje ? duracao(hoje.minutos) : '—'}</strong>
          <span className="mudo pequeno">{hoje?.atividades.length ? t('planejados para hoje') : t('dia livre')}</span>
        </div>
        <div className="cartao">
          <span className="sobretitulo">{t('Prova')}</span>
          <strong className="numero-grande">{dias === null ? '—' : dias < 0 ? '—' : dias}</strong>
          <span className="mudo pequeno">{dias === null ? <button className="botao-texto" onClick={() => setConfig(true)}>{t('Informar a data')}</button> : t('dias até a prova')}</span>
        </div>
        <div className="cartao">
          <span className="sobretitulo">{t('Pendências')}</span>
          <strong className="numero-grande">{s.resumo.atrasadas + (s.resumo.atrasoQuestoes ? 1 : 0)}</strong>
          <span className="mudo pequeno">{s.resumo.atrasoQuestoes ? t('{n} questões atrasadas, parte volta hoje', { n: s.resumo.atrasoQuestoes }) : t('atividades atrasadas')}</span>
        </div>
      </section>

      <nav className="semana-nav" aria-label={t('Semana')}>
        <button className="botao" onClick={() => setDeslocamento(semana - 1)} aria-label={t('Semana anterior')}><Icone nome="esquerda" /></button>
        <button className="botao" onClick={() => setDeslocamento(0)} disabled={semana === 0}>{t('Hoje')}</button>
        <button className="botao" onClick={() => setDeslocamento(semana + 1)} aria-label={t('Próxima semana')}><Icone nome="direita" /></button>
        <strong>{dataCurta(s.dias[0].dia)} – {dataCurta(s.dias[6].dia)}</strong>
        {semana === 1 && <span className="mudo pequeno">{t('Próxima semana: prévia, se ajusta ao que você fizer até lá.')}</span>}
      </nav>

      <ol className="semana">
        {s.dias.map((d) => (
          <li key={d.dia} className={`dia${d.hoje ? ' dia-hoje' : ''}${d.passado ? ' dia-passado' : ''}`}>
            <header className="dia-topo">
              <span>{d.hoje ? t('Hoje') : t(DIAS_CURTOS[new Date(d.dia).getDay()])}</span>
              <strong>{dataCurta(d.dia)}</strong>
              {d.minutos > 0 && <span className="mudo pequeno">{duracao(d.minutos)}</span>}
            </header>
            {d.livre ? (
              <div className="dia-livre"><Icone nome="calendario" /> <span>{t(d.estudo ? 'Sem atividades' : 'Dia livre')}</span></div>
            ) : (
              <div className="dia-atividades">{d.atividades.map((a) => <Atividade key={a.id} a={a} abrir={abrir} />)}</div>
            )}
          </li>
        ))}
      </ol>
      <p className="mudo pequeno legenda-chamas"><Icone nome="chama" tamanho={13} /> {t('Incidência: quanto a especialidade da aula pesa nas provas do Inep.')}</p>
      {config && <Configurar fechar={() => setConfig(false)} />}
    </div>
  );
}

/** Rota do 4º ao 6º ano: onde o aluno está e o que falta em cada fase. */
function RotaQuartoAno() {
  const { banco, progresso } = useApp();
  const rota = useMemo(() => rotaQuartoAno(progresso, banco, modulosDoCurso(banco, progresso)), [banco, progresso]);
  return (
    <section className="cartao rota-4ano" aria-label={t('Rota ENAMED 4º ano')}>
      <div className="rota-cab">
        <div>
          <span className="sobretitulo">{t('Rota ENAMED 4º ano')}</span>
          <h2>{t('Do 4º ao 6º ano, sem correria')}</h2>
          <p className="mudo pequeno">{t('O ENAMED do 4º ano é formativo e não conta para a residência. Ele mostra onde você está; a prova do 6º ano é a que vale para o CRM e para o Enare.')}</p>
        </div>
      </div>
      <ol className="rota-fases">
        {rota.fases.map((f, i) => (
          <li key={f.id} className={i === rota.atual ? 'atual' : i < rota.atual ? 'feita' : ''}>
            <span className="rota-num">{i < rota.atual ? <Icone nome="check" tamanho={14} /> : i + 1}</span>
            <div>
              <strong>{t(f.titulo)}</strong>
              <p className="mudo pequeno">{t(f.texto)}</p>
              {f.metas.map((m) => (
                <div key={m.rotulo} className="rota-meta">
                  <span className="pequeno">{t(m.rotulo)} <span className="mudo">· {m.detalhe}</span></span>
                  <span className="mini-barra"><span style={{ width: `${Math.round(m.feito * 100)}%` }} /></span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
