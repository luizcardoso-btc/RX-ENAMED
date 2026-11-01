import { useState, useMemo } from '../react.js';
import { useApp, Icone, TagArea, Vazio, Estrela } from '../componentes.jsx';
import { AREAS, FILTRO_INICIAL, filtrarQuestoes } from '../data.js';
import { ultimaResposta } from '../progresso.js';
import { embaralhar, plural } from '../util.js';
import { t, idiomaAtual } from '../i18n.js';

const SITUACOES = [
  ['todas', 'Todas'],
  ['nao-respondidas', 'Não respondidas'],
  ['erradas', 'Errei'],
  ['acertadas', 'Acertei'],
  ['marcadas', 'Marcadas'],
];

function alternar(lista, valor) {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
}

function resumoDoEnunciado(q) {
  const texto = q.enunciado.replace(/\[FIG:\d+\]/g, ' ').replace(/\s+/g, ' ').trim();
  return texto.length > 170 ? `${texto.slice(0, 170)}…` : texto;
}

export default function Banco() {
  const { banco, progresso, filtro, setFiltro, iniciarSessao } = useApp();
  const [aleatorio, setAleatorio] = useState(false);
  const [limite, setLimite] = useState(40);
  const f = filtro;
  const set = (dados) => { setFiltro({ ...f, ...dados }); setLimite(40); };

  const resultado = useMemo(() => filtrarQuestoes(banco.questoes, f, progresso), [banco, f, progresso]);
  const especialidades = useMemo(() => {
    const base = f.areas.length ? banco.questoes.filter((q) => f.areas.includes(q.area)) : banco.questoes;
    return [...new Set(base.map((q) => q.especialidade))].sort((a, b) => t(a).localeCompare(t(b), idiomaAtual()));
  }, [banco, f.areas]);
  const filtrosAtivos = JSON.stringify(f) !== JSON.stringify(FILTRO_INICIAL);

  const comecar = (indice = 0) => {
    const ids = resultado.map((q) => q.id);
    const lista = aleatorio && indice === 0 ? embaralhar(ids) : ids;
    iniciarSessao({ titulo: t('{q} do banco', { q: plural(lista.length, 'questão', 'questões') }), ids: lista, indice, origem: 'treino' });
  };

  return (
    <div className="tela-banco">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Banco de questões')}</span>
          <h1>{t('Questões oficiais do Inep')}</h1>
          <p className="mudo">{t('{q} de {edicoes}, com gabarito definitivo.', { q: plural(banco.questoes.length, 'questão', 'questões'), edicoes: banco.edicoes.map((e) => e.rotulo).join(t(' e ')) })}</p>
          {idiomaAtual() === 'es' && <p className="aviso-idioma">{t('As questões aparecem em português, como na prova do Inep.')}</p>}
        </div>
      </header>

      <section className="filtros" aria-label={t('Filtros')}>
        <div className="filtro-grupo">
          <span className="rotulo-campo">{t('Prova')}</span>
          <div className="chips">
            {banco.edicoes.map((e) => (
              <button key={e.id} className={`chip ${f.edicoes.includes(e.id) ? 'ativo' : ''}`}
                aria-pressed={f.edicoes.includes(e.id)} onClick={() => set({ edicoes: alternar(f.edicoes, e.id) })}>
                {e.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="filtro-grupo">
          <span className="rotulo-campo">{t('Grande área')}</span>
          <div className="chips">
            {AREAS.map((a) => (
              <button key={a.nome} className={`chip ${f.areas.includes(a.nome) ? 'ativo' : ''}`}
                aria-pressed={f.areas.includes(a.nome)}
                onClick={() => set({ areas: alternar(f.areas, a.nome), especialidade: '' })}>
                <span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.curto)}
              </button>
            ))}
          </div>
        </div>
        <div className="filtro-linha">
          <label className="campo">
            <span className="rotulo-campo">{t('Especialidade')}</span>
            <select id="filtro-especialidade" value={f.especialidade} onChange={(e) => set({ especialidade: e.target.value })}>
              <option value="">{t('Todas')}</option>
              {especialidades.map((e) => <option key={e} value={e}>{t(e)}</option>)}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo-campo">{t('O que a questão cobra')}</span>
            <select id="filtro-tipo" value={f.tipo} onChange={(e) => set({ tipo: e.target.value })}>
              <option value="">{t('Tudo')}</option>
              {banco.tipos.map((tp) => <option key={tp} value={tp}>{t(tp)}</option>)}
            </select>
          </label>
          <label className="campo">
            <span className="rotulo-campo">{t('Dificuldade')}</span>
            <select id="filtro-dificuldade" value={f.dificuldade} onChange={(e) => set({ dificuldade: e.target.value })}>
              <option value="">{t('Todas')}</option>
              <option value="fácil">{t('Fácil')}</option>
              <option value="média">{t('Média')}</option>
              <option value="difícil">{t('Difícil')}</option>
            </select>
          </label>
          <label className="campo">
            <span className="rotulo-campo">{t('Incidência')}</span>
            <select id="filtro-incidencia" value={f.incidencia} onChange={(e) => set({ incidencia: e.target.value })}>
              <option value="">{t('Todas')}</option>
              <option value="alta">{t('Alta')}</option>
              <option value="média">{t('Média')}</option>
              <option value="baixa">{t('Baixa')}</option>
            </select>
          </label>
          <label className="campo campo-busca">
            <span className="rotulo-campo">{t('Buscar no texto')}</span>
            <input id="filtro-busca" type="search" value={f.busca} placeholder={t('ex.: sífilis, BI-RADS, Glasgow')}
              onChange={(e) => set({ busca: e.target.value })} />
          </label>
        </div>
        <div className="filtro-linha">
          <div className="segmentado" role="group" aria-label={t('Situação')}>
            {SITUACOES.map(([valor, rotulo]) => (
              <button key={valor} className={f.situacao === valor ? 'ativo' : ''} aria-pressed={f.situacao === valor}
                onClick={() => set({ situacao: valor })}>{t(rotulo)}</button>
            ))}
          </div>
          <label className="alternador">
            <input id="filtro-figuras" type="checkbox" checked={f.figuras} onChange={(e) => set({ figuras: e.target.checked })} />
            {t('Só com imagem ou tabela')}
          </label>
          <label className="alternador">
            <input id="filtro-anuladas" type="checkbox" checked={f.anuladas} onChange={(e) => set({ anuladas: e.target.checked })} />
            {t('Incluir anuladas')}
          </label>
          {filtrosAtivos && <button className="botao-texto" onClick={() => set(FILTRO_INICIAL)}>{t('Limpar filtros')}</button>}
        </div>
      </section>

      <div className="barra-resultado">
        <strong>{plural(resultado.length, 'questão encontrada', 'questões encontradas')}</strong>
        <div className="linha-botoes">
          <label className="alternador">
            <input id="banco-aleatorio" type="checkbox" checked={aleatorio} onChange={(e) => setAleatorio(e.target.checked)} />
            <Icone nome="embaralhar" tamanho={16} /> {t('Embaralhar')}
          </label>
          <button className="botao botao-primario" disabled={!resultado.length} onClick={() => comecar(0)}>
            {t('Resolver')} {resultado.length > 0 ? plural(resultado.length, 'questão', 'questões') : ''}
          </button>
        </div>
      </div>

      {resultado.length === 0 ? (
        <Vazio titulo={t('Nenhuma questão com esses filtros')}
          acao={<button className="botao" onClick={() => set(FILTRO_INICIAL)}>{t('Limpar filtros')}</button>}>
          {t('Tire um ou mais filtros para ver mais questões.')}
        </Vazio>
      ) : (
        <ul className="lista-questoes">
          {resultado.slice(0, limite).map((q, i) => {
            const r = ultimaResposta(progresso, q.id);
            const status = q.anulada ? 'anulada' : !r ? 'nova' : r.certa ? 'certa' : 'errada';
            return (
              <li key={q.id}>
                <button className="linha-questao" onClick={() => comecar(i)}>
                  <span className={`status status-${status}`} title={t({ nova: 'Não respondida', certa: 'Você acertou', errada: 'Você errou', anulada: 'Anulada' }[status])}>
                    {status === 'certa' ? <Icone nome="check" tamanho={14} /> : status === 'errada' ? <Icone nome="x" tamanho={14} /> : status === 'anulada' ? '∅' : ''}
                  </span>
                  <span className="linha-num">Q{q.numero}</span>
                  <span className="linha-prova">{q.rotulo}</span>
                  <TagArea area={q.area} />
                  <span className="linha-especialidade">{t(q.especialidade)}</span>
                  {progresso.marcadas[q.id] && <span className="linha-marca" title={t('Marcada')}><Estrela cheia /></span>}
                  <span className="linha-texto">{resumoDoEnunciado(q)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {resultado.length > limite && (
        <button className="botao botao-largo" onClick={() => setLimite(limite + 60)}>
          {t('Mostrar mais ({n} restantes)', { n: resultado.length - limite })}
        </button>
      )}
    </div>
  );
}
