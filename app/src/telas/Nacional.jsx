// Simulado nacional gratuito: o aluno escolhe a faculdade, faz o caderno da edição no tempo da prova
// (sem pausa) e vê a nota, a posição no ranking nacional e o ranking por faculdade. A correção é do servidor.
import { useState, useEffect } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { t } from '../i18n.js';

const PENDENTE = 'rx-nacional-pendente';
async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`/api${caminho}`, { method: metodo, credentials: 'same-origin', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(json.erro || `Erro ${r.status}`); e.codigo = json.codigo; throw e; }
  return json;
}
const pct = (x) => (x === null || x === undefined ? '—' : `${Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const quando = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Envia ao servidor as respostas de um simulado nacional; se falhar (sem internet), guarda para tentar de novo. */
export async function enviarNacional(id, respostas) {
  try {
    const r = await chamar(`/nacional/${id}/enviar`, { metodo: 'POST', corpo: { respostas } });
    try { localStorage.removeItem(PENDENTE); } catch { /* sem armazenamento */ }
    return r;
  } catch (e) {
    if (e.codigo !== 'ja_enviado') { try { localStorage.setItem(PENDENTE, JSON.stringify({ id, respostas })); } catch { /* sem armazenamento */ } }
    throw e;
  }
}

function EscolherFaculdade({ aoSalvar }) {
  const [lista, setLista] = useState(null);
  const [texto, setTexto] = useState('');
  const [outra, setOutra] = useState('');
  const [compartilhar, setCompartilhar] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { chamar('/faculdades').then((r) => setLista([...r.faculdades.map((f) => ({ codigo: f.codigo, rotulo: `${f.nome} · ${f.cidade}${f.pais !== 'Brasil' ? ` (${f.pais})` : ''}` })), { codigo: 'outra', rotulo: t('Outra faculdade (não está na lista)') }])).catch(() => setLista([])); }, []);
  const escolhida = (lista || []).find((f) => f.rotulo === texto);
  const salvar = async (e) => {
    e.preventDefault();
    if (!escolhida) { setErro(t('Escolha a faculdade na lista.')); return; }
    try { aoSalvar(await chamar('/eu/faculdade', { metodo: 'PUT', corpo: { faculdade: escolhida.codigo, faculdadeOutra: outra, compartilhar } })); } catch (err) { setErro(err.message); }
  };
  return (
    <form className="cartao nacional-faculdade" onSubmit={salvar}>
      <span className="sobretitulo">{t('Antes de começar')}</span>
      <h2>{t('Qual é a sua faculdade?')}</h2>
      <p className="mudo pequeno">{t('Ela aparece no ranking por faculdade. Seu nome aparece só como primeiro nome e inicial do sobrenome.')}</p>
      <label className="campo"><span className="rotulo-campo">{t('Faculdade')}</span>
        <input list="nacional-faculdades" value={texto} onChange={(e) => { setTexto(e.target.value); setErro(''); }} placeholder={t('Digite o nome ou a cidade')} />
        <datalist id="nacional-faculdades">{(lista || []).map((f) => <option key={f.codigo} value={f.rotulo} />)}</datalist></label>
      {escolhida?.codigo === 'outra' && <label className="campo"><span className="rotulo-campo">{t('Nome da sua faculdade')}</span><input value={outra} onChange={(e) => setOutra(e.target.value)} /></label>}
      <label className="linha-check"><input type="checkbox" checked={compartilhar} onChange={(e) => setCompartilhar(e.target.checked)} /> {t('Autorizo a coordenação da minha faculdade a ver o meu desempenho na Rx Med, se ela for parceira.')}</label>
      {erro && <p className="aviso" role="alert">{erro}</p>}
      <button className="botao botao-primario">{t('Salvar faculdade')}</button>
    </form>
  );
}

function Ranking({ id, voltar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => { chamar(`/nacional/${id}/ranking`).then(setDados).catch((e) => setErro(e.message)); }, [id]);
  if (erro) return <p className="aviso">{erro}</p>;
  if (!dados) return <p className="mudo">{t('Carregando o ranking…')}</p>;
  const { ranking: r, minha } = dados;
  return (
    <section className="nacional-ranking">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={14} /> {t('Voltar')}</button>
      <h2>{dados.simulado.nome}</h2>
      <div className="grade-kpis">
        <div className="cartao"><span className="sobretitulo">{t('Sua nota')}</span><strong className="numero-grande">{minha ? pct(minha.nota) : '—'}</strong><span className="mudo pequeno">{minha ? t('{a} de {b} questões', { a: minha.acertos, b: minha.total }) : t('você não participou')}</span></div>
        <div className="cartao"><span className="sobretitulo">{t('Sua posição')}</span><strong className="numero-grande">{r.posicao ? `${r.posicao}º` : '—'}</strong><span className="mudo pequeno">{r.posicao ? t('de {n} · melhor que {p}%', { n: r.participantes, p: r.percentil }) : minha && !minha.no_tempo ? t('entregue fora do tempo: não entra no ranking') : t('{n} participantes', { n: r.participantes })}</span></div>
        <div className="cartao"><span className="sobretitulo">{t('Média nacional')}</span><strong className="numero-grande">{pct(r.media)}</strong><span className="mudo pequeno">{t('{n} participantes', { n: r.participantes })}</span></div>
      </div>
      {minha?.por_area && (
        <div className="cartao"><h3>{t('Seu acerto por área')}</h3>
          <ul className="lista-areas">{Object.entries(minha.por_area).map(([a, v]) => <li key={a}><span>{t(a)}</span><strong>{pct((v.acertos / v.total) * 100)}</strong><span className="mudo pequeno">{v.acertos}/{v.total}</span></li>)}</ul></div>
      )}
      <div className="nacional-colunas">
        <div className="cartao"><h3>{t('Ranking por faculdade')}</h3>
          {r.faculdades.length ? <ol className="ranking-lista">{r.faculdades.map((f) => <li key={f.faculdade}><span>{f.nome}</span><strong>{pct(f.media)}</strong><span className="mudo pequeno">{t('{n} alunos', { n: f.participantes })}</span></li>)}</ol>
            : <p className="mudo pequeno">{t('As faculdades aparecem aqui a partir de {n} participantes.', { n: r.minimoFaculdade })}</p>}</div>
        <div className="cartao"><h3>{t('Top 20 nacional')}</h3>
          <ol className="ranking-lista">{r.top.map((x) => <li key={x.posicao} className={x.voce ? 'voce' : ''}><span>{x.nome}<br /><small className="mudo">{x.faculdade}</small></span><strong>{pct(x.nota)}</strong></li>)}</ol></div>
      </div>
    </section>
  );
}

export default function Nacional() {
  const { conta, banco, progresso, despachar, ir } = useApp();
  const [lista, setLista] = useState(null);
  const [faculdade, setFaculdade] = useState(undefined);
  const [erro, setErro] = useState('');
  const [vendo, setVendo] = useState(null);
  const recarregar = () => chamar('/nacional').then((r) => setLista(r.simulados)).catch((e) => setErro(e.message));
  useEffect(() => {
    if (!conta.servidor || !conta.usuario) return;
    // Entrega que ficou pendente (sem internet na hora): tenta de novo.
    let pendente = null;
    try { pendente = JSON.parse(localStorage.getItem(PENDENTE) || 'null'); } catch { pendente = null; }
    (pendente ? enviarNacional(pendente.id, pendente.respostas).catch(() => null) : Promise.resolve()).finally(recarregar);
    chamar('/eu/faculdade').then((f) => setFaculdade(f.faculdade ? f : null)).catch(() => setFaculdade(null));
  }, [conta.servidor, conta.usuario?.id]);

  const iniciar = async (s) => {
    setErro('');
    try {
      const r = await chamar(`/nacional/${s.id}/iniciar`, { metodo: 'POST', corpo: {} });
      const ids = r.questoes.filter((id) => banco.porId[id]);
      despachar({ tipo: 'iniciarSimulado', simulado: {
        id: `nac-${r.id}`, tipo: 'nacional', nacional: { id: r.id }, titulo: r.nome, ids,
        inicio: new Date(r.iniciadoEm).getTime(), duracao: r.duracaoMin * 60, respostas: {}, duvidas: {}, indice: 0, pausaAcumulada: 0, pausadoEm: null,
      } });
      ir('simulado');
    } catch (e) {
      if (e.codigo === 'faculdade') setFaculdade(null);
      setErro(e.message);
    }
  };

  const cabecalho = (
    <header className="cabecalho-tela"><div>
      <span className="sobretitulo">{t('Simulado nacional')}</span>
      <h1>{t('Compare-se com estudantes de todo o país')}</h1>
      <p className="mudo">{t('Gratuito. Caderno com questões oficiais do Inep, no tempo da prova, corrigido na hora. Você vê a sua posição no ranking nacional e o da sua faculdade.')}</p>
    </div></header>
  );
  if (!conta.servidor || !conta.usuario) return <div className="tela-nacional">{cabecalho}<div className="cartao"><p>{t('O simulado nacional é feito com a sua conta Rx Med. Entre ou crie a conta grátis para participar.')}</p><a className="botao botao-primario" href="/entrar?voltar=/plataforma/index.html%23nacional">{t('Entrar ou criar conta')}</a></div></div>;
  if (vendo) return <div className="tela-nacional"><Ranking id={vendo} voltar={() => { setVendo(null); recarregar(); }} /></div>;
  const ativo = progresso.simuladoAtivo;
  return (
    <div className="tela-nacional">
      {cabecalho}
      {erro && <p className="aviso" role="alert">{erro}</p>}
      {faculdade === null && <EscolherFaculdade aoSalvar={(f) => { setFaculdade(f); setErro(''); }} />}
      {faculdade && <p className="mudo pequeno">{t('Sua faculdade: {f}', { f: faculdade.nome })} · <button className="botao-texto" onClick={() => setFaculdade(null)}>{t('trocar')}</button></p>}
      {!lista ? <p className="mudo">{t('Carregando…')}</p> : !lista.length ? (
        <div className="cartao"><h2>{t('Nenhuma edição aberta agora')}</h2><p className="mudo">{t('Avisamos pelo e-mail da sua conta quando abrir a próxima. Enquanto isso, faça um simulado no tempo real na aba Simulado.')}</p></div>
      ) : (
        <div className="nacional-lista">
          {lista.map((s) => {
            const fez = s.minha?.enviado_em;
            const emAndamento = s.minha && !fez;
            return (
              <article key={s.id} className="cartao nacional-cartao">
                <span className={`selo-situacao ${s.situacao}`}>{t({ aberto: 'Aberto', em_breve: 'Em breve', encerrado: 'Encerrado' }[s.situacao])}</span>
                <h2>{s.nome}</h2>
                <p className="mudo pequeno">{s.exame === 'enamed' ? 'ENAMED' : 'Revalida'} · {t('{n} questões', { n: s.questoes })} · {t('{m} minutos', { m: s.duracao_min })} · {quando(s.inicio)} – {quando(s.fim)}</p>
                <p className="mudo pequeno">{t('{n} participantes até agora', { n: s.participantes })}</p>
                {fez ? <p><strong>{t('Sua nota: {n}', { n: pct(s.minha.nota) })}</strong></p> : null}
                <div className="linha-botoes">
                  {s.situacao === 'aberto' && !fez && (emAndamento && ativo?.nacional?.id === s.id
                    ? <button className="botao botao-primario" onClick={() => ir('simulado')}>{t('Continuar a prova')}</button>
                    : <button className="botao botao-primario" disabled={!faculdade || (ativo && ativo.nacional?.id !== s.id)} onClick={() => iniciar(s)}>{t(emAndamento ? 'Retomar a prova' : 'Começar a prova')}</button>)}
                  {(fez || s.situacao === 'encerrado') && <button className="botao" onClick={() => setVendo(s.id)}>{t('Ver ranking')}</button>}
                </div>
                {s.situacao === 'aberto' && !fez && <p className="mudo pequeno">{t('Sem pausa: o tempo corre a partir do início, como na prova. Cada aluno faz uma vez.')}</p>}
                {ativo && ativo.nacional?.id !== s.id && s.situacao === 'aberto' && !fez && <p className="aviso pequeno">{t('Termine ou descarte o simulado em andamento antes de começar.')}</p>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
