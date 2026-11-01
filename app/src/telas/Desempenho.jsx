import { useState } from '../react.js';
import { useApp, Numero, ListaBarras, Vazio, Confirmar, Icone, TagArea } from '../componentes.jsx';
import { AREAS, infoArea } from '../data.js';
import { desempenho, sequenciaDeDias, ultimaResposta } from '../progresso.js';
import { formatarPct, pct, plural } from '../util.js';
import { t } from '../i18n.js';
import { PainelNivel, Ranking } from './Ranking.jsx';
import Metas from './Metas.jsx';

function Backup() {
  const { progresso, despachar } = useApp();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState('');
  const [zerar, setZerar] = useState(false);

  const copiar = async () => {
    const json = JSON.stringify(progresso);
    try {
      await navigator.clipboard.writeText(json);
      setAviso(t('Backup copiado. Cole em um lugar seguro (e-mail, notas) para restaurar em outro aparelho.'));
    } catch {
      setTexto(json);
      setAberto(true);
      setAviso(t('Não deu para copiar automaticamente. Selecione o texto abaixo e copie.'));
    }
  };
  const restaurar = () => {
    try {
      const estado = JSON.parse(texto);
      if (estado.versao !== 1 || typeof estado.respostas !== 'object') throw new Error();
      despachar({ tipo: 'restaurar', estado });
      setAviso(t('Progresso restaurado.'));
      setTexto('');
      setAberto(false);
    } catch {
      setAviso(t('Esse texto não é um backup válido. Cole exatamente o texto copiado em "Copiar backup".'));
    }
  };

  return (
    <section className="secao">
      <h2>{t('Seu progresso')}</h2>
      <p className="mudo">{t('O progresso fica salvo neste navegador. Para levar para outro aparelho, copie o backup e restaure lá.')}</p>
      <div className="linha-botoes">
        <button className="botao" onClick={copiar}><Icone nome="copiar" /> {t('Copiar backup')}</button>
        <button className="botao" onClick={() => setAberto(!aberto)}>{t('Restaurar backup')}</button>
        <button className="botao-texto perigo" onClick={() => setZerar(true)}><Icone nome="lixo" tamanho={16} /> {t('Apagar progresso')}</button>
      </div>
      {aviso && <p className="aviso" role="status">{aviso}</p>}
      {aberto && (
        <div className="backup">
          <textarea id="backup-texto" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder={t('Cole aqui o texto do backup')} />
          <button className="botao botao-primario" onClick={restaurar} disabled={!texto.trim()}>{t('Restaurar')}</button>
        </div>
      )}
      <Confirmar aberto={zerar} perigo titulo={t('Apagar todo o progresso?')}
        texto={t('Respostas, marcações, anotações, simulados e a fila de revisão serão apagados deste navegador.')}
        rotuloOk={t('Apagar tudo')} onOk={() => { despachar({ tipo: 'zerar' }); setZerar(false); setAviso(t('Progresso apagado.')); }}
        onCancelar={() => setZerar(false)} />
    </section>
  );
}

export default function Desempenho() {
  const { banco, progresso, ir, setFiltro, iniciarSessao } = useApp();
  const validas = banco.questoes.filter((q) => !q.anulada);
  const respondidas = validas.filter((q) => ultimaResposta(progresso, q.id));
  const certas = respondidas.filter((q) => ultimaResposta(progresso, q.id).certa);
  const tentativas = Object.values(progresso.respostas).reduce((n, l) => n + l.length, 0);

  const porArea = desempenho(progresso, validas, 'area');
  const itensArea = AREAS.map((a) => {
    const g = porArea.find((x) => x.chave === a.nome) || { respondidas: 0, certas: 0, total: 0 };
    return { chave: a.nome, rotulo: t(a.curto), cor: a.cor, valor: pct(g.certas, g.respondidas), g,
      dica: g.respondidas ? `${t(a.nome)}: ${t('{n} de {r} certas ({total} no banco)', { n: g.certas, r: g.respondidas, total: g.total })}` : `${t(a.nome)}: ${t('nenhuma respondida')}` };
  });
  const porEsp = desempenho(progresso, validas, 'especialidade')
    .filter((g) => g.respondidas >= 2)
    .map((g) => ({ ...g, taxa: g.certas / g.respondidas, area: validas.find((q) => q.especialidade === g.chave).area }))
    .sort((a, b) => a.taxa - b.taxa || b.respondidas - a.respondidas);
  const erradasPorTema = respondidas.filter((q) => !ultimaResposta(progresso, q.id).certa);

  if (!respondidas.length) {
    return (
      <div className="tela-desempenho">
        <header className="cabecalho-tela"><div><span className="sobretitulo">{t('Desempenho')}</span><h1>{t('Seu desempenho')}</h1></div></header>
        <Vazio titulo={t('Você ainda não respondeu questões')}
          acao={<button className="botao botao-primario" onClick={() => ir('questoes')}>{t('Resolver as primeiras questões')}</button>}>
          {t('Depois de responder, aqui aparecem seus acertos por área, as especialidades mais fracas e o histórico de simulados.')}
        </Vazio>
        <PainelNivel />
        <Ranking />
        <Backup />
      </div>
    );
  }

  return (
    <div className="tela-desempenho">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Desempenho')}</span>
          <h1>{t('Seu desempenho')}</h1>
          <p className="mudo">{t('Conta a última resposta de cada questão. Anuladas ficam de fora.')}</p>
        </div>
      </header>
      <div className="numeros">
        <Numero rotulo={t('Acertos')} valor={formatarPct(certas.length, respondidas.length)} detalhe={t('{n} de {total}', { n: certas.length, total: respondidas.length })} />
        <Numero rotulo={t('Banco resolvido')} valor={formatarPct(respondidas.length, validas.length)} detalhe={t('{n} de {total} questões', { n: respondidas.length, total: validas.length })} />
        <Numero rotulo={t('Dias seguidos')} valor={sequenciaDeDias(progresso)} detalhe={plural(tentativas, 'resposta no total', 'respostas no total')} />
        <Numero rotulo={t('Simulados')} valor={progresso.simulados.length} detalhe={t('entregues')} />
      </div>

      <Metas />
      <PainelNivel />
      <Ranking />

      <section className="secao">
        <h2>{t('Acertos por grande área')}</h2>
        <ListaBarras itens={itensArea} max={100} rotuloLargura="11rem"
          formato={(v, item) => (item.g.respondidas ? `${v}% · ${item.g.certas}/${item.g.respondidas}` : '—')} />
      </section>

      {porEsp.length > 0 && (
        <section className="secao">
          <h2>{t('Especialidades para reforçar')}</h2>
          <p className="mudo">{t('Da menor para a maior taxa de acerto, entre especialidades com pelo menos 2 questões respondidas.')}</p>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>{t('Especialidade')}</th><th>{t('Área')}</th><th className="num">{t('Acertos')}</th><th className="num">{t('Respondidas')}</th><th /></tr></thead>
              <tbody>
                {porEsp.slice(0, 12).map((g) => (
                  <tr key={g.chave}>
                    <td>{t(g.chave)}</td>
                    <td><TagArea area={g.area} /></td>
                    <td className="num"><span className={`taxa ${g.taxa < 0.5 ? 'baixa' : g.taxa < 0.7 ? 'media' : 'alta'}`}>{Math.round(g.taxa * 100)}%</span></td>
                    <td className="num">{t('{n} de {total}', { n: g.respondidas, total: g.total })}</td>
                    <td><button className="botao-texto" onClick={() => { setFiltro((f) => ({ ...f, especialidade: g.chave, areas: [] })); ir('questoes'); }}>{t('Treinar')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {erradasPorTema.length > 0 && (
        <section className="secao">
          <h2>{t('Temas que você errou')}</h2>
          <ul className="nuvem-temas">
            {erradasPorTema.map((q) => (
              <li key={q.id}>
                <button className="chip" onClick={() => iniciarSessao({ titulo: q.tema || t(q.especialidade), ids: [q.id], origem: 'treino' })}>
                  <span className="ponto" style={{ background: `var(--serie-${infoArea(q.area).cor})` }} aria-hidden="true" />
                  {q.tema || t(q.especialidade)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Backup />
    </div>
  );
}
