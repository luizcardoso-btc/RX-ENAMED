// Desempenho gamificado: nível, XP, conquistas e o ranking entre alunos.
// O ranking usa as capacidades `db` (um documento por aluno em ranking/<id>) e `user` (nomes e fotos).
// Só entra no ranking quem clica em "Participar"; sair apaga o documento.
import { useState, useEffect, useMemo, useRef } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { calcularXP, nivelDe, conquistas, idSemana } from '../gamificacao.js';
import { t } from '../i18n.js';

function useCapacidade(nome) {
  const [cap, setCap] = useState(undefined);
  useEffect(() => {
    let vivo = true;
    (async () => {
      let c = null;
      try { c = window.claude?.use ? await window.claude.use(nome) : null; } catch { c = null; }
      if (vivo) setCap(c || null);
    })();
    return () => { vivo = false; };
  }, [nome]);
  return cap;
}

const fmt = (n) => n.toLocaleString('pt-BR');

export function PainelNivel() {
  const { progresso } = useApp();
  const xp = useMemo(() => calcularXP(progresso), [progresso]);
  const nivel = nivelDe(xp.total);
  const lista = conquistas(progresso, xp);
  const feitas = lista.filter((c) => c.feito).length;
  return (
    <section className="nivel-painel">
      <div className="nivel-topo">
        <div className="nivel-selo" aria-hidden="true"><span>{nivel.numero}</span></div>
        <div className="nivel-texto">
          <span className="sobretitulo">{t('Seu nível')}</span>
          <h2>{t(nivel.nome)}</h2>
          <div className="xp-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nivel.fracao * 100)}
            aria-label={t('Progresso até o próximo nível')}>
            <i style={{ width: `${Math.round(nivel.fracao * 100)}%` }} />
          </div>
          <p className="mudo pequeno">{nivel.proximo
            ? t('{xp} XP · faltam {f} XP para {n}', { xp: fmt(xp.total), f: fmt(nivel.proximo.min - xp.total), n: t(nivel.proximo.nome) })
            : t('{xp} XP · nível máximo', { xp: fmt(xp.total) })}</p>
        </div>
        <div className="nivel-semana">
          <strong>{fmt(xp.daSemana)}</strong>
          <span className="mudo pequeno">{t('XP nesta semana')}</span>
        </div>
      </div>
      <h3 className="conquistas-titulo">{t('Conquistas')} <span className="mudo pequeno">{t('{n} de {total}', { n: feitas, total: lista.length })}</span></h3>
      <ul className="conquistas">
        {lista.map((c) => (
          <li key={c.id} className={c.feito ? 'feita' : ''} title={t(c.descricao)}>
            <span className="conquista-icone" aria-hidden="true">{c.feito ? <Icone nome="check" tamanho={16} /> : <Icone nome="cadeado" tamanho={14} />}</span>
            <span><strong>{t(c.nome)}</strong><span className="mudo pequeno">{t(c.descricao)}</span>
              {!c.feito && c.progresso > 0 && <span className="mini-barra"><i style={{ width: `${Math.round(c.progresso * 100)}%` }} /></span>}</span>
          </li>
        ))}
      </ul>
      <p className="mudo pequeno">{t('Como ganhar XP: acerto 10, questão errada 3, flashcard 2, aula 30, simulado 40, estação 25.')}</p>
    </section>
  );
}

export function Ranking() {
  const { progresso } = useApp();
  const db = useCapacidade('db');
  const user = useCapacidade('user');
  const [eu, setEu] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [perfis, setPerfis] = useState({});
  const [aba, setAba] = useState('semana');
  const [erro, setErro] = useState('');
  const xp = useMemo(() => calcularXP(progresso), [progresso]);
  const enviado = useRef('');

  useEffect(() => { if (user) user.id().then(setEu).catch(() => setEu(null)); }, [user]);
  useEffect(() => {
    if (!db) return undefined;
    return db.collection('ranking').orderBy('xp', 'desc').limit(100).onSnapshot(
      (snap) => setLinhas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setErro(t('O ranking não carregou agora. Recarregue a página para tentar de novo.')),
    );
  }, [db]);
  // Nomes e fotos resolvidos na hora de mostrar; o documento guarda só números.
  useEffect(() => {
    if (!user || !linhas.length) return;
    user.profiles(linhas.map((l) => l.id)).then(setPerfis).catch(() => {});
  }, [user, linhas.map((l) => l.id).join()]);

  const participando = !!eu && linhas.some((l) => l.id === eu);
  const semana = idSemana();
  const dados = () => ({ xp: xp.total, xpSemana: xp.daSemana, semana, nivel: nivelDe(xp.total).numero, acertos: xp.acertos, respondidas: xp.respondidas, atualizado: Date.now() });
  // Mantém o meu documento em dia quando o XP muda (só se eu participo).
  useEffect(() => {
    if (!db || !participando) return;
    const chave = `${xp.total}|${xp.daSemana}|${semana}`;
    if (enviado.current === chave) return;
    const atraso = setTimeout(() => {
      enviado.current = chave;
      db.doc(`ranking/${eu}`).set(dados()).catch(() => {});
    }, 1500);
    return () => clearTimeout(atraso);
  }, [db, participando, xp.total, xp.daSemana]);

  const entrar = async () => {
    setErro('');
    try { await db.doc(`ranking/${eu}`).set(dados()); } catch (e) {
      setErro(e?.code === 'invalid_argument'
        ? t('Sua conta só pode ver o ranking. Para participar, peça a quem compartilhou o link acesso de participante (Contributor).')
        : t('Não deu para entrar no ranking agora. Tente de novo em instantes.'));
    }
  };
  const sairDoRanking = async () => { try { await db.doc(`ranking/${eu}`).delete(); } catch { /* já saiu */ } };

  if (db === null || user === null) {
    return (
      <section className="secao ranking">
        <h2>{t('Ranking dos alunos')}</h2>
        <p className="aviso">{t('O ranking funciona na plataforma online, aberta pelo link do claude.ai com a sua conta. Seu nível e suas conquistas continuam valendo aqui.')}</p>
      </section>
    );
  }

  const ordenadas = aba === 'semana'
    ? linhas.filter((l) => l.semana === semana && l.xpSemana > 0).sort((a, b) => b.xpSemana - a.xpSemana)
    : linhas;
  const pontos = (l) => (aba === 'semana' ? l.xpSemana : l.xp) || 0;
  const minhaPosicao = ordenadas.findIndex((l) => l.id === eu);

  return (
    <section className="secao ranking">
      <div className="ranking-topo">
        <div>
          <h2>{t('Ranking dos alunos')}</h2>
          <p className="mudo">{t('Quem mais estudou ganha mais XP. A liga da semana recomeça toda segunda-feira.')}</p>
        </div>
        <div className="abas" role="tablist" aria-label={t('Período do ranking')}>
          <button role="tab" aria-selected={aba === 'semana'} className={aba === 'semana' ? 'ativo' : ''} onClick={() => setAba('semana')}>{t('Esta semana')}</button>
          <button role="tab" aria-selected={aba === 'geral'} className={aba === 'geral' ? 'ativo' : ''} onClick={() => setAba('geral')}>{t('Geral')}</button>
        </div>
      </div>
      {erro && <p className="aviso" role="status">{erro}</p>}
      {!participando && eu && (
        <div className="ranking-convite">
          <p>{t('Participe para aparecer no ranking com seu nome da conta. Só vão XP, nível e número de acertos; você pode sair quando quiser.')}</p>
          <button className="botao botao-primario" onClick={entrar}><Icone nome="estrela" /> {t('Participar do ranking')}</button>
        </div>
      )}
      {ordenadas.length ? (
        <ol className="ranking-lista">
          {ordenadas.slice(0, 20).map((l, i) => {
            const p = perfis[l.id];
            const minha = l.id === eu;
            return (
              <li key={l.id} className={`${minha ? 'minha' : ''} ${i < 3 ? `podio podio-${i + 1}` : ''}`}>
                <span className="posicao">{i + 1}</span>
                {p?.avatarUrl ? <img className="avatar-ranking" src={p.avatarUrl} alt="" /> : <span className="avatar-ranking" />}
                <span className="ranking-nome"><strong>{(p?.name || t('Aluno'))}{minha ? ` (${t('você')})` : ''}</strong>
                  <span className="mudo pequeno">{t(nivelDe(l.xp || 0).nome)} · {t('{a} acertos', { a: fmt(l.acertos || 0) })}</span></span>
                <span className="ranking-xp">{fmt(pontos(l))} <small>XP</small></span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mudo">{aba === 'semana' ? t('Ninguém pontuou nesta semana ainda. Responda algumas questões e seja o primeiro.') : t('Ainda não há alunos no ranking. Participe e seja o primeiro.')}</p>
      )}
      {participando && minhaPosicao >= 20 && <p className="mudo pequeno">{t('Sua posição: {n}º', { n: minhaPosicao + 1 })}</p>}
      {participando && <button className="botao-texto" onClick={sairDoRanking}>{t('Sair do ranking')}</button>}
    </section>
  );
}
