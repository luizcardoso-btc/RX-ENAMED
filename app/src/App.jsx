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
import Perfil from './telas/Perfil.jsx';
import Indique from './telas/Indique.jsx';
import Simulador from './telas/Simulador.jsx';

// Rotas da área do aluno, agrupadas como aparecem no menu lateral.
const ROTAS = {
  painel: { titulo: 'Início', tela: Painel, icone: 'casa', grupo: 'Estudar' },
  desafio: { titulo: 'Desafio', tela: Desafio, icone: 'chama', grupo: 'Estudar' },
  cronograma: { titulo: 'Cronograma', tela: Cronograma, icone: 'calendario', grupo: 'Estudar' },
  curso: { titulo: 'Curso', tela: Curso, icone: 'livro', grupo: 'Estudar' },
  trilha: { titulo: 'Trilha', tela: Trilha, icone: 'bandeira', grupo: 'Estudar' },
  simulador: { titulo: 'Simulador clínico', tela: Simulador, icone: 'estetoscopio', grupo: 'Praticar' },
  questoes: { titulo: 'Questões', tela: Banco, icone: 'lista', grupo: 'Praticar' },
  flashcards: { titulo: 'Flashcards', tela: Flashcards, icone: 'cartas', grupo: 'Praticar' },
  simulado: { titulo: 'Simulado', tela: Simulado, icone: 'relogio', grupo: 'Praticar' },
  pratica: { titulo: 'Prática', tela: Pratica, icone: 'pessoas', grupo: 'Praticar' },
  raiox: { titulo: 'Raio-X', tela: RaioX, icone: 'raiox', grupo: 'Acompanhar' },
  desempenho: { titulo: 'Desempenho', tela: Desempenho, icone: 'grafico', grupo: 'Acompanhar' },
  planos: { titulo: 'Planos', tela: Planos, icone: 'estrela', grupo: 'Conta' },
  indique: { titulo: 'Indique e ganhe', tela: Indique, icone: 'pessoas', grupo: 'Conta' },
  perfil: { titulo: 'Meu perfil', tela: Perfil, icone: 'usuario', grupo: 'Conta' },
  revisao: { titulo: 'Revisão', tela: Revisao, oculta: true },
  treino: { titulo: 'Resolvendo', tela: Treino, oculta: true },
};
const GRUPOS = ['Estudar', 'Praticar', 'Acompanhar', 'Conta'];
const iniciais = (nome) => String(nome || '').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'RX';

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
  const [menuAberto, setMenuAberto] = useState(false);
  const [busca, setBusca] = useState('');
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
    setMenuAberto(false);
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
  // Sair: no site com servidor encerra a sessão; na prévia, volta para a página do curso.
  const sair = useCallback(async () => {
    if (conta.servidor) {
      try { await fetch('/api/sair', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* segue */ }
      window.location.href = '/';
      return;
    }
    window.location.href = enderecoLP(idioma);
  }, [conta.servidor, idioma]);
  // Fecha o menu do celular com Esc.
  useEffect(() => {
    if (!menuAberto) return undefined;
    const tecla = (e) => e.key === 'Escape' && setMenuAberto(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [menuAberto]);
  const contexto = { conta, acesso, banco, sair, progresso, despachar, sessao, setSessao, ir, iniciarSessao, filtro, setFiltro, cursoVista, setCursoVista };
  const Tela = ROTAS[rota].tela;

  return (
    <Contexto.Provider value={contexto}>
      <a className="pular" href="#conteudo">{t('Pular para o conteúdo')}</a>
      <div className={`casca${menuAberto ? ' menu-aberto' : ''}`}>
        {/* Barra fina do celular: abre o menu lateral */}
        <header className="topo-movel">
          <button className="botao-menu" onClick={() => setMenuAberto(true)} aria-label={t('Abrir menu')} aria-expanded={menuAberto} aria-controls="menu-lateral">
            <Icone nome="menu" tamanho={22} />
          </button>
          <button className="marca" onClick={() => ir('painel')} aria-label={t('RX ENAMED, ir ao painel')}>
            <span className="marca-simbolo" aria-hidden="true">RX</span>
            <span className="marca-nome">RX <em>ENAMED</em></span>
          </button>
          <button className="avatar-mini" onClick={() => ir('perfil')} aria-label={t('Meu perfil')}>{iniciais(conta.usuario?.nome)}</button>
        </header>
        <div className="menu-fundo" onClick={() => setMenuAberto(false)} aria-hidden="true" />

        <aside id="menu-lateral" className="lateral" aria-label={t('Menu da área do aluno')}>
          <div className="lateral-topo">
            <button className="marca" onClick={() => ir('painel')} aria-label={t('RX ENAMED, ir ao painel')}>
              <span className="marca-simbolo" aria-hidden="true">RX</span>
              <span className="marca-nome">RX <em>ENAMED</em></span>
            </button>
            <button className="botao-fechar-menu" onClick={() => setMenuAberto(false)} aria-label={t('Fechar menu')}><Icone nome="x" /></button>
          </div>

          <button className={`perfil-mini${rota === 'perfil' ? ' ativo' : ''}`} onClick={() => ir('perfil')}>
            <span className="avatar">{iniciais(conta.usuario?.nome)}</span>
            <span className="perfil-mini-texto">
              <strong>{conta.usuario?.nome?.split(' ')[0] || t('Visitante')}</strong>
              <span className={`selo-plano${acesso.completo ? ' pago' : ''}`}>{acesso.completo ? t('Acesso completo') : t('Plano gratuito')}</span>
            </span>
          </button>

          <form className="busca-lateral" role="search" onSubmit={(e) => {
            e.preventDefault();
            if (!busca.trim()) return;
            setFiltro({ ...FILTRO_INICIAL, busca: busca.trim() });
            ir('questoes');
          }}>
            <Icone nome="lupa" tamanho={16} />
            <input id="busca-lateral" type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder={t('Pesquisar tema ou questão')} aria-label={t('Pesquisar tema ou questão no banco')} />
          </form>

          <nav className="navegacao" aria-label={t('Seções')}>
            {GRUPOS.map((g) => (
              <div key={g} className="grupo-nav">
                <span className="grupo-nav-titulo">{t(g)}</span>
                {Object.entries(ROTAS).filter(([, r]) => !r.oculta && r.grupo === g).map(([id, r]) => (
                  <button key={id} className={`nav-item ${rota === id ? 'ativo' : ''}`} aria-current={rota === id ? 'page' : undefined} onClick={() => ir(id)}>
                    <Icone nome={r.icone} tamanho={18} />
                    <span className="nav-rotulo">{t(r.titulo)}</span>
                    {id === 'trilha' && pendentes > 0 && <span className="contagem" aria-label={t('{n} pendentes', { n: pendentes })}>{pendentes}</span>}
                    {id === 'simulado' && progresso.simuladoAtivo && <span className="contagem ponto-vivo" aria-label={t('em andamento')} />}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="lateral-rodape">
            <div className="idioma" role="group" aria-label={t('Idioma')}>
              {IDIOMAS.map((i) => (
                <button key={i.id} className={idioma === i.id ? 'ativo' : ''} aria-pressed={idioma === i.id} lang={i.locale}
                  title={i.rotulo} onClick={() => trocarIdioma(i.id)}>{i.curto}</button>
              ))}
            </div>
            <button className="sair" onClick={sair} title={t('Sair da área do aluno')}>
              <Icone nome="sair" tamanho={16} /> <span>{t('Sair')}</span>
            </button>
          </div>
        </aside>

        <div className="principal">
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
        </div>
      </div>
    </Contexto.Provider>
  );
}
