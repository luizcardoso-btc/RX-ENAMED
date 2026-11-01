import { useState, useEffect, useMemo } from '../react.js';
import { useApp, Icone, TagArea, Selo } from '../componentes.jsx';
import { infoArea } from '../data.js';
import {
  proficiencias, previsao, modulos, montarPlano, feitasHoje, proximoPasso, diasAte, chaveDoDia, ROTULO_EVIDENCIA, textoMotivo,
} from '../trilha.js';
import { t, idiomaAtual } from '../i18n.js';
import { plural } from '../util.js';
import { montarBaralho } from '../flashcards.js';

/** Calcula o estado da trilha e garante que exista um plano para hoje (gerado uma vez por dia). */
export function useTrilha() {
  const { banco, progresso, despachar, acesso } = useApp();
  // Desafio diário: no plano gratuito, o plano do dia tem exatamente as questões liberadas por dia (25).
  const metaDoDia = acesso?.completo ? progresso.trilha.metaDiaria : Math.min(acesso?.limites?.questoesDia || 25, 25);
  const profs = useMemo(() => proficiencias(progresso, banco.questoes), [progresso.respostas, banco]);
  const mods = useMemo(() => modulos(progresso, banco, profs), [progresso, banco, profs, idiomaAtual()]);
  const atual = mods.find((m) => m.status === 'andamento') || mods[mods.length - 1];
  const plano = progresso.trilha.plano;
  const planoValido = plano && plano.dia === chaveDoDia();

  useEffect(() => {
    if (!planoValido) {
      const novo = montarPlano(progresso, banco, profs, atual.id, metaDoDia, progresso.trilha.rodada);
      if (!acesso?.completo) novo.itens = novo.itens.slice(0, metaDoDia);
      despachar({ tipo: 'salvarPlano', plano: novo });
    }
  }, [planoValido]);

  const feitas = planoValido ? feitasHoje(progresso, plano) : new Set();
  return { profs, mods, atual, plano: planoValido ? plano : null, feitas };
}

export function iniciarPlano(iniciarSessao, plano, feitas) {
  const restantes = plano.itens.filter((i) => !feitas.has(i.id));
  const lista = restantes.length ? restantes : plano.itens;
  iniciarSessao({
    titulo: restantes.length ? t('Plano de hoje · {q}', { q: plural(lista.length, 'questão', 'questões') }) : t('Plano de hoje (refazendo)'),
    ids: lista.map((i) => i.id),
    origem: 'trilha',
    origens: Object.fromEntries(lista.map((i) => [i.id, i.tipo === 'revisao' ? 'revisao' : 'treino'])),
  });
}

const ROTULO_TIPO = { revisao: 'Revisão', nova: 'Inédita', refazer: 'Refazer' };

function Configuracao() {
  const { progresso, despachar } = useApp();
  const { dataProva, metaDiaria } = progresso.trilha;
  const dias = diasAte(dataProva);
  return (
    <div className="trilha-config">
      <label className="campo">
        <span className="rotulo-campo">{t('Data da sua prova')}</span>
        <input id="trilha-data" type="date" value={dataProva}
          onChange={(e) => despachar({ tipo: 'configurarTrilha', dados: { dataProva: e.target.value } })} />
      </label>
      <div className="campo">
        <span className="rotulo-campo">{t('Questões por dia')}</span>
        <div className="segmentado" role="group" aria-label={t('Meta diária')}>
          {[10, 20, 40, 80].map((n) => (
            <button key={n} className={metaDiaria === n ? 'ativo' : ''} aria-pressed={metaDiaria === n}
              onClick={() => despachar({ tipo: 'configurarTrilha', dados: { metaDiaria: n, plano: null } })}>{n}</button>
          ))}
        </div>
      </div>
      <div className="destino">
        <Icone nome="bandeira" />
        {dias === null ? <span>{t('Informe a data da prova para ver a contagem regressiva.')}</span>
          : dias < 0 ? <span>{t('A data informada já passou. Atualize para a próxima prova.')}</span>
            : <span><strong>{plural(dias, 'dia', 'dias')}</strong> {t('até a prova')}</span>}
      </div>
    </div>
  );
}

function Modulos({ mods, selecionado, selecionar }) {
  return (
    <ol className="modulos">
      {mods.map((m, i) => (
        <li key={m.id} className={`modulo modulo-${m.status} ${selecionado === m.id ? 'selecionado' : ''}`}>
          <button className="modulo-botao" onClick={() => selecionar(m.id)} aria-pressed={selecionado === m.id}>
            <span className="modulo-num" aria-hidden="true">{m.status === 'concluido' ? <Icone nome="check" tamanho={16} /> : i + 1}</span>
            <span className="modulo-texto">
              <span className="modulo-linha">
                <strong>{t('Módulo')} {i + 1} · {m.nome}</strong>
                <span className="modulo-status">{t({ concluido: 'Concluído', andamento: 'Em andamento', proximo: 'A seguir' }[m.status])}</span>
              </span>
              <span className="modulo-foco">{m.foco}</span>
              <span className="trilho-progresso"><span style={{ width: `${Math.round(m.progresso * 100)}%` }} /></span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Previsao({ profs }) {
  const p = previsao(profs);
  const conf = p.cobertura >= 0.7 ? 'boa' : p.cobertura >= 0.35 ? 'parcial' : 'baixa';
  const contagem = { consolidada: 0, preliminar: 0, sem: 0 };
  for (const x of profs) contagem[x.evidencia]++;
  const ini = Math.max(0, p.media - p.margem);
  const fim = Math.min(1, p.media + p.margem);
  return (
    <section className="cartao previsao">
      <span className="sobretitulo">{t('Previsão de acertos na prova')}</span>
      <div className="previsao-numero">
        <strong>{Math.round(p.media * 100)}%</strong>
        <span className="mudo">{t('entre {a}% e {b}%', { a: Math.round(ini * 100), b: Math.round(fim * 100) })}</span>
      </div>
      <div className="faixa" role="img" aria-label={t('Faixa provável de {a}% a {b}%', { a: Math.round(ini * 100), b: Math.round(fim * 100) })}>
        <span className="faixa-intervalo" style={{ left: `${ini * 100}%`, width: `${(fim - ini) * 100}%` }} />
        <span className="faixa-ponto" style={{ left: `${p.media * 100}%` }} />
        <span className="faixa-escala"><span>0</span><span>50%</span><span>100%</span></span>
      </div>
      <p className="mudo pequeno">
        {t('Média das suas estimativas por especialidade, pesada pelo quanto cada uma cai na prova.')}{' '}
        {t('Confiança {c}: você tem dados em especialidades que somam {p}% da prova.', { c: t(conf), p: Math.round(p.cobertura * 100) })}
      </p>
      <ul className="evidencias">
        <li><span className="evid evid-consolidada" />{contagem.consolidada} {t('consolidadas')}</li>
        <li><span className="evid evid-preliminar" />{contagem.preliminar} {t('preliminares')}</li>
        <li><span className="evid evid-sem" />{contagem.sem} {t('sem evidência')}</li>
      </ul>
    </section>
  );
}

function Leitura({ profs }) {
  const { ir, setFiltro } = useApp();
  const [ordem, setOrdem] = useState('peso');
  const [todas, setTodas] = useState(false);
  const lista = [...profs].sort(ordem === 'peso' ? (a, b) => b.peso - a.peso : (a, b) => a.media - b.media || b.peso - a.peso);
  return (
    <section className="secao">
      <div className="secao-cabecalho">
        <div>
          <h2>{t('Leitura por especialidade')}</h2>
          <p className="mudo">{t('Estimativa de acerto e quanto ela já é confiável. Sem dados, a estimativa parte de 50%.')}</p>
        </div>
        <div className="segmentado" role="group" aria-label={t('Ordenar')}>
          <button className={ordem === 'peso' ? 'ativo' : ''} aria-pressed={ordem === 'peso'} onClick={() => setOrdem('peso')}>{t('Mais cobradas')}</button>
          <button className={ordem === 'fraca' ? 'ativo' : ''} aria-pressed={ordem === 'fraca'} onClick={() => setOrdem('fraca')}>{t('Mais fracas')}</button>
        </div>
      </div>
      <div className="tabela-rolagem">
        <table className="tabela tabela-leitura">
          <thead><tr><th>{t('Especialidade')}</th><th>{t('Área')}</th><th className="num">{t('Peso')}</th><th>{t('Estimativa')}</th><th>{t('Evidência')}</th><th /></tr></thead>
          <tbody>
            {(todas ? lista : lista.slice(0, 12)).map((p) => (
              <tr key={p.especialidade}>
                <td>{t(p.especialidade)}</td>
                <td><TagArea area={p.area} /></td>
                <td className="num">{Math.round(p.peso * 100)}%</td>
                <td>
                  <span className="estimativa">
                    <span className="estimativa-trilho">
                      <span className={`estimativa-barra ${p.evidencia}`} style={{ width: `${Math.round(p.media * 100)}%`,
                        background: p.evidencia === 'sem' ? undefined : `var(--serie-${infoArea(p.area).cor})` }} />
                    </span>
                    <span className="num">{Math.round(p.media * 100)}%</span>
                  </span>
                </td>
                <td><span className={`evid-rotulo evid-${p.evidencia}`}>{t(ROTULO_EVIDENCIA[p.evidencia])}</span> <span className="mudo pequeno">{p.certas}/{p.resp}</span></td>
                <td><button className="botao-texto" onClick={() => { setFiltro((f) => ({ ...f, especialidade: p.especialidade, areas: [], edicoes: [] })); ir('questoes'); }}>{t('Treinar')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lista.length > 12 && (
        <button className="botao botao-largo" onClick={() => setTodas(!todas)}>
          {todas ? t('Mostrar só as 12 primeiras') : t('Mostrar todas as {n} especialidades', { n: lista.length })}
        </button>
      )}
    </section>
  );
}

export default function Trilha() {
  const { banco, progresso, despachar, iniciarSessao, ir } = useApp();
  const { profs, mods, atual, plano, feitas } = useTrilha();
  const [selecionado, setSelecionado] = useState(null);
  const [planoAberto, setPlanoAberto] = useState(false);
  const mod = mods.find((m) => m.id === (selecionado || atual.id));
  const indice = mods.indexOf(mod);
  const revisoes = plano ? plano.itens.filter((i) => i.tipo === 'revisao').length : 0;

  return (
    <div className="tela-trilha">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Trilha inteligente')}</span>
          <h1>{t('Sua trilha até o ENAMED')}</h1>
          <p className="mudo">{t('Cinco módulos na ordem certa, um plano por dia e a leitura do seu desempenho, tudo com o motivo de cada escolha.')}</p>
        </div>
      </header>

      <Configuracao />

      <div className="trilha-corpo">
        <aside className="trilha-lado">
          <Modulos mods={mods} selecionado={mod.id} selecionar={setSelecionado} />
          <section className="cartao modulo-detalhe">
            <span className="sobretitulo">{t('Módulo {n} de 5', { n: indice + 1 })} · {t({ concluido: 'concluído', andamento: 'em andamento', proximo: 'a seguir' }[mod.status])}</span>
            <h3>{mod.nome}</h3>
            <p>{mod.foco}</p>
            <dl className="classificacao">
              <div><dt>{t('Para concluir')}</dt><dd>{mod.criterio}</dd></div>
              <div><dt>{t('Agora')}</dt><dd>{mod.detalhe}</dd></div>
            </dl>
          </section>
        </aside>

        <div className="trilha-principal">
          <section className="cartao plano">
            <div className="plano-topo">
              <div>
                <span className="sobretitulo">{t('Plano de hoje · módulo {n}: {nome}', { n: mods.indexOf(atual) + 1, nome: atual.nome })}</span>
                <h2>{plano ? t('{n} de {total} feitas', { n: feitas.size, total: plano.itens.length }) : t('Montando o plano…')}</h2>
                {plano && <p className="mudo">{revisoes ? t('{r} primeiro, depois ', { r: plural(revisoes, 'revisão vencida', 'revisões vencidas') }) : ''}{t('questões escolhidas pelo peso na prova e pelo seu desempenho.')}</p>}
              </div>
              {plano && (
                <button className="botao botao-primario botao-grande" onClick={() => iniciarPlano(iniciarSessao, plano, feitas)}>
                  {t(feitas.size === 0 ? 'Começar' : feitas.size < plano.itens.length ? 'Continuar' : 'Refazer')} <Icone nome="direita" />
                </button>
              )}
            </div>
            {plano && (
              <>
                <span className="trilho-progresso largo"><span style={{ width: `${(feitas.size / plano.itens.length) * 100}%` }} /></span>
                <ol className="plano-itens">
                  {(planoAberto ? plano.itens : plano.itens.slice(0, 6)).map((item) => {
                    const q = banco.porId[item.id];
                    if (!q) return null;
                    return (
                      <li key={item.id} className={feitas.has(item.id) ? 'feito' : ''}>
                        <span className={`status ${feitas.has(item.id) ? 'status-certa' : ''}`}>{feitas.has(item.id) && <Icone nome="check" tamanho={14} />}</span>
                        <Selo tom={item.tipo === 'revisao' ? 'aviso' : 'neutro'}>{t(ROTULO_TIPO[item.tipo])}</Selo>
                        <span className="plano-q">Q{q.numero} · {q.rotulo}</span>
                        <span className="plano-motivo">{textoMotivo(item.motivo)}</span>
                      </li>
                    );
                  })}
                </ol>
                <div className="linha-botoes">
                  {plano.itens.length > 6 && (
                    <button className="botao-texto" onClick={() => setPlanoAberto(!planoAberto)}>
                      {planoAberto ? t('Mostrar menos') : t('Ver as {n} questões do plano', { n: plano.itens.length })}
                    </button>
                  )}
                  <button className="botao-texto" onClick={() => despachar({ tipo: 'configurarTrilha', dados: { plano: null, rodada: (progresso.trilha.rodada || 0) + 1 } })}>
                    <Icone nome="repetir" tamanho={16} /> {t('Montar outro plano')}
                  </button>
                  {(() => {
                    const agora = Date.now();
                    const vencidos = montarBaralho(banco).filter((c) => progresso.flashcards[c.id]?.proxima <= agora).length;
                    return (
                      <button className="botao-texto" onClick={() => ir('flashcards')}>
                        {vencidos ? t('{f} hoje', { f: plural(vencidos, 'flashcard vencido', 'flashcards vencidos') }) : t('Estudar flashcards')}
                      </button>
                    );
                  })()}
                  {atual.id === 'simulados' && (
                    <button className="botao-texto" onClick={() => ir('simulado')}>{t('Fazer um simulado de 50 questões')}</button>
                  )}
                </div>
              </>
            )}
          </section>

          <div className="grade-2">
            <Previsao profs={profs} />
            <section className="cartao proximo-passo">
              <span className="sobretitulo">{t('Próximo passo')}</span>
              <p>{proximoPasso(profs)}</p>
              <button className="botao-texto" onClick={() => ir('revisao')}>{t('Ver fila de revisão')}</button>
            </section>
          </div>
        </div>
      </div>

      <Leitura profs={profs} />
    </div>
  );
}
