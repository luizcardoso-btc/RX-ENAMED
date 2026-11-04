import { useState } from '../../react.js';
import { useApp, Icone, Numero, FalaMentor } from '../../componentes.jsx';
import { AREAS, infoArea } from '../../data.js';
import { t } from '../../i18n.js';
import { api } from '../../pratica-api.js';
import Estacao from './Estacao.jsx';
import { Recomendacoes, SeloOrigem, notaTexto } from './comum.jsx';

/** Configuração do simulado: 1, 5 ou 10 estações, edital, origem das estações, modo do paciente e tempo. */
function Configurar({ editais, quantidadeInicial, iniciar, voltar }) {
  const [quantidade, setQuantidade] = useState(quantidadeInicial || 5);
  const [edital, setEdital] = useState(editais[0]?.id || '');
  const [origem, setOrigem] = useState('');
  const [modo, setModo] = useState('gratuito');
  const ed = editais.find((x) => x.id === edital);
  const [minutos, setMinutos] = useState(ed?.minutosPorEstacao || 10);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const criar = async () => {
    setCriando(true);
    setErro('');
    try {
      const s = await api().criarSimulado({ quantidade, edital, origem: origem || undefined, minutos });
      iniciar({ ...s, modo });
    } catch (err) {
      setErro(err.message);
      setCriando(false);
    }
  };
  return (
    <div className="simulado-estacoes">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Prática · 2ª etapa')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Simulado da prova de habilidades clínicas')}</span>
          <h1>{t('Monte seu circuito')}</h1>
          <p className="mudo">{t('As estações são sorteadas respeitando a distribuição por área do edital escolhido. Sem feedback entre as estações, como na prova: o relatório sai no fim.')}</p>
        </div>
      </header>
      <section className="cartao simulado-config">
        <div className="campo">
          <span>{t('Quantas estações')}</span>
          <div className="segmentado" role="group" aria-label={t('Quantas estações')}>
            {[1, 5, 10].map((n) => <button key={n} className={quantidade === n ? 'ativo' : ''} aria-pressed={quantidade === n} onClick={() => setQuantidade(n)}>{n === 1 ? t('1 estação') : n === 5 ? t('5 estações (um dia)') : t('10 estações (prova completa)')}</button>)}
          </div>
        </div>
        {editais.length > 0 && (
          <label className="campo">
            <span>{t('Edital de referência')}</span>
            <select value={edital} onChange={(ev) => { setEdital(ev.target.value); const x = editais.find((y) => y.id === ev.target.value); if (x) setMinutos(x.minutosPorEstacao || 10); }}>
              {editais.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
            {ed?.observacao && <span className="mudo pequeno">{ed.observacao}</span>}
          </label>
        )}
        <div className="campo">
          <span>{t('Estações')}</span>
          <div className="segmentado" role="group" aria-label={t('Origem das estações')}>
            {[['', 'Todas'], ['oficial', 'Só oficiais do Inep'], ['autoral', 'Só autorais RX MED']].map(([v, r]) => (
              <button key={v} className={origem === v ? 'ativo' : ''} aria-pressed={origem === v} onClick={() => setOrigem(v)}>{t(r)}</button>
            ))}
          </div>
        </div>
        <div className="campo">
          <span>{t('Paciente')}</span>
          <div className="segmentado" role="group" aria-label={t('Modo do paciente')}>
            <button className={modo === 'gratuito' ? 'ativo' : ''} aria-pressed={modo === 'gratuito'} onClick={() => setModo('gratuito')}>{t('Perguntas livres')}</button>
            <button className={modo === 'roteiro' ? 'ativo' : ''} aria-pressed={modo === 'roteiro'} onClick={() => setModo('roteiro')}>{t('Roteiro em lista')}</button>
          </div>
        </div>
        <label className="campo campo-curto">
          <span>{t('Minutos por estação')}</span>
          <input type="number" min={5} max={20} value={minutos} onChange={(ev) => setMinutos(Math.min(20, Math.max(5, Number(ev.target.value) || 10)))} />
        </label>
        {erro && <p className="aviso" role="alert">{erro}</p>}
        <button className="botao botao-primario botao-grande" onClick={criar} disabled={criando}>
          <Icone nome="relogio" /> {criando ? t('Sorteando estações…') : t('Começar simulado')}
        </button>
      </section>
    </div>
  );
}

function Intervalo({ bloco, total, continuar }) {
  return (
    <div className="simulado-intervalo cartao">
      <span className="sobretitulo">{t('Fim do bloco {b} de {n}', { b: bloco, n: total })}</span>
      <h2>{t('Intervalo')}</h2>
      <p className="mudo">{t('Na prova, os blocos acontecem em dias diferentes. Respire, beba água e siga quando estiver pronto.')}</p>
      <button className="botao botao-primario botao-grande" onClick={continuar}>{t('Começar o próximo bloco')}</button>
    </div>
  );
}

function Relatorio({ simulado, fechamento, voltar, refazer }) {
  const { banco } = useApp();
  const porEstacao = simulado.estacoes.map((e) => ({ e, r: simulado.resultados.find((x) => x.estacao.id === e.id) }));
  const areas = AREAS.map((a) => {
    const lista = porEstacao.filter((x) => x.e.area === a.nome);
    const media = lista.length ? lista.reduce((s, x) => s + (x.r?.nota || 0), 0) / lista.length : null;
    return { a, lista, media };
  }).filter((x) => x.lista.length);
  const piores = [...porEstacao].sort((x, y) => (x.r?.nota || 0) - (y.r?.nota || 0)).slice(0, 2);
  const criticos = porEstacao.reduce((s, x) => s + (x.r?.criticos?.length || 0), 0);
  const mentor = banco.mentorDaArea[piores[0]?.e.area];
  return (
    <div className="simulado-relatorio">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Relatório do simulado')}</span>
          <h1>{t('{n} estações', { n: simulado.estacoes.length })}</h1>
        </div>
      </header>
      <div className="numeros">
        <Numero rotulo={t('Nota média')} valor={`${notaTexto(fechamento?.nota ?? 0)} / 10`} detalhe={t('estação não feita conta zero, como na prova')} />
        <Numero rotulo={t('Estações feitas')} valor={`${fechamento?.feitas ?? simulado.resultados.length}/${simulado.estacoes.length}`} detalhe={t('do circuito sorteado')} />
        <Numero rotulo={t('Erros críticos')} valor={criticos} detalhe={t('itens críticos não cumpridos')} />
      </div>
      <section className="secao">
        <h2>{t('Desempenho por área')}</h2>
        <ul className="barras-area">
          {areas.map(({ a, media }) => (
            <li key={a.nome}>
              <span>{t(a.nome)}</span>
              <span className="barra"><span style={{ width: `${(media || 0) * 10}%`, background: `var(--serie-${a.cor})` }} /></span>
              <strong>{notaTexto(media)}</strong>
            </li>
          ))}
        </ul>
      </section>
      <section className="secao">
        <h2>{t('Nota por estação')}</h2>
        <ol className="lista-simulado">
          {porEstacao.map(({ e, r }, i) => (
            <li key={e.id}>
              <span className="mudo">{i + 1}.</span>
              <span><strong>{e.titulo}</strong> <span className="mudo pequeno">{t(infoArea(e.area).curto)}</span> <SeloOrigem origem={e.origem} edicao={e.edicao} /></span>
              <span className={`nota-pequena ${r && r.nota >= 6 ? 'boa' : 'baixa'}`}>{r ? notaTexto(r.nota) : t('não feita')}</span>
            </li>
          ))}
        </ol>
      </section>
      {mentor && <FalaMentor mentor={mentor}><p>{t('Comece a revisão pelas estações com menor nota. Refaça cada uma em modo roteiro para ver o que o paciente contaria e depois treine em dupla.')}</p></FalaMentor>}
      {piores.map(({ e }) => <Recomendacoes key={e.id} alvo={e} titulo={`${t('Revise')}: ${e.titulo}`} />)}
      <div className="linha-botoes">
        <button className="botao botao-primario" onClick={refazer}><Icone nome="repetir" /> {t('Novo simulado')}</button>
        <button className="botao" onClick={voltar}>{t('Voltar à prática')}</button>
      </div>
    </div>
  );
}

export default function SimuladoEstacoes({ editais, iaDisponivel, quantidadeInicial, voltar }) {
  const [simulado, setSimulado] = useState(null);
  const [indice, setIndice] = useState(0);
  const [intervalo, setIntervalo] = useState(false);
  const [fechamento, setFechamento] = useState(null);
  const [fim, setFim] = useState(false);

  if (!simulado) return <Configurar editais={editais} quantidadeInicial={quantidadeInicial} voltar={voltar} iniciar={(s) => { setSimulado({ ...s, resultados: [] }); setIndice(0); setFim(false); setFechamento(null); }} />;
  if (fim) return <Relatorio simulado={simulado} fechamento={fechamento} voltar={voltar} refazer={() => setSimulado(null)} />;
  if (intervalo) return <Intervalo bloco={1} total={simulado.blocos.length} continuar={() => setIntervalo(false)} />;

  const total = simulado.estacoes.length;
  const aoConcluir = async (r) => {
    const resultados = [...simulado.resultados, r];
    setSimulado({ ...simulado, resultados });
    const proximo = indice + 1;
    if (proximo >= total) {
      try { setFechamento(await api().concluirSimulado(simulado.id)); } catch { setFechamento(null); }
      setFim(true);
      return;
    }
    if (simulado.blocos.length > 1 && proximo === simulado.blocos[0]) setIntervalo(true);
    setIndice(proximo);
  };
  const atual = simulado.estacoes[indice];
  return (
    <Estacao key={`${simulado.id}-${indice}`} publica={atual} iaDisponivel={iaDisponivel}
      simulado={{ id: simulado.id, minutos: simulado.minutos, modo: simulado.modo, indice, total, aoConcluir }} />
  );
}
