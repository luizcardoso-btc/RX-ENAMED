import { useState, useMemo } from '../react.js';
import { useApp, ListaBarras, Numero, TagArea } from '../componentes.jsx';
import { AREAS, infoArea, idEdicao } from '../data.js';
import { ultimaResposta } from '../progresso.js';
import { plural, pct } from '../util.js';
import { t } from '../i18n.js';

function contar(lista, chave) {
  const m = new Map();
  for (const item of lista) {
    const k = chave(item);
    if (k) m.set(k, (m.get(k) || []).concat(item));
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'));
}

function areaPredominante(qs) {
  return contar(qs, (q) => q.area)[0][0];
}

/** As 100 questões do caderno como uma grade, coloridas pela grande área. */
function MapaCaderno({ questoes }) {
  return (
    <div className="mapa-caderno">
      <div className="mapa-grade" role="img"
        aria-label={t('Mapa do caderno: as áreas se alternam a cada questão, de 5 em 5, do início ao fim da prova')}>
        {questoes.map((q) => (
          <span key={q.id} className={`mapa-celula cor-${infoArea(q.area).cor} ${q.anulada ? 'anulada' : ''}`}
            style={{ background: `var(--serie-${infoArea(q.area).cor})` }}
            title={`Q${q.numero} · ${t(infoArea(q.area).curto)} · ${t(q.especialidade)}${q.anulada ? ` · ${t('anulada')}` : ''}`}>
            {q.numero}
          </span>
        ))}
      </div>
      <ul className="legenda">
        {AREAS.map((a) => (
          <li key={a.nome}><span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.curto)}</li>
        ))}
        <li><span className="ponto riscado" aria-hidden="true" />{t('Anulada')}</li>
      </ul>
    </div>
  );
}

const NIVEL = { 'fácil': 1, 'média': 2, 'difícil': 3 };
const ORDEM_INCIDENCIA = { alta: 3, 'média': 2, baixa: 1 };

/** Cada matéria (especialidade) com peso, incidência, dificuldade média e o acerto do aluno. */
function MateriasQualificadas({ qs, progresso, treinar }) {
  const [todas, setTodas] = useState(false);
  const validas = qs.filter((q) => !q.anulada);
  const linhas = contar(validas, (q) => q.especialidade).map(([nome, lista]) => {
    let resp = 0;
    let certas = 0;
    for (const q of lista) {
      const r = ultimaResposta(progresso, q.id);
      if (r) { resp++; if (r.certa) certas++; }
    }
    const dif = lista.reduce((s, q) => s + (NIVEL[q.dificuldade] || 2), 0) / lista.length;
    const incidencia = lista.reduce((m, q) => (ORDEM_INCIDENCIA[q.incidencia] > ORDEM_INCIDENCIA[m] ? q.incidencia : m), 'baixa');
    return { nome, lista, area: areaPredominante(lista), peso: lista.length / validas.length, dif, incidencia, resp, certas };
  });
  return (
    <section className="secao">
      <h2>{t('Matérias qualificadas')}</h2>
      <p className="mudo">{t('Cada matéria com o peso na prova, a incidência (temas que voltam entre edições), a dificuldade média das questões e o seu acerto.')}</p>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead><tr><th>{t('Matéria')}</th><th>{t('Área')}</th><th className="num">{t('Questões')}</th><th className="num">{t('Peso')}</th><th>{t('Incidência')}</th><th>{t('Dificuldade')}</th><th className="num">{t('Seu acerto')}</th><th /></tr></thead>
          <tbody>
            {(todas ? linhas : linhas.slice(0, 15)).map((l) => (
              <tr key={l.nome}>
                <td>{t(l.nome)}</td>
                <td><TagArea area={l.area} /></td>
                <td className="num">{l.lista.length}</td>
                <td className="num">{(l.peso * 100).toFixed(1).replace('.', ',')}%</td>
                <td><span className={`inc inc-${l.incidencia === 'média' ? 'media' : l.incidencia}`}>{t(l.incidencia[0].toUpperCase() + l.incidencia.slice(1))}</span></td>
                <td><span className="medidor-dif" aria-label={t('Dificuldade {d} de 3', { d: l.dif.toFixed(1) })}>
                  {[1, 2, 3].map((n) => <span key={n} className={l.dif >= n - 0.5 ? 'cheio' : ''} />)}
                </span></td>
                <td className="num">{l.resp ? `${pct(l.certas, l.resp)}% (${l.certas}/${l.resp})` : '—'}</td>
                <td><button className="botao-texto" onClick={() => treinar(l.nome)}>{t('Treinar')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.length > 15 && (
        <button className="botao botao-largo" onClick={() => setTodas(!todas)}>{todas ? t('Mostrar só as 15 primeiras') : t('Mostrar todas as {n} matérias', { n: linhas.length })}</button>
      )}
    </section>
  );
}

export default function RaioX() {
  const { banco, progresso, ir, setFiltro } = useApp();
  const [edicao, setEdicao] = useState('todas');
  const [areaEsp, setAreaEsp] = useState('');
  const qs = useMemo(() => (edicao === 'todas' ? banco.questoes : banco.questoes.filter((q) => idEdicao(q) === edicao)),
    [banco, edicao]);
  const validas = qs.filter((q) => !q.anulada);
  const edMapa = edicao === 'todas' ? banco.edicoes[banco.edicoes.length - 1].id : edicao;
  const caderno = banco.questoes.filter((q) => idEdicao(q) === edMapa).sort((a, b) => a.numero - b.numero);

  const especialidades = contar(areaEsp ? qs.filter((q) => q.area === areaEsp) : qs, (q) => q.especialidade);
  const itensEsp = especialidades.slice(0, 15).map(([nome, lista]) => ({
    chave: nome, rotulo: t(nome), valor: lista.length, cor: infoArea(areaPredominante(lista)).cor,
    dica: `${t(nome)}: ${plural(lista.length, 'questão', 'questões')} (${t('{p}% da prova', { p: pct(lista.length, qs.length) })})`,
  }));
  const tipos = contar(qs, (q) => q.tipo).map(([nome, lista]) => ({
    chave: nome, rotulo: t(nome), valor: lista.length, dica: `${t(nome)}: ${plural(lista.length, 'questão', 'questões')}`,
  }));
  const repetidos = contar(banco.questoes, (q) => q.tema)
    .filter(([, lista]) => new Set(lista.map(idEdicao)).size > 1 || lista.length > 2)
    .filter(([, lista]) => edicao === 'todas' || lista.some((q) => idEdicao(q) === edicao));
  const comConduta = qs.filter((q) => /conduta/i.test(q.tipo)).length;
  const resumoTipos = tipos.length
    ? t('{tipo} é o pedido mais comum ({p}%). Somando as questões que pedem conduta, são {c}% da prova: treine decidir o próximo passo, não só reconhecer o diagnóstico.', { tipo: tipos[0].rotulo, p: pct(tipos[0].valor, qs.length), c: pct(comConduta, qs.length) })
    : '';
  const casoClinico = qs.filter((q) => q.caso_clinico).length;
  const comFigura = qs.filter((q) => q.figuras.length).length;
  const palavras = Math.round(qs.reduce((n, q) => n + q.enunciado.split(/\s+/).length, 0) / (qs.length || 1));

  // Prioridade = peso da especialidade na prova × chance estimada de errar (acertos suavizados).
  const prioridades = contar(validas, (q) => q.especialidade).map(([nome, lista]) => {
    let resp = 0;
    let certas = 0;
    for (const q of lista) {
      const r = ultimaResposta(progresso, q.id);
      if (r) { resp++; if (r.certa) certas++; }
    }
    const acerto = (certas + 1) / (resp + 2);
    return { nome, lista, resp, certas, peso: lista.length / validas.length, nota: (lista.length / validas.length) * (1 - acerto) };
  }).sort((a, b) => b.nota - a.nota).slice(0, 8);
  const personalizado = prioridades.some((p) => p.resp > 0);
  const treinar = (especialidade) => { setFiltro((f) => ({ ...f, especialidade, areas: [], edicoes: [] })); ir('questoes'); };

  return (
    <div className="tela-raiox">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Raio-X da prova')}</span>
          <h1>{t('O que o Inep cobra, questão por questão')}</h1>
          <p className="mudo">{t('Cada questão oficial foi lida e classificada por especialidade, tema e tipo de cobrança.')}{' '}
            {t('Base atual:')} {banco.edicoes.map((e) => e.rotulo).join(t(' e '))} · {plural(banco.questoes.length, 'questão', 'questões')}.</p>
        </div>
      </header>

      <div className="segmentado" role="group" aria-label={t('Edição analisada')}>
        <button className={edicao === 'todas' ? 'ativo' : ''} aria-pressed={edicao === 'todas'} onClick={() => setEdicao('todas')}>{t('Todas')}</button>
        {banco.edicoes.map((e) => (
          <button key={e.id} className={edicao === e.id ? 'ativo' : ''} aria-pressed={edicao === e.id} onClick={() => setEdicao(e.id)}>{e.rotulo}</button>
        ))}
      </div>

      <section className="secao grade-2">
        <div>
          <h2>{t('Como o caderno é montado')}</h2>
          <p>{t('São 20 questões de cada grande área, em rodízio fixo: a questão 1 é de Clínica Médica, a 2 de Cirurgia, a 3 de Pediatria, a 4 de Ginecologia e Obstetrícia e a 5 de Medicina de Família e Saúde Coletiva. O ciclo se repete até a questão 100. Saber disso ajuda a ler o enunciado já sabendo de que área ele vem.')}</p>
          <p className="mudo pequeno">{t('Padrão conferido nas edições 2023.1, 2023.2, 2024.1 e 2024.2. Mapa ao lado: {ed}.', { ed: banco.edicoes.find((e) => e.id === edMapa).rotulo })}</p>
        </div>
        <MapaCaderno questoes={caderno} />
      </section>

      <div className="numeros">
        <Numero rotulo={t('Casos clínicos')} valor={`${pct(casoClinico, qs.length)}%`} detalhe={t('enunciados com paciente descrito')} />
        <Numero rotulo={t('Com imagem ou tabela')} valor={`${pct(comFigura, qs.length)}%`} detalhe={t('ECG, radiografia, exames, gráficos')} />
        <Numero rotulo={t('Tamanho do enunciado')} valor={palavras} detalhe={t('palavras em média')} />
        <Numero rotulo={t('Anuladas')} valor={qs.filter((q) => q.anulada).length} detalhe={t('de {n} questões', { n: qs.length })} />
      </div>

      <section className="secao">
        <div className="secao-cabecalho">
          <h2>{t('Especialidades mais cobradas')}</h2>
          <div className="chips">
            <button className={`chip ${!areaEsp ? 'ativo' : ''}`} aria-pressed={!areaEsp} onClick={() => setAreaEsp('')}>{t('Todas as áreas')}</button>
            {AREAS.map((a) => (
              <button key={a.nome} className={`chip ${areaEsp === a.nome ? 'ativo' : ''}`} aria-pressed={areaEsp === a.nome}
                onClick={() => setAreaEsp(areaEsp === a.nome ? '' : a.nome)}>
                <span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.curto)}
              </button>
            ))}
          </div>
        </div>
        <ListaBarras itens={itensEsp} rotuloLargura="15rem" formato={(v) => `${v} · ${pct(v, qs.length)}%`} />
        {!areaEsp && (
          <ul className="legenda">
            {AREAS.map((a) => (
              <li key={a.nome}><span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.curto)}</li>
            ))}
          </ul>
        )}
      </section>

      <MateriasQualificadas qs={qs} progresso={progresso} treinar={treinar} />

      <section className="secao grade-2">
        <div>
          <h2>{t('O que a questão pede')}</h2>
          <p className="mudo">{resumoTipos}</p>
          <ListaBarras itens={tipos} rotuloLargura="12rem" formato={(v) => `${pct(v, qs.length)}%`} />
        </div>
        <div>
          <h2>{t('Temas que se repetem')}</h2>
          <p className="mudo">{t('Temas que caíram em mais de uma edição. Bom sinal de que voltam.')}</p>
          {repetidos.length ? (
            <ul className="lista-repetidos">
              {repetidos.map(([tema, lista]) => (
                <li key={tema}>
                  <span className="repetido-tema">{tema}</span>
                  <TagArea area={lista[0].area} />
                  <span className="repetido-edicoes">{[...new Set(lista.map((q) => q.edicao))].join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mudo">{t('Nenhum tema repetido entre as edições analisadas.')}</p>}
        </div>
      </section>

      <section className="secao">
        <h2>{t('Por onde começar')}</h2>
        <p className="mudo">{personalizado
          ? t('Prioridade calculada pelo peso de cada especialidade na prova e pelos seus erros nela.')
          : t('Por enquanto, a ordem segue só o peso na prova. Responda questões e a lista passa a considerar seus erros.')}</p>
        <ol className="prioridades">
          {prioridades.map((p, i) => (
            <li key={p.nome}>
              <span className="prioridade-pos">{i + 1}</span>
              <div className="prioridade-info">
                <strong>{t(p.nome)}</strong>
                <span className="mudo pequeno">
                  {t('{q} na prova ({p}%)', { q: plural(p.lista.length, 'questão', 'questões'), p: Math.round(p.peso * 100) })}
                  {p.resp > 0 ? ` · ${t('você acertou {n} de {total}', { n: p.certas, total: p.resp })}` : ` · ${t('ainda não respondida')}`}
                </span>
              </div>
              <TagArea area={areaPredominante(p.lista)} />
              <button className="botao" onClick={() => treinar(p.nome)}>{t('Treinar')}</button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
