// Perfil do aluno: quem ele é, o plano, o nível e os atalhos para conta, estudos e privacidade.
import { useMemo } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { calcularXP, nivelDe } from '../gamificacao.js';
import { historicoDesafios } from '../desafio.js';
import { configDoAluno } from '../cronograma.js';
import { diasAte } from '../trilha.js';
import { ultimaResposta } from '../progresso.js';
import { t, idiomaAtual } from '../i18n.js';

const NOMES_PLANO = { mensal: 'Mensal', ciclo: 'Ciclo de prova', 'segunda-etapa': '2ª etapa', anual: 'Anual completo' };
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function Perfil() {
  const { conta, acesso, progresso, banco, ir, sair } = useApp();
  const usuario = conta.usuario;
  const xp = useMemo(() => calcularXP(progresso), [progresso]);
  const nivel = nivelDe(xp.total);
  const seq = historicoDesafios(progresso);
  const cfg = configDoAluno(progresso.trilha);
  const respondidas = banco.questoes.filter((q) => !q.anulada && ultimaResposta(progresso, q.id));
  const certas = respondidas.filter((q) => ultimaResposta(progresso, q.id).certa).length;
  const dias = diasAte(progresso.trilha.dataProva);
  const data = (d) => new Date(d).toLocaleDateString(idiomaAtual() === 'es' ? 'es' : 'pt-BR');
  const iniciais = String(usuario?.nome || 'RX').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

  return (
    <div className="tela-perfil">
      <section className="perfil-cabecalho cartao">
        <span className="avatar avatar-grande">{iniciais}</span>
        <div>
          <span className="sobretitulo">{t('Meu perfil')}</span>
          <h1>{usuario?.nome || t('Visitante')}</h1>
          <p className="mudo">{usuario?.email || t('Nesta prévia o progresso fica salvo só neste navegador.')}</p>
        </div>
      </section>

      <div className="perfil-grade">
        <section className="cartao">
          <span className="sobretitulo">{t('Plano')}</span>
          <h2>{acesso.completo ? t(NOMES_PLANO[conta.acesso?.plano] || 'Acesso completo') : t('Gratuito')}</h2>
          <p className="mudo">{acesso.completo
            ? (conta.acesso?.ate ? t('Acesso completo até {d}.', { d: data(conta.acesso.ate) }) : t('Acesso completo.'))
            : t('{q} questões por dia e {s} simulado por mês.', { q: acesso.limites.questoesDia, s: acesso.limites.simuladosMes })}</p>
          <button className="botao botao-primario" onClick={() => ir('planos')}>{acesso.completo ? t('Renovar ou mudar de plano') : t('Ver planos')}</button>
        </section>

        <section className="cartao">
          <span className="sobretitulo">{t('Seu nível')}</span>
          <h2>{t('Nível {n}', { n: nivel.numero })} · {t(nivel.nome)}</h2>
          <span className="mini-barra"><span style={{ width: `${nivel.fracao * 100}%` }} /></span>
          <p className="mudo pequeno">{t('{xp} XP no total', { xp: xp.total.toLocaleString('pt-BR') })} · {t('{n} dias seguidos', { n: seq.atual })}</p>
          <button className="botao-texto" onClick={() => ir('desafio')}>{t('Ir para o desafio de hoje')}</button>
        </section>

        <section className="cartao">
          <span className="sobretitulo">{t('Seus números')}</span>
          <dl className="perfil-numeros">
            <div><dt>{t('Questões respondidas')}</dt><dd>{respondidas.length}</dd></div>
            <div><dt>{t('Acerto')}</dt><dd>{respondidas.length ? `${Math.round((certas / respondidas.length) * 100)}%` : '—'}</dd></div>
            <div><dt>{t('Aulas concluídas')}</dt><dd>{Object.values(progresso.aulas).filter(Boolean).length}</dd></div>
            <div><dt>{t('Simulados')}</dt><dd>{progresso.simulados.length}</dd></div>
          </dl>
          <button className="botao-texto" onClick={() => ir('desempenho')}>{t('Ver desempenho completo')}</button>
        </section>

        <section className="cartao">
          <span className="sobretitulo">{t('Rotina de estudos')}</span>
          <p>{t('{dias} · {tempo} por dia · {q} questões por dia', {
            dias: cfg.diasEstudo.map((d) => t(DIAS[d])).join(', '),
            tempo: cfg.minutosDia >= 60 ? `${Math.floor(cfg.minutosDia / 60)}h${cfg.minutosDia % 60 ? cfg.minutosDia % 60 : ''}` : `${cfg.minutosDia} min`,
            q: progresso.trilha.metaDiaria || 20,
          })}</p>
          <p className="mudo pequeno">{dias === null ? t('Data da prova não informada.') : dias >= 0 ? t('{n} dias até a prova.', { n: dias }) : t('A data informada já passou.')}</p>
          <button className="botao-texto" onClick={() => ir('cronograma')}>{t('Ajustar no cronograma')}</button>
        </section>
      </div>

      <section className="cartao perfil-acoes">
        <h2>{t('Conta e privacidade')}</h2>
        <div className="linha-botoes">
          {conta.servidor && <a className="botao" href="/minha-conta"><Icone nome="usuario" /> {t('Pagamentos, dados e segurança')}</a>}
          <button className="botao" onClick={sair}><Icone nome="sair" /> {t('Sair')}</button>
        </div>
        {conta.servidor && <p className="mudo pequeno">{t('Em "Pagamentos, dados e segurança" você vê seus pagamentos, baixa seus dados, sai de todos os aparelhos ou exclui a conta.')}</p>}
      </section>
    </div>
  );
}
