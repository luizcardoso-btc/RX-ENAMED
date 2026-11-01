import { useApp, Vazio, Icone, TagArea } from '../componentes.jsx';
import { INTERVALOS, revisoesPendentes } from '../progresso.js';
import { DIA, inicioDoDia, plural } from '../util.js';
import { t } from '../i18n.js';

function quando(ts) {
  const dias = Math.round((inicioDoDia(ts) - inicioDoDia()) / DIA);
  if (dias <= 0) return t('hoje');
  if (dias === 1) return t('amanhã');
  return t('em {n} dias', { n: dias });
}

export default function Revisao() {
  const { banco, progresso, iniciarSessao, ir } = useApp();
  const pendentes = revisoesPendentes(progresso).filter((id) => banco.porId[id]);
  const todas = Object.entries(progresso.revisao).filter(([id]) => banco.porId[id]);
  const porCaixa = [1, 2, 3, 4, 5].map((c) => todas.filter(([, r]) => r.caixa === c).length);
  const proximas = todas.filter(([, r]) => r.proxima > Date.now()).sort((a, b) => a[1].proxima - b[1].proxima).slice(0, 12);

  return (
    <div className="tela-revisao">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Revisão espaçada')}</span>
          <h1>{pendentes.length ? t('{q} para revisar hoje', { q: plural(pendentes.length, 'questão', 'questões') }) : t('Nada para revisar hoje')}</h1>
          <p className="mudo">{t('Toda questão que você erra volta aqui em 1 dia. Acertando, ela sobe de caixa e o intervalo cresce ({d} dias) até você dominar o assunto.', { d: Object.values(INTERVALOS).join(', ') })}</p>
        </div>
        {pendentes.length > 0 && (
          <button className="botao botao-primario" onClick={() => iniciarSessao({
            titulo: t('Revisão de {q}', { q: plural(pendentes.length, 'questão', 'questões') }), ids: pendentes, origem: 'revisao' })}>
            <Icone nome="repetir" /> {t('Começar revisão')}
          </button>
        )}
      </header>

      {!todas.length ? (
        <Vazio titulo={t('Sua fila de revisão está vazia')}
          acao={<button className="botao botao-primario" onClick={() => ir('questoes')}>{t('Resolver questões')}</button>}>
          {t('Resolva questões no banco ou faça um simulado. Os erros entram aqui automaticamente.')}
        </Vazio>
      ) : (
        <>
          <section className="secao">
            <h2>{t('Caixas')}</h2>
            <ol className="caixas">
              {porCaixa.map((n, i) => (
                <li key={i} className="caixa">
                  <span className="caixa-num">{t('Caixa {n}', { n: i + 1 })}</span>
                  <span className="caixa-qtd">{n}</span>
                  <span className="caixa-int">{t('revisa a cada {d}', { d: plural(INTERVALOS[i + 1], 'dia', 'dias') })}</span>
                </li>
              ))}
            </ol>
          </section>
          {proximas.length > 0 && (
            <section className="secao">
              <h2>{t('Próximas revisões')}</h2>
              <ul className="lista-questoes compacta">
                {proximas.map(([id, r]) => {
                  const q = banco.porId[id];
                  return (
                    <li key={id} className="linha-questao estatica">
                      <span className="linha-quando">{quando(r.proxima)}</span>
                      <span className="linha-num">Q{q.numero}</span>
                      <span className="linha-prova">{q.rotulo}</span>
                      <TagArea area={q.area} />
                      <span className="linha-texto">{t(q.especialidade)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
