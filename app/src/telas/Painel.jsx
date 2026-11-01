import { historicoDesafios } from '../desafio.js';
import { useApp, Numero, ListaBarras, Icone, FalaMentor } from '../componentes.jsx';
import { AREAS } from '../data.js';
import { revisoesPendentes, ultimaResposta, sequenciaDeDias, desempenho } from '../progresso.js';
import { embaralhar, formatarPct, pct, plural } from '../util.js';
import { useTrilha, iniciarPlano } from './Trilha.jsx';
import { t, tc } from '../i18n.js';

function treinoRapido(banco, progresso, n = 10) {
  // Duas questões de cada área, priorizando as que você ainda não fez.
  const ids = [];
  for (const a of AREAS) {
    const daArea = banco.questoes.filter((q) => q.area === a.nome && !q.anulada);
    const novas = embaralhar(daArea.filter((q) => !ultimaResposta(progresso, q.id)));
    const resto = embaralhar(daArea.filter((q) => ultimaResposta(progresso, q.id)));
    ids.push(...[...novas, ...resto].slice(0, n / AREAS.length).map((q) => q.id));
  }
  return ids;
}

export default function Painel() {
  const { banco, progresso, ir, iniciarSessao, conta } = useApp();
  const validas = banco.questoes.filter((q) => !q.anulada);
  const respondidas = validas.filter((q) => ultimaResposta(progresso, q.id));
  const certas = respondidas.filter((q) => ultimaResposta(progresso, q.id).certa).length;
  const pendentes = revisoesPendentes(progresso).filter((id) => banco.porId[id]);
  const sim = progresso.simuladoAtivo;
  const { plano, feitas, atual, mods } = useTrilha();

  let proximo;
  if (sim) {
    proximo = { sobre: t('Simulado em andamento'), titulo: sim.titulo,
      texto: t('{n} de {total} respondidas. O cronômetro continua de onde parou.', { n: Object.keys(sim.respostas).length, total: sim.ids.length }),
      acao: t('Continuar simulado'), fazer: () => ir('simulado') };
  } else if (plano && feitas.size < plano.itens.length) {
    const restantes = plano.itens.length - feitas.size;
    const seq = historicoDesafios(progresso).atual;
    proximo = { sobre: `#DesafioDiário${seq ? ` · ${t('{n} dias seguidos', { n: seq })}` : ''}`,
      titulo: feitas.size ? t('Faltam {q} no desafio de hoje', { q: plural(restantes, 'questão', 'questões') }) : t('Desafio de hoje: {q}', { q: plural(plano.itens.length, 'questão', 'questões') }),
      texto: t('Escolhidas pelo peso na prova e pelo seu desempenho. Conclua todo dia: 7, 15 e 30 dias seguidos dão bônus de XP.'),
      acao: t(feitas.size ? 'Continuar o desafio' : 'Iniciar o desafio'), fazer: () => iniciarPlano(iniciarSessao, plano, feitas) };
  } else if (plano) {
    const seq = historicoDesafios(progresso).atual;
    proximo = { sobre: t('Desafio de hoje concluído'), titulo: t('{n} dias seguidos', { n: seq }),
      texto: t('Amanhã chega um novo desafio, com as revisões do dia. Se quiser continuar hoje, veja seu cronograma da semana.'),
      acao: t('Ver o cronograma'), fazer: () => ir('cronograma') };
  } else if (pendentes.length) {
    proximo = { sobre: t('Revisão de hoje'), titulo: t('{q} para revisar', { q: plural(pendentes.length, 'questão', 'questões') }),
      texto: t('São questões que você errou. Revisar no dia certo é o que fixa o conteúdo.'),
      acao: t('Revisar agora'), fazer: () => iniciarSessao({ titulo: t('Revisão de hoje'), ids: pendentes, origem: 'revisao' }) };
  } else if (!respondidas.length) {
    proximo = { sobre: t('Comece por aqui'), titulo: t('Faça 10 questões, duas de cada área'),
      texto: t('Leva uns 30 minutos. No final você já vê em que área está mais forte e o que revisar.'),
      acao: t('Começar 10 questões'), fazer: () => iniciarSessao({ titulo: t('Treino rápido'), ids: treinoRapido(banco, progresso), origem: 'treino' }) };
  } else {
    proximo = { sobre: t('Continue de onde parou'), titulo: t('{q} no banco', { q: plural(validas.length - respondidas.length, 'questão inédita', 'questões inéditas') }),
      texto: t('Mais um bloco de 10 questões equilibradas entre as cinco áreas.'),
      acao: t('Fazer mais 10'), fazer: () => iniciarSessao({ titulo: t('Treino rápido'), ids: treinoRapido(banco, progresso), origem: 'treino' }) };
  }

  const porArea = desempenho(progresso, validas, 'area');
  const itens = AREAS.map((a) => {
    const g = porArea.find((x) => x.chave === a.nome) || { respondidas: 0, total: 0, certas: 0 };
    return { chave: a.nome, rotulo: t(a.curto), cor: a.cor, valor: g.respondidas, g,
      dica: `${t(a.nome)}: ${t('{n} de {total} resolvidas', { n: g.respondidas, total: g.total })}${g.respondidas ? t(', {p}% de acerto', { p: pct(g.certas, g.respondidas) }) : ''}` };
  });

  return (
    <div className="tela-painel">
      {conta?.usuario && <p className="saudacao">{t('Olá,')} <strong>{conta.usuario.nome.split(' ')[0]}</strong>. {t('Vamos continuar de onde você parou.')}</p>}
      <section className="destaque">
        <div className="destaque-texto">
          <span className="sobretitulo">{proximo.sobre}</span>
          <h1>{proximo.titulo}</h1>
          <p>{proximo.texto}</p>
          <button className="botao botao-primario botao-grande" onClick={proximo.fazer}>
            {proximo.acao} <Icone nome="direita" />
          </button>
        </div>
        <div className="cartao-resposta" aria-hidden="true">
          {['A', 'B', 'C', 'D'].map((l, i) => (
            <span key={l} className={`bolha-deco ${i === 2 ? 'preenchida' : ''}`}>{l}</span>
          ))}
        </div>
      </section>

      {!respondidas.length && banco.mentores.find((m) => m.anfitria) && (
        <FalaMentor mentor={banco.mentores.find((m) => m.anfitria)}>
          <p>{tc(banco.mentores.find((m) => m.anfitria), 'mensagens').boasVindas}</p>
        </FalaMentor>
      )}

      <div className="numeros">
        <Numero rotulo={t('Banco resolvido')} valor={formatarPct(respondidas.length, validas.length)} detalhe={t('{n} de {total} questões', { n: respondidas.length, total: validas.length })} />
        <Numero rotulo={t('Acertos')} valor={formatarPct(certas, respondidas.length)} detalhe={respondidas.length ? t('{n} certas', { n: certas }) : t('responda para ver')} />
        <Numero rotulo={t('Revisões hoje')} valor={pendentes.length} detalhe={t('{n} na fila', { n: Object.keys(progresso.revisao).length })} />
        <Numero rotulo={t('Dias seguidos')} valor={sequenciaDeDias(progresso)} detalhe={t('estudando')} />
      </div>

      <section className="secao">
        <h2>{t('Questões resolvidas por área')}</h2>
        <ListaBarras itens={itens} max={Math.max(...itens.map((i) => i.g.total), 1)} rotuloLargura="11rem"
          formato={(v, item) => `${v}/${item.g.total}`} />
      </section>
    </div>
  );
}
