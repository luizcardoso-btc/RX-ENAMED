// Desafio diário: as questões do plano do dia, a sequência de dias e os bônus de XP da sequência.
import { useEffect, useMemo } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { useTrilha, iniciarPlano } from './Trilha.jsx';
import { historicoDesafios, semanaDaSequencia, proximoMarco, MARCOS, XP_DESAFIO, chaveDia } from '../desafio.js';
import { calcularXP, nivelDe } from '../gamificacao.js';
import { inicioDoDia } from '../util.js';
import { t } from '../i18n.js';

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Fica montado o tempo todo: quando o aluno termina as questões do plano de hoje, registra o desafio concluído. */
export function VigiaDesafio() {
  const { progresso, despachar } = useApp();
  const { plano, feitas } = useTrilha();
  useEffect(() => {
    if (!plano || !plano.itens.length || feitas.size < plano.itens.length) return;
    const dia = chaveDia();
    if (progresso.desafios?.[dia]?.concluido) return;
    const hoje = inicioDoDia();
    const acertos = plano.itens.filter((i) => (progresso.respostas[i.id] || []).some((r) => r.t >= hoje && r.certa)).length;
    despachar({ tipo: 'concluirDesafio', dia, feitas: plano.itens.length, acertos });
  }, [plano, feitas.size]);
  return null;
}

export default function Desafio() {
  const { progresso, iniciarSessao, acesso, ir } = useApp();
  const { plano, feitas } = useTrilha();
  const hist = useMemo(() => historicoDesafios(progresso), [progresso]);
  const semana = semanaDaSequencia(progresso);
  const xp = useMemo(() => calcularXP(progresso), [progresso]);
  const nivel = nivelDe(xp.total);
  const proximo = proximoMarco(hist.atual);
  const hoje = inicioDoDia();
  const acertosHoje = plano ? plano.itens.filter((i) => (progresso.respostas[i.id] || []).some((r) => r.t >= hoje && r.certa)).length : 0;
  const total = plano?.itens.length || 0;
  const concluido = hist.feitoHoje;

  return (
    <div className="tela-desafio">
      <section className="desafio-heroi cartao">
        <div className="desafio-texto">
          <span className="desafio-tag">#DesafioDiário</span>
          <h1>{concluido ? t('Desafio de hoje concluído!') : t('{n} questões escolhidas para você hoje', { n: total || 25 })}</h1>
          <p className="mudo">{concluido
            ? t('Você ganhou {xp} XP e manteve a sequência. Volte amanhã para continuar subindo de nível.', { xp: XP_DESAFIO })
            : t('Questões das especialidades que mais caem e das que você mais erra, com as revisões vencidas na frente. Conclua todo dia para formar sequência e ganhar bônus de XP.')}</p>
          <div className="linha-botoes">
            {plano && (
              <button className="botao botao-primario botao-grande" onClick={() => iniciarPlano(iniciarSessao, plano, feitas)}>
                {t(feitas.size === 0 ? 'Iniciar desafio' : feitas.size < total ? 'Continuar desafio' : 'Refazer questões')} <Icone nome="direita" />
              </button>
            )}
            {!acesso.completo && <button className="botao" onClick={() => ir('planos')}>{t('Treinar sem limite')}</button>}
          </div>
        </div>
        <div className="desafio-placar" aria-label={t('Seu desafio de hoje')}>
          <div><strong>{feitas.size}<small>/{total}</small></strong><span>{t('respondidas')}</span></div>
          <div><strong>{acertosHoje}</strong><span>{t('acertos')}</span></div>
          <span className="mini-barra"><span style={{ width: `${total ? (feitas.size / total) * 100 : 0}%` }} /></span>
        </div>
      </section>

      <div className="grade-desafio">
        <section className="cartao sequencia">
          <span className="sobretitulo">{t('Sequência')}</span>
          <div className="sequencia-numero"><Icone nome="chama" tamanho={30} /> <strong>{hist.atual}</strong> <span>{t(hist.atual === 1 ? 'dia seguido' : 'dias seguidos')}</span></div>
          <ol className="pontos-semana" aria-label={t('Desafios desta semana')}>
            {semana.map((d) => (
              <li key={d.t} className={`${d.feito ? 'feito' : ''}${d.hoje ? ' hoje' : ''}${d.folga ? ' folga' : ''}${d.perdido ? ' perdido' : ''}`}
                title={d.feito ? t('Concluído') : d.folga ? t('Folga (não quebra a sequência)') : d.perdido ? t('Não concluído') : d.hoje ? t('Hoje') : ''}>
                <span className="ponto">{d.feito ? <Icone nome="check" tamanho={14} /> : d.folga ? '–' : ''}</span>
                <span className="letra">{t(DIAS_CURTOS[new Date(d.t).getDay()]).charAt(0)}</span>
              </li>
            ))}
          </ol>
          <p className="mudo pequeno">{t('Maior sequência: {n} dias. Os dias de folga do seu cronograma não quebram a sequência.', { n: hist.maior })}</p>
        </section>

        <section className="cartao bonus">
          <span className="sobretitulo">{t('Próximo bônus')}</span>
          <h2>+{proximo.xp} XP <small className="mudo">{t('em {n} dias seguidos', { n: proximo.dias })}</small></h2>
          <span className="mini-barra"><span style={{ width: `${Math.min(1, hist.atual / proximo.dias) * 100}%` }} /></span>
          <p className="mudo pequeno">{t('Faltam {n} desafios.', { n: Math.max(0, proximo.dias - hist.atual) })}</p>
          <ol className="escada-bonus">
            {[...MARCOS, { dias: 60, xp: 1000 }].map((m) => (
              <li key={m.dias} className={hist.maior >= m.dias ? 'ganho' : ''}>
                <span>{hist.maior >= m.dias ? <Icone nome="check" tamanho={14} /> : <Icone nome="chama" tamanho={14} />} {t('{n} dias', { n: m.dias })}</span>
                <strong>+{m.xp} XP</strong>
              </li>
            ))}
          </ol>
          <p className="mudo pequeno">{t('Depois dos 30 dias, mais 1.000 XP a cada 30 dias seguidos.')}</p>
        </section>

        <section className="cartao nivel-desafio">
          <span className="sobretitulo">{t('Seu nível')}</span>
          <h2>{t('Nível {n}', { n: nivel.numero })} · {t(nivel.nome)}</h2>
          <span className="mini-barra"><span style={{ width: `${nivel.fracao * 100}%` }} /></span>
          <p className="mudo pequeno">{t('{xp} XP no total', { xp: xp.total.toLocaleString('pt-BR') })} · {t('faltam {n} XP para {nome}', { n: (nivel.proximo.min - xp.total).toLocaleString('pt-BR'), nome: t(nivel.proximo.nome) })}</p>
          {xp.bonus > 0 && <p className="pequeno">{t('{xp} XP vieram de bônus de sequência.', { xp: xp.bonus.toLocaleString('pt-BR') })}</p>}
          <button className="botao-texto" onClick={() => ir('desempenho')}>{t('Ver ranking e conquistas')}</button>
        </section>
      </div>
    </div>
  );
}
