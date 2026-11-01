import { useState, useEffect, useMemo } from '../react.js';
import { useApp, Icone, TagArea, Numero, Vazio, Enunciado, Selo } from '../componentes.jsx';
import { AREAS, infoArea } from '../data.js';
import { NOTAS, montarBaralho, filaDeEstudo, situacaoCartao } from '../flashcards.js';
import { LETRAS, plural } from '../util.js';
import { t, tc } from '../i18n.js';

const BARALHOS = [
  ['todos', 'Todos'],
  ['conceito', 'Conceitos-chave'],
  ['questao', 'Casos das provas'],
];

function Frente({ cartao }) {
  const { banco } = useApp();
  if (cartao.tipo === 'conceito') {
    return (
      <div className="fc-face">
        <span className="sobretitulo">{t('Conceito-chave')} · {t(cartao.especialidade)}</span>
        <p className="fc-pergunta">{tc(cartao, 'frente')}</p>
      </div>
    );
  }
  const q = banco.porId[cartao.questaoId];
  return (
    <div className="fc-face">
      <span className="sobretitulo">{t('Caso de prova')} · {q.rotulo} · {t('questão')} {q.numero}</span>
      <Enunciado q={q} />
      <p className="fc-instrucao">{t('Pense na resposta antes de virar. As alternativas ficam ocultas.')}</p>
    </div>
  );
}

function Verso({ cartao, abrirQuestao }) {
  const { banco } = useApp();
  if (cartao.tipo === 'conceito') {
    const questoes = (cartao.questoes || []).map((id) => banco.porId[id]).filter(Boolean);
    return (
      <div className="fc-face fc-verso">
        <span className="sobretitulo">{t('Resposta')}</span>
        <p className="fc-resposta">{tc(cartao, 'verso')}</p>
        {questoes.length > 0 && (
          <div className="fc-origem">
            <span className="rotulo-campo">{t('Caiu assim na prova')}</span>
            <div className="chips">
              {questoes.map((q) => (
                <button key={q.id} className="chip" onClick={() => abrirQuestao(q.id)}>{q.rotulo} · Q{q.numero}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
  const q = banco.porId[cartao.questaoId];
  const indice = LETRAS.indexOf(q.gabarito);
  return (
    <div className="fc-face fc-verso">
      <span className="sobretitulo">{t('Gabarito oficial')}</span>
      <p className="fc-resposta"><span className="bolha bolha-certa" aria-hidden="true">{q.gabarito}</span> {q.alternativas[indice]}</p>
      <dl className="classificacao">
        <div><dt>{t('Tema')}</dt><dd>{q.tema}</dd></div>
        <div><dt>{t('Cobra')}</dt><dd>{t(q.tipo)}</dd></div>
      </dl>
      <button className="botao-texto" onClick={() => abrirQuestao(q.id)}>{t('Ver a questão com as alternativas')}</button>
    </div>
  );
}

export function Sessao({ fila: filaInicial, sair }) {
  const { despachar, iniciarSessao } = useApp();
  const [fila, setFila] = useState(filaInicial);
  const [virado, setVirado] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const cartao = fila[0];

  const avaliar = (nota) => {
    despachar({ tipo: 'avaliarCartao', id: cartao.id, nota });
    setFeitos((n) => n + 1);
    setVirado(false);
    // "Errei" volta para o fim da fila desta sessão.
    setFila((f) => (nota === 'errei' ? [...f.slice(1), f[0]] : f.slice(1)));
  };

  useEffect(() => {
    if (!cartao) return undefined;
    const tecla = (e) => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === ' ' || e.key === 'Enter') && !virado) { e.preventDefault(); setVirado(true); }
      else if (virado && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); avaliar(NOTAS[Number(e.key) - 1].id); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });
  useEffect(() => { window.scrollTo({ top: 0 }); }, [cartao?.id, virado]);

  if (!cartao) {
    return (
      <div className="fc-sessao">
        <Vazio titulo={t('Sessão concluída')} acao={<button className="botao botao-primario" onClick={sair}>{t('Voltar aos flashcards')}</button>}>
          {t('Você revisou {c}. Os próximos aparecem no dia certo.', { c: plural(feitos, 'cartão', 'cartões') })}
        </Vazio>
      </div>
    );
  }

  return (
    <div className="fc-sessao">
      <div className="barra-sessao">
        <div>
          <span className="sobretitulo">{t('Flashcards')}</span>
          <h2 className="titulo-sessao">{plural(fila.length, 'cartão restante', 'cartões restantes')}</h2>
        </div>
        <button className="botao" onClick={sair}>{t('Encerrar')}</button>
      </div>
      <article className={`fc-cartao ${virado ? 'virado' : ''}`} aria-live="polite">
        <div className="fc-topo">
          <TagArea area={cartao.area} />
          {cartao.incidencia === 'alta' && <Selo tom="destaque">{t('Alta incidência')}</Selo>}
        </div>
        <Frente cartao={cartao} />
        {virado && <Verso cartao={cartao} abrirQuestao={(id) => iniciarSessao({ titulo: t('Questão do flashcard'), ids: [id], origem: 'treino' })} />}
      </article>
      {virado ? (
        <div className="fc-notas" role="group" aria-label={t('Como foi?')}>
          {NOTAS.map((n) => (
            <button key={n.id} className={`botao fc-nota fc-nota-${n.id}`} onClick={() => avaliar(n.id)}>
              <strong>{t(n.rotulo)}</strong><span>{t(n.dica)}</span><kbd>{n.tecla}</kbd>
            </button>
          ))}
        </div>
      ) : (
        <button className="botao botao-primario botao-grande fc-virar" onClick={() => setVirado(true)}>
          {t('Mostrar resposta')} <kbd>{t('Espaço')}</kbd>
        </button>
      )}
    </div>
  );
}

export default function Flashcards() {
  const { banco, progresso } = useApp();
  const [baralho, setBaralho] = useState('todos');
  const [areas, setAreas] = useState([]);
  const [especialidade, setEspecialidade] = useState('');
  const [soAlta, setSoAlta] = useState(false);
  const [novos, setNovos] = useState(20);
  const [fila, setFila] = useState(null);
  const todos = useMemo(() => montarBaralho(banco), [banco]);
  const estados = progresso.flashcards;

  const filtrados = todos.filter((c) => (baralho === 'todos' || c.tipo === baralho)
    && (!areas.length || areas.includes(c.area))
    && (!especialidade || c.especialidade === especialidade)
    && (!soAlta || c.tipo === 'conceito' || c.incidencia === 'alta'));
  const contagem = { novo: 0, aprendendo: 0, dominado: 0 };
  for (const c of filtrados) contagem[situacaoCartao(estados[c.id])]++;
  const agora = Date.now();
  const devidos = filtrados.filter((c) => estados[c.id] && estados[c.id].proxima <= agora).length;

  const materias = useMemo(() => {
    const m = new Map();
    for (const c of filtrados) {
      const g = m.get(c.especialidade) || { nome: c.especialidade, area: c.area, total: 0, devidos: 0, dominados: 0 };
      g.total++;
      if (estados[c.id]?.proxima <= agora) g.devidos++;
      if (situacaoCartao(estados[c.id]) === 'dominado') g.dominados++;
      m.set(c.especialidade, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [filtrados.length, baralho, areas.join(), especialidade, soAlta, estados]);

  if (fila) return <Sessao fila={fila} sair={() => setFila(null)} />;

  return (
    <div className="tela-flashcards">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Flashcards')}</span>
          <h1>{t('Memorize o que mais cai')}</h1>
          <p className="mudo">{t('{c} ligados às questões oficiais e um cartão para cada caso das provas. Você dá a nota e a revisão espaçada decide quando cada cartão volta.', { c: plural(banco.cartoes.length, 'conceito-chave', 'conceitos-chave') })}</p>
        </div>
      </header>

      <section className="filtros">
        <div className="filtro-linha">
          <div className="segmentado" role="group" aria-label={t('Baralho')}>
            {BARALHOS.map(([id, rotulo]) => (
              <button key={id} className={baralho === id ? 'ativo' : ''} aria-pressed={baralho === id} onClick={() => setBaralho(id)}>{t(rotulo)}</button>
            ))}
          </div>
          <label className="alternador">
            <input id="fc-alta" type="checkbox" checked={soAlta} onChange={(e) => setSoAlta(e.target.checked)} /> {t('Só alta incidência')}
          </label>
          {especialidade && <button className="botao-texto" onClick={() => setEspecialidade('')}>{t('Todas as matérias')}</button>}
        </div>
        <div className="chips">
          {AREAS.map((a) => (
            <button key={a.nome} className={`chip ${areas.includes(a.nome) ? 'ativo' : ''}`} aria-pressed={areas.includes(a.nome)}
              onClick={() => { setAreas(areas.includes(a.nome) ? areas.filter((x) => x !== a.nome) : [...areas, a.nome]); setEspecialidade(''); }}>
              <span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.curto)}
            </button>
          ))}
        </div>
      </section>

      <div className="numeros">
        <Numero rotulo={t('Para revisar hoje')} valor={devidos} detalhe={t('cartões vencidos')} />
        <Numero rotulo={t('Novos')} valor={contagem.novo} detalhe={t('ainda não estudados')} />
        <Numero rotulo={t('Aprendendo')} valor={contagem.aprendendo} detalhe={t('intervalo menor que 21 dias')} />
        <Numero rotulo={t('Dominados')} valor={contagem.dominado} detalhe={t('intervalo de 21 dias ou mais')} />
      </div>

      <section className="cartao fc-comecar">
        <div>
          <h2>{especialidade ? t(especialidade) : t('Sessão de hoje')}</h2>
          <p className="mudo">{t('Primeiro os cartões vencidos, depois os novos.')}</p>
        </div>
        <div className="linha-botoes">
          <div className="segmentado" role="group" aria-label={t('Cartões novos por sessão')}>
            {[10, 20, 40].map((n) => (
              <button key={n} className={novos === n ? 'ativo' : ''} aria-pressed={novos === n} onClick={() => setNovos(n)}>{n} {t('novos')}</button>
            ))}
          </div>
          <button className="botao botao-primario botao-grande" disabled={!devidos && !contagem.novo}
            onClick={() => setFila(filaDeEstudo(filtrados, estados, { novos }))}>
            {t('Estudar')} {devidos ? `${devidos} + ` : ''}{Math.min(novos, contagem.novo)} <Icone nome="direita" />
          </button>
        </div>
      </section>

      <section className="secao">
        <h2>{t('Matérias')}</h2>
        <div className="grade-materias">
          {materias.map((m) => (
            <button key={m.nome} className={`materia ${especialidade === m.nome ? 'ativo' : ''}`} onClick={() => setEspecialidade(m.nome)}>
              <span className="materia-topo"><span className="ponto" style={{ background: `var(--serie-${infoArea(m.area).cor})` }} aria-hidden="true" />{t(m.nome)}</span>
              <span className="materia-numeros">
                <span>{plural(m.total, 'cartão', 'cartões')}</span>
                {m.devidos > 0 && <span className="materia-devidos">{t('{n} para hoje', { n: m.devidos })}</span>}
              </span>
              <span className="trilho-progresso"><span style={{ width: `${(m.dominados / m.total) * 100}%` }} /></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
