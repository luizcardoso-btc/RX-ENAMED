import { useState, useEffect, useReducer, useCallback, useMemo, useRef } from './react.js';
import { Contexto, Icone } from './componentes.jsx';
import { carregarBanco, FILTRO_INICIAL } from './data.js';
import { reducer, hidratar, revisoesPendentes, mesclarProgresso } from './progresso.js';
import { carregarLocal, salvarLocal } from './util.js';
import { situacaoAcesso, LIMITES_PADRAO } from './acesso.js';
import { t, IDIOMAS, idiomaAtual, definirIdioma } from './i18n.js';
import Painel from './telas/Painel.jsx';
import Banco from './telas/Banco.jsx';
import Treino from './telas/Treino.jsx';
import Simulado from './telas/Simulado.jsx';
import Revisao from './telas/Revisao.jsx';
import Desempenho from './telas/Desempenho.jsx';
import RaioX from './telas/RaioX.jsx';
import Trilha from './telas/Trilha.jsx';
import Pratica from './telas/Pratica.jsx';
import Flashcards from './telas/Flashcards.jsx';
import Curso from './telas/Curso.jsx';
import Planos from './telas/Planos.jsx';
import Cronograma from './telas/Cronograma.jsx';
import Desafio, { VigiaDesafio } from './telas/Desafio.jsx';

const ROTAS = {
  painel: { titulo: 'Início', tela: Painel },
  desafio: { titulo: 'Desafio', tela: Desafio },
  cronograma: { titulo: 'Cronograma', tela: Cronograma },
  curso: { titulo: 'Curso', tela: Curso },
  trilha: { titulo: 'Trilha', tela: Trilha },
  questoes: { titulo: 'Questões', tela: Banco },
  flashcards: { titulo: 'Flashcards', tela: Flashcards },
  simulado: { titulo: 'Simulado', tela: Simulado },
  pratica: { titulo: 'Prática', tela: Pratica },
  raiox: { titulo: 'Raio-X', tela: RaioX },
  revisao: { titulo: 'Revisão', tela: Revisao, oculta: true },
  desempenho: { titulo: 'Desempenho', tela: Desempenho },
  planos: { titulo: 'Planos', tela: Planos },
  treino: { titulo: 'Resolvendo', tela: Treino, oculta: true },
};

// Endereço da página de venda (LP). No site, a área do aluno fica em /plataforma/; fora dele (artefato avulso), vai ao site publicado.
const SITE_PUBLICADO = 'https://claude.ai/artifact/BUCcYf8hdLb1nNRS1bcEE6';
const enderecoLP = (idioma) => (window.location.pathname.includes('/plataforma/')
  ? `../${idioma === 'es' ? 'es/' : ''}index.html`
  : SITE_PUBLICADO);

const rotaDoHash = () => {
  const h = window.location.hash.replace('#', '');
  return ROTAS[h] && h !== 'treino' ? h : 'painel';
};

export default function App() {
  const [banco, setBanco] = useState(null);
  const [erro, setErro] = useState('');
  const [rota, setRota] = useState(rotaDoHash);
  const [progresso, despachar] = useReducer(reducer, null, () => hidratar(carregarLocal()));
  const [sessao, setSessao] = useState(null);
  const [filtro, setFiltro] = useState(FILTRO_INICIAL);
  const [salvo, setSalvo] = useState(true);
  const [idioma, setIdioma] = useState(idiomaAtual);
  const [cursoVista, setCursoVista] = useState({}); // { modulo, aula, flashcards } aberto no curso
  const principal = useRef(null);

  useEffect(() => {
    carregarBanco().then(setBanco).catch((e) => setErro(e.message));
  }, []);
  // Acesso completo: o dono do artefato (quem publica o curso) ou, no futuro, uma assinatura ativa confirmada pelo servidor.
  const [acessoTotal, setAcessoTotal] = useState(() => window.__rxAcessoTotal === true);
  const [conta, setConta] = useState({ servidor: false, usuario: null, acesso: null });
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const u = window.claude?.use ? await window.claude.use('user') : null;
        if (vivo && u?.isOwner?.()) setAcessoTotal(true);
      } catch { /* sem visualizador: segue no plano gratuito */ }
      // No site próprio, a conta do aluno vem do servidor (/api/eu): plano pago ativo libera tudo.
      if (document.querySelector('meta[name="rx-servidor"]')) {
        try {
          const r = await fetch('/api/eu', { credentials: 'same-origin' });
          const dados = r.ok && (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
          if (vivo && dados) {
            setConta({ servidor: true, usuario: dados.usuario, acesso: dados.acesso });
            if (dados.acesso?.ativo) setAcessoTotal(true);
          }
        } catch { /* site estático sem servidor */ }
      }
    })();
    return () => { vivo = false; };
  }, []);
  useEffect(() => { setSalvo(salvarLocal(progresso)); }, [progresso]);
  useEffect(() => { definirIdioma(idioma); }, []);
  const trocarIdioma = (id) => { definirIdioma(id); setIdioma(id); };
  useEffect(() => {
    const aoMudar = () => setRota(rotaDoHash());
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const ir = useCallback((destino) => {
    setRota(destino);
    if (destino !== 'treino') {
      try { window.history.replaceState(null, '', `#${destino}`); } catch { /* visualizador sem histórico */ }
    }
    window.scrollTo({ top: 0 });
  }, []);

  const iniciarSessao = useCallback(({ titulo, ids, indice = 0, origem, fixas, origens }) => {
    if (!ids.length) return;
    setSessao({ chave: Date.now(), titulo, ids, indice, origem, fixas, origens });
    ir('treino');
  }, [ir]);

  const pendentes = useMemo(() => (banco ? revisoesPendentes(progresso).filter((id) => banco.porId[id]).length : 0),
    [progresso, banco]);
  const acesso = useMemo(() => situacaoAcesso(progresso, banco?.planos?.limitesGratis || LIMITES_PADRAO, acessoTotal),
    [progresso, banco, acessoTotal]);
  // Progresso na conta (site com servidor): ao entrar, junta o do navegador com o da conta; depois salva a cada mudança.
  const [sincronizado, setSincronizado] = useState(false);
  useEffect(() => {
    if (!conta.usuario || sincronizado) return;
    (async () => {
      try {
        const r = await fetch('/api/progresso', { credentials: 'same-origin' });
        if (r.ok) {
          const { dados } = await r.json();
          if (dados) despachar({ tipo: 'restaurar', estado: mesclarProgresso(progresso, dados) });
        }
      } catch { /* sem conexão: segue no navegador */ }
      setSincronizado(true);
    })();
  }, [conta.usuario, sincronizado]);
  useEffect(() => {
    if (!conta.usuario || !sincronizado) return undefined;
    const id = setTimeout(() => {
      fetch('/api/progresso', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dados: progresso }) })
        .catch(() => { /* tenta de novo na próxima mudança */ });
    }, 3000);
    return () => clearTimeout(id);
  }, [progresso, conta.usuario, sincronizado]);
  const contexto = { conta, acesso, banco, progresso, despachar, sessao, setSessao, ir, iniciarSessao, filtro, setFiltro, cursoVista, setCursoVista };
  const Tela = ROTAS[rota].tela;

  return (
    <Contexto.Provider value={contexto}>
      <a className="pular" href="#conteudo">{t('Pular para o conteúdo')}</a>
      <header className="topo">
        <div className="topo-interno">
          <button className="marca" onClick={() => ir('painel')} aria-label={t('RX ENAMED, ir ao painel')}>
            <span className="marca-simbolo" aria-hidden="true">RX</span>
            <span className="marca-nome">RX <em>ENAMED</em></span>
          </button>
          <nav className="navegacao" aria-label={t('Seções')}>
            {Object.entries(ROTAS).filter(([, r]) => !r.oculta).map(([id, r]) => (
              <button key={id} className={`nav-item ${rota === id ? 'ativo' : ''}`} aria-current={rota === id ? 'page' : undefined}
                onClick={() => ir(id)}>
                {t(r.titulo)}
                {id === 'trilha' && pendentes > 0 && <span className="contagem" aria-label={t('{n} pendentes', { n: pendentes })}>{pendentes}</span>}
                {id === 'simulado' && progresso.simuladoAtivo && <span className="contagem ponto-vivo" aria-label={t('em andamento')} />}
              </button>
            ))}
          </nav>
          <div className="idioma" role="group" aria-label={t('Idioma')}>
            {IDIOMAS.map((i) => (
              <button key={i.id} className={idioma === i.id ? 'ativo' : ''} aria-pressed={idioma === i.id} lang={i.locale}
                title={i.rotulo} onClick={() => trocarIdioma(i.id)}>{i.curto}</button>
            ))}
          </div>
          {conta.servidor && (
            <a className="sair" href={conta.usuario ? '/minha-conta' : `/entrar?voltar=${encodeURIComponent('/plataforma/index.html')}`}>
              <span>{conta.usuario ? t('Minha conta') : t('Entrar')}</span>
            </a>
          )}
          <a className="sair" href={enderecoLP(idioma)} title={t('Sair da área do aluno e voltar ao site')}>
            <Icone nome="sair" tamanho={16} /> <span>{t('Sair')}</span>
          </a>
        </div>
      </header>

      <main id="conteudo" ref={principal} className="conteudo" key={idioma}>
        {erro ? (
          <div className="vazio"><h3>{t('O banco de questões não carregou')}</h3><p>{erro} {t('Recarregue a página para tentar de novo.')}</p></div>
        ) : !banco ? (
          <div className="carregando" role="status">{t('Carregando questões…')}</div>
        ) : (
          <><VigiaDesafio /><Tela /></>
        )}
      </main>

      <footer className="rodape">
        <p>{t('Questões e gabaritos oficiais do Inep (Revalida). Classificação por especialidade e tema feita para este curso.')}
          {!salvo && ` ${t('Atenção: este navegador não está salvando o progresso (janela anônima ou armazenamento bloqueado).')}`}</p>
      </footer>
    </Contexto.Provider>
  );
}
