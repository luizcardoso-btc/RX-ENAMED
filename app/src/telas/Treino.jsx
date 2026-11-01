import { useState, useEffect, useMemo } from '../react.js';
import { useApp, Questao, Icone, Numero, TagArea, Vazio, FalaMentor, AvisoLimite } from '../componentes.jsx';
import { LETRAS, formatarPct, plural } from '../util.js';
import { t, tc, idiomaAtual } from '../i18n.js';
import { chaveDoDia } from '../trilha.js';
import { useSample } from './Pratica.jsx';

const ORIGEM_TITULO = { modulo: 'Curso · módulo', treino: 'Treino', trilha: 'Trilha · plano de hoje', revisao: 'Revisão espaçada', 'simulado-revisao': 'Correção do simulado' };

function Anotacao({ id }) {
  const { progresso, despachar } = useApp();
  const [texto, setTexto] = useState(progresso.notas[id] || '');
  useEffect(() => setTexto(progresso.notas[id] || ''), [id]);
  return (
    <label className="anotacao">
      <span className="rotulo-campo">{t('Sua anotação')}</span>
      <textarea id={`nota-${id}`} rows={2} value={texto} placeholder={t('Ex.: lembrar que BI-RADS 4 sempre pede biópsia')}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => despachar({ tipo: 'nota', id, texto })} />
    </label>
  );
}

// Escolha estável (mesma questão, mesma fala) entre as falas do mentor.
function escolher(lista, chave) {
  let h = 0;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lista[h % lista.length];
}

function DicaMentor({ q, escolha }) {
  const { banco } = useApp();
  const mentor = banco.mentorDaArea[q.area];
  if (!mentor || q.anulada) return null;
  const certa = escolha === q.gabarito;
  const fala = escolher(tc(mentor, 'mensagens')[certa ? 'acerto' : 'erro'], q.id);
  const edicoes = q.tema ? [...(banco.edicoesDoTema[q.tema] || [])] : [];
  return (
    <FalaMentor mentor={mentor}>
      <p>{fala}</p>
      {edicoes.length > 1 && <p className="mudo">{t('"{tema}" caiu em {edicoes}. Tema recorrente: vale revisar.', { tema: q.tema, edicoes: edicoes.join(t(' e ')) })}</p>}
    </FalaMentor>
  );
}

/** Comentário da questão: por que o gabarito está certo e por que cada alternativa está certa ou errada. */
function Comentario({ q, escolha }) {
  const { banco } = useApp();
  const sample = useSample();
  const [gerado, setGerado] = useState(null);
  const [estado, setEstado] = useState('');
  useEffect(() => { setGerado(null); setEstado(''); }, [q.id]);
  if (q.anulada) return null;
  const c = banco.comentarios[q.id] || gerado;
  const letras = LETRAS.slice(0, q.alternativas.length);

  if (!c) {
    if (!sample) return null;
    const gerar = async () => {
      setEstado('gerando');
      try {
        const lingua = idiomaAtual() === 'es' ? 'espanhol' : 'português do Brasil';
        const r = await sample.json([
          'Você é professor de um curso preparatório para o ENAMED e o Revalida (Inep). Comente a questão abaixo seguindo o gabarito oficial e os protocolos do Ministério da Saúde que o Inep usa.',
          `Escreva em ${lingua}. "resumo": até 60 palavras explicando por que a alternativa ${q.gabarito} é a correta. "alternativas": para cada letra, até 25 palavras dizendo por que está certa ou errada.`,
          'Responda só com JSON: {"resumo":"...","alternativas":{"A":"...","B":"..."}}',
          `ENUNCIADO: ${q.enunciado.replace(/\[FIG:\d+\]/g, '[figura]')}`,
          ...q.alternativas.map((a, i) => `${letras[i]}) ${a}`),
          `GABARITO OFICIAL: ${q.gabarito}`,
        ].join('\n'), { cache: true });
        if (!r?.resumo) throw new Error();
        setGerado({ ia: true, pt: r, es: r });
        setEstado('');
      } catch {
        setEstado('erro');
      }
    };
    return (
      <section className="comentario">
        <span className="sobretitulo">{t('Comentário da questão')}</span>
        <p className="mudo">{t('Esta questão ainda não tem comentário escrito pela equipe.')}</p>
        <button className="botao" onClick={gerar} disabled={estado === 'gerando'}>
          {estado === 'gerando' ? t('Gerando o comentário…') : t('Gerar comentário com IA')}
        </button>
        {estado === 'erro' && <p className="aviso" role="status">{t('A IA não respondeu agora. Tente de novo em instantes.')}</p>}
      </section>
    );
  }
  const tx = (idiomaAtual() === 'es' && c.es) || c.pt;
  const certa = escolha === q.gabarito;
  return (
    <section className={`comentario ${certa ? 'acertou' : 'errou'}`}>
      <span className="sobretitulo">{t('Comentário da questão')}</span>
      <p className="comentario-veredito">
        {certa ? t('Você acertou. A resposta é {l}.', { l: q.gabarito }) : t('Você marcou {e}. A resposta é {l}.', { e: escolha || '–', l: q.gabarito })}
      </p>
      <p>{tx.resumo}</p>
      {!certa && escolha && tx.alternativas[escolha] && (
        <p className="comentario-erro"><strong>{t('Por que {l} está errada:', { l: escolha })}</strong> {tx.alternativas[escolha]}</p>
      )}
      <details className="comentario-alternativas">
        <summary>{t('Comentário de cada alternativa')}</summary>
        <ul>
          {letras.map((l) => (
            <li key={l} className={l === q.gabarito ? 'gabarito' : ''}><span className="bolha" aria-hidden="true">{l}</span><span>{tx.alternativas[l]}</span></li>
          ))}
        </ul>
      </details>
      <p className="mudo pequeno">{c.ia ? t('Comentário gerado por IA a partir do gabarito oficial. Confira nos protocolos.') : t('Comentário da equipe RX, em revisão médica, de acordo com o gabarito oficial do Inep.')}</p>
    </section>
  );
}

function Resumo({ sessao, estados, irPara, refazer }) {
  const { banco, ir } = useApp();
  const qs = sessao.ids.map((id) => banco.porId[id]);
  const validas = qs.filter((q) => !q.anulada && estados[q.id]?.revelada);
  const certas = validas.filter((q) => estados[q.id].escolha === q.gabarito);
  const erradas = validas.filter((q) => estados[q.id].escolha !== q.gabarito);
  return (
    <section className="resumo-sessao">
      <h2>{t('Sessão concluída')}</h2>
      <div className="numeros">
        <Numero rotulo={t('Acertos')} valor={formatarPct(certas.length, validas.length)}
          detalhe={t('{n} de {q}', { n: certas.length, q: plural(validas.length, 'questão válida', 'questões válidas') })} />
        <Numero rotulo={t('Erros')} valor={erradas.length} detalhe={t(erradas.length ? 'já estão na revisão espaçada' : 'nenhum')} />
      </div>
      <ul className="lista-questoes compacta">
        {qs.map((q, i) => {
          const e = estados[q.id];
          const status = q.anulada ? 'anulada' : !e?.revelada ? 'pulada' : e.escolha === q.gabarito ? 'certa' : 'errada';
          return (
            <li key={q.id}>
              <button className="linha-questao" onClick={() => irPara(i)}>
                <span className={`status status-${status}`}>
                  {status === 'certa' ? <Icone nome="check" tamanho={14} /> : status === 'errada' ? <Icone nome="x" tamanho={14} /> : '–'}
                </span>
                <span className="linha-num">Q{q.numero}</span>
                <span className="linha-prova">{q.rotulo}</span>
                <TagArea area={q.area} />
                <span className="linha-texto">{t(q.especialidade)} · {q.tema}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="linha-botoes">
        {erradas.length > 0 && (
          <button className="botao botao-primario" onClick={() => refazer(erradas.map((q) => q.id))}>
            <Icone nome="repetir" /> {t('Refazer as {n} erradas', { n: erradas.length })}
          </button>
        )}
        {sessao.origem === 'modulo' ? <button className="botao" onClick={() => ir('curso')}>{t('Voltar ao módulo')}</button>
          : sessao.origem === 'trilha'
          ? <button className="botao" onClick={() => ir('trilha')}>{t('Voltar à trilha')}</button>
          : <button className="botao" onClick={() => ir('questoes')}>{t('Voltar ao banco')}</button>}
        <button className="botao" onClick={() => ir('painel')}>{t('Ir ao painel')}</button>
      </div>
    </section>
  );
}

export default function Treino() {
  const { acesso, banco, progresso, despachar, sessao, setSessao, ir, iniciarSessao } = useApp();
  const [estados, setEstados] = useState({}); // id -> { escolha, revelada }
  const [eliminadas, setEliminadas] = useState({}); // id -> Set
  const [fim, setFim] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    const fixas = sessao.fixas || {};
    setEstados(Object.fromEntries(Object.entries(fixas).map(([id, escolha]) => [id, { escolha, revelada: true }])));
    setEliminadas({});
    setFim(false);
  }, [sessao?.chave]);

  const q = sessao ? banco.porId[sessao.ids[sessao.indice]] : null;
  const estado = (q && estados[q.id]) || { escolha: null, revelada: !!sessao?.fixas };
  const ultimo = sessao && sessao.indice === sessao.ids.length - 1;
  const respondidas = useMemo(() => Object.values(estados).filter((e) => e.revelada).length, [estados]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [sessao?.indice, fim]);

  const irPara = (i) => {
    setFim(false);
    setSessao({ ...sessao, indice: Math.max(0, Math.min(sessao.ids.length - 1, i)) });
  };
  const escolher = (letra) => setEstados((s) => ({ ...s, [q.id]: { ...estado, escolha: letra } }));
  const eliminar = (letra) => setEliminadas((s) => {
    const atual = new Set(s[q.id]);
    atual.has(letra) ? atual.delete(letra) : atual.add(letra);
    return { ...s, [q.id]: atual };
  });
  // As questões do desafio diário nunca são bloqueadas: o limite do gratuito vale para as demais.
  const doDesafio = progresso.trilha.plano?.dia === chaveDoDia() && progresso.trilha.plano.itens.some((i) => i.id === q?.id);
  const bloqueada = !acesso.podeResponder && !estado.revelada && !q?.anulada && !doDesafio;
  const responder = () => {
    if (!estado.escolha || estado.revelada || bloqueada) return;
    setEstados((s) => ({ ...s, [q.id]: { ...estado, revelada: true } }));
    if (!q.anulada) {
      despachar({ tipo: 'responder', id: q.id, escolha: estado.escolha, certa: estado.escolha === q.gabarito,
        origem: sessao.origens?.[q.id] || (sessao.origem === 'revisao' ? 'revisao' : 'treino') });
    }
  };
  const avancar = () => (ultimo ? setFim(true) : irPara(sessao.indice + 1));

  useEffect(() => {
    if (!q || fim) return undefined;
    const tecla = (e) => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const idx = LETRAS.indexOf(k) >= 0 ? LETRAS.indexOf(k) : ['1', '2', '3', '4', '5'].indexOf(e.key);
      if (idx >= 0 && idx < q.alternativas.length && !estado.revelada) escolher(LETRAS[idx]);
      else if (e.key === 'Enter' && !e.target.closest('button')) (estado.revelada ? avancar() : responder());
      else if (e.key === 'ArrowRight') irPara(sessao.indice + 1);
      else if (e.key === 'ArrowLeft') irPara(sessao.indice - 1);
      else if (k === 'M') despachar({ tipo: 'marcar', id: q.id });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  if (!sessao) {
    return (
      <Vazio titulo={t('Nenhuma sessão em andamento')}
        acao={<button className="botao botao-primario" onClick={() => ir('questoes')}>{t('Escolher questões')}</button>}>
        {t('Escolha questões no banco, comece uma revisão ou faça um simulado.')}
      </Vazio>
    );
  }

  return (
    <div className="tela-treino">
      <div className="barra-sessao">
        <div>
          <span className="sobretitulo">{t(ORIGEM_TITULO[sessao.origem])}</span>
          <h2 className="titulo-sessao">{sessao.titulo}</h2>
        </div>
        <div className="progresso-sessao" aria-label={t('{n} de {total} respondidas', { n: respondidas, total: sessao.ids.length })}>
          <span className="contador">{fim ? sessao.ids.length : sessao.indice + 1}<small>/{sessao.ids.length}</small></span>
          <span className="trilho-progresso"><span style={{ width: `${(respondidas / sessao.ids.length) * 100}%` }} /></span>
        </div>
      </div>

      {fim ? (
        <Resumo sessao={sessao} estados={estados} irPara={irPara}
          refazer={(ids) => iniciarSessao({ titulo: t('Refazendo erradas'), ids, origem: 'treino' })} />
      ) : (
        <>
          <Questao q={q} escolha={estado.escolha} revelada={estado.revelada} onEscolher={escolher}
            eliminadas={eliminadas[q.id]} onEliminar={eliminar} mostrarClassificacao={estado.revelada}
            marcada={progresso.marcadas[q.id]} onMarcar={() => despachar({ tipo: 'marcar', id: q.id })}
            extra={<><Comentario q={q} escolha={estado.escolha} /><DicaMentor q={q} escolha={estado.escolha} /><Anotacao id={q.id} /></>} />
          {bloqueada && <AvisoLimite tipo="questoes" />}
          <nav className="navegacao-questao" aria-label={t('Navegação entre questões')}>
            <button className="botao" onClick={() => irPara(sessao.indice - 1)} disabled={sessao.indice === 0}>
              <Icone nome="esquerda" /> {t('Anterior')}
            </button>
            {estado.revelada ? (
              <button className="botao botao-primario" onClick={avancar}>
                {t(ultimo ? 'Ver resultado' : 'Próxima')} <Icone nome="direita" />
              </button>
            ) : (
              <button className="botao botao-primario" onClick={responder} disabled={!estado.escolha || bloqueada}>
                {t('Responder')}
              </button>
            )}
            <button className="botao" onClick={avancar}>{t(ultimo ? 'Encerrar' : 'Pular')}</button>
          </nav>
          <p className="atalhos">
            {t('Atalhos:')} <kbd>A</kbd>–<kbd>D</kbd> {t('escolhem,')} <kbd>Enter</kbd> {t('responde e avança,')}{' '}
            <kbd>←</kbd> <kbd>→</kbd> {t('navegam,')} <kbd>M</kbd> {t('marca a questão.')}
          </p>
        </>
      )}
    </div>
  );
}
