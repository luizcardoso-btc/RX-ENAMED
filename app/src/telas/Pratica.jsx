import { useState, useEffect, useMemo } from '../react.js';
import { useApp, Icone, Vazio, AvatarMentor } from '../componentes.jsx';
import { AREAS, infoArea } from '../data.js';
import { plural, normalizar } from '../util.js';
import { t, tc, idiomaAtual } from '../i18n.js';
import { iaDoServidor } from '../ia.js';
import { api, comServidor, estacoesLocais } from '../pratica-api.js';
import Dupla from './Dupla.jsx';
import Discursivas from './Discursivas.jsx';
import Estacao from './pratica/Estacao.jsx';
import SimuladoEstacoes from './pratica/SimuladoEstacoes.jsx';
import DuplaServidor from './pratica/DuplaServidor.jsx';
import DesempenhoPratica from './pratica/DesempenhoPratica.jsx';
import { SeloOrigem, notaTexto } from './pratica/comum.jsx';

/** Função `sample` (IA) do servidor ou do visualizador; `null` se indisponível, `undefined` enquanto verifica. */
export function useSample() {
  const [sample, setSample] = useState(undefined);
  useEffect(() => {
    let vivo = true;
    (async () => {
      let s = (await iaDoServidor())?.sample || null;
      if (!s) { try { s = window.claude?.use ? await window.claude.use('sample') : null; } catch { s = null; } }
      if (vivo) setSample(() => s || null);
    })();
    return () => { vivo = false; };
  }, []);
  return sample;
}

/* ------------------------------------------------------------------ central da 2ª etapa */

function Atalhos({ abrir, resumo, temDiscursivas }) {
  const cartoes = [
    { id: 'individual', icone: 'estetoscopio', titulo: 'Paciente simulado', texto: 'Escolha uma estação abaixo e atenda sozinho: o paciente responde ao que você pergunta, sem custo.' },
    { id: 'dupla', icone: 'pessoas', titulo: 'Treinar em dupla', texto: 'Um faz o médico e o outro o ator, pelo Google Meet, com cronômetro, impressos e PEP.', destaque: true },
    { id: 'simulado5', icone: 'relogio', titulo: 'Simulado de 5 estações', texto: 'Um dia de prova: cinco estações seguidas, relatório no final.' },
    { id: 'simulado10', icone: 'alvo', titulo: 'Simulado completo', texto: 'Dez estações em dois blocos, duas por grande área, como no edital.' },
    ...(temDiscursivas ? [{ id: 'discursivas', icone: 'lista', titulo: 'Questões discursivas', texto: 'Casos da prova discursiva com o padrão de resposta oficial do Inep.' }] : []),
    { id: 'desempenho', icone: 'grafico', titulo: 'Histórico e desempenho', texto: resumo },
  ];
  return (
    <div className="pratica-atalhos-2">
      {cartoes.map((c) => (
        <button key={c.id} className={`cartao atalho-pratica ${c.destaque ? 'destaque-pratica' : ''}`} onClick={() => abrir(c.id)}>
          <Icone nome={c.icone} />
          <strong>{t(c.titulo)}</strong>
          <span className="mudo pequeno">{c.id === 'desempenho' ? c.texto : t(c.texto)}</span>
        </button>
      ))}
    </div>
  );
}

function Catalogo({ estacoes, abrir }) {
  const { progresso } = useApp();
  const [area, setArea] = useState('');
  const [origem, setOrigem] = useState('');
  const [busca, setBusca] = useState('');
  const termo = normalizar(busca.trim());
  const lista = estacoes.filter((e) => (!area || e.area === area) && (!origem || e.origem === origem)
    && (!termo || normalizar(`${e.titulo} ${e.tema} ${e.especialidade} ${e.edicao || ''}`).includes(termo)));
  const oficiais = estacoes.filter((e) => e.origem === 'oficial').length;
  return (
    <section className="secao" id="catalogo-estacoes">
      <div className="cabecalho-secao">
        <h2>{t('Estações')} <span className="mudo pequeno">· {t('{o} oficiais do Inep e {a} autorais RX MED', { o: oficiais, a: estacoes.length - oficiais })}</span></h2>
      </div>
      <div className="filtros-estacoes">
        <div className="segmentado" role="group" aria-label={t('Origem')}>
          {[['', 'Todas'], ['oficial', 'Oficiais Inep'], ['autoral', 'Autorais RX MED']].map(([v, r]) => (
            <button key={v} className={origem === v ? 'ativo' : ''} aria-pressed={origem === v} onClick={() => setOrigem(v)}>{t(r)}</button>
          ))}
        </div>
        <div className="chips" role="group" aria-label={t('Área')}>
          <button className={`chip ${area === '' ? 'ativo' : ''}`} onClick={() => setArea('')}>{t('Todas as áreas')}</button>
          {AREAS.map((a) => <button key={a.nome} className={`chip ${area === a.nome ? 'ativo' : ''}`} onClick={() => setArea(a.nome)}>{t(a.curto)}</button>)}
        </div>
        <label className="sr" htmlFor="busca-estacao">{t('Buscar estação')}</label>
        <input id="busca-estacao" type="search" value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder={t('Buscar por tema ou edição (ex.: dor lombar, 2024.1)')} />
      </div>
      {!lista.length && <p className="mudo">{t('Nenhuma estação com esse filtro.')}</p>}
      {AREAS.map((a) => {
        const daArea = lista.filter((e) => e.area === a.nome);
        if (!daArea.length) return null;
        return (
          <div key={a.nome} className="bloco-area">
            <h3 className="titulo-area"><span className="ponto" style={{ background: `var(--serie-${a.cor})` }} aria-hidden="true" />{t(a.nome)} <span className="mudo pequeno">({daArea.length})</span></h3>
            <div className="grade-estacoes">
              {daArea.map((e) => {
                const tentativas = progresso.praticas[e.id] || [];
                const ultima = tentativas[tentativas.length - 1];
                return (
                  <button key={e.id} className="estacao-cartao" onClick={() => abrir(e.id)}>
                    <span className="sobretitulo">{t(e.especialidade)} · {e.duracaoMin} min</span>
                    <strong>{e.titulo}</strong>
                    <span className="mudo pequeno">{e.resumo}</span>
                    <SeloOrigem origem={e.origem} edicao={e.edicao} />
                    <span className="estacao-rodape">
                      {ultima
                        ? <span>{t('Última nota')} <strong className="nota-pequena">{notaTexto(ultima.nota)}</strong> · {plural(tentativas.length, 'tentativa', 'tentativas')}</span>
                        : <span className="mudo">{e.modos?.gratuito ? t('Ainda não feita') : t('Só em dupla')}</span>}
                      <Icone nome="direita" tamanho={16} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Central({ dados, abrir, abrirEstacao }) {
  const { banco, progresso } = useApp();
  const feitas = Object.values(progresso.praticas).flat().filter((r) => typeof r.nota === 'number');
  const resumo = feitas.length
    ? t('{n} estações feitas, média {m}. Veja a evolução e o que revisar.', { n: feitas.length, m: notaTexto(feitas.reduce((s, r) => s + r.nota, 0) / feitas.length) })
    : t('Notas por estação e por área, critérios perdidos e o que revisar no curso.');
  return (
    <div className="tela-pratica">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Prática · 2ª etapa')}</span>
          <h1>{t('Prova de habilidades clínicas')}</h1>
          <p className="mudo">{t('Estações de 10 minutos com paciente simulado, impressos de exame e o PEP (padrão esperado de procedimentos) com pesos que somam 10. Inclui as estações oficiais publicadas pelo Inep.')}</p>
          {idiomaAtual() === 'es' && <p className="aviso-idioma">{t('As estações são em português, como na prova: o paciente fala português e o checklist segue o do Inep.')}</p>}
        </div>
      </header>
      <Atalhos abrir={abrir} resumo={resumo} temDiscursivas={banco.discursivas.length > 0} />
      <Catalogo estacoes={dados.estacoes} abrir={abrirEstacao} />
      <section className="secao">
        <h2>{t('Seus mentores')}</h2>
        <ul className="mentores">
          {banco.mentores.map((m) => (
            <li key={m.id} className="mentor-cartao">
              <AvatarMentor mentor={m} tamanho={48} />
              <div>
                <strong>{m.nome}</strong>
                <span className="mudo pequeno">{tc(m, 'titulo')}</span>
                <p className="mentor-bordao">"{tc(m, 'bordoes')[0]}"</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="mudo pequeno">{t('Estações oficiais: textos, impressos e critérios extraídos dos cadernos e PEPs publicados pelo Inep, com a fonte em cada estação. Estações autorais: casos fictícios da equipe RX MED, em revisão médica. Confira sempre a versão vigente dos protocolos.')}</p>
    </div>
  );
}

export default function Pratica() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [vista, setVista] = useState({ tela: 'central' });
  const [locais, setLocais] = useState([]);

  useEffect(() => {
    let vivo = true;
    api().listar().then((d) => vivo && setDados(d)).catch((err) => vivo && setErro(err.message));
    if (!comServidor()) estacoesLocais().then((l) => vivo && setLocais(l));
    return () => { vivo = false; };
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [vista.tela, vista.id]);

  if (erro) return <Vazio titulo={t('Não foi possível abrir a prática')}>{erro}</Vazio>;
  if (!dados) return <p className="carregando" role="status">{t('Carregando as estações…')}</p>;
  if (!dados.estacoes.length) return <Vazio titulo={t('Nenhuma estação disponível')}>{t('O conteúdo da prática não carregou. Recarregue a página.')}</Vazio>;

  const voltar = () => setVista({ tela: 'central' });
  const porId = Object.fromEntries(dados.estacoes.map((e) => [e.id, e]));
  if (vista.tela === 'estacao' && porId[vista.id]) return <Estacao key={vista.id} publica={porId[vista.id]} iaDisponivel={dados.iaDisponivel} voltar={voltar} />;
  if (vista.tela === 'dupla') return comServidor() ? <DuplaServidor estacoes={dados.estacoes} voltar={voltar} /> : <Dupla voltar={voltar} estacoes={locais} />;
  if (vista.tela === 'simulado') return <SimuladoEstacoes key={vista.quantidade} editais={dados.editais || []} iaDisponivel={dados.iaDisponivel} quantidadeInicial={vista.quantidade} voltar={voltar} />;
  if (vista.tela === 'discursivas') return <Discursivas voltar={voltar} />;
  if (vista.tela === 'desempenho') return <DesempenhoPratica estacoes={dados.estacoes} voltar={voltar} abrirEstacao={(id) => setVista({ tela: 'estacao', id })} />;

  const abrir = (id) => {
    if (id === 'individual') { document.getElementById('catalogo-estacoes')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (id === 'simulado5') setVista({ tela: 'simulado', quantidade: 5 });
    else if (id === 'simulado10') setVista({ tela: 'simulado', quantidade: 10 });
    else setVista({ tela: id });
  };
  return <Central dados={dados} abrir={abrir} abrirEstacao={(id) => setVista({ tela: 'estacao', id })} />;
}
