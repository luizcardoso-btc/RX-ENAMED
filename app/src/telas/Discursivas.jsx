// Questões discursivas da 2ª etapa do Revalida, com o padrão de resposta definitivo do Inep.
// O aluno escreve cada item, abre o padrão oficial e marca quanto acertou; a IA pode sugerir a nota, se disponível.
import { useState } from '../react.js';
import { useApp, Icone, TagArea } from '../componentes.jsx';
import { useSample } from './Pratica.jsx';
import { t } from '../i18n.js';

const NIVEIS = [['adequado', 'Adequado', 1], ['parcial', 'Parcial', 0.5], ['inadequado', 'Inadequado', 0]];
const fmt = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Enunciado({ d }) {
  return (
    <div className="enunciado" lang="pt-BR">
      {d.enunciado.map((p, i) => {
        const fig = /^\[FIG:(\d+)\]$/.exec(p);
        return fig
          ? <img key={i} src={`img/${d.figuras[Number(fig[1]) - 1]}`} alt={t('Figura {n} do caso', { n: fig[1] })} />
          : <p key={i}>{p}</p>;
      })}
    </div>
  );
}

function Caso({ d, voltar }) {
  const { despachar } = useApp();
  const sample = useSample();
  const [respostas, setRespostas] = useState({});
  const [aberto, setAberto] = useState(false);
  const [notas, setNotas] = useState({});
  const [ia, setIa] = useState({ estado: '', comentarios: {} });
  const [salvo, setSalvo] = useState(false);
  const nota = d.itens.reduce((s, i) => s + i.valor * (NIVEIS.find((n) => n[0] === notas[i.letra])?.[2] ?? 0), 0);
  const avaliados = d.itens.every((i) => notas[i.letra]);

  const corrigirComIa = async () => {
    setIa({ estado: 'carregando', comentarios: {} });
    const pedido = [
      'Você corrige uma questão discursiva da 2ª etapa do Revalida (Inep) com base estrita no padrão de resposta oficial.',
      'Para cada item, classifique a resposta do aluno como "adequado", "parcial" ou "inadequado" segundo os critérios de pontuação do padrão, e explique em até 2 frases, em português, o que faltou ou sobrou.',
      'Responda só com JSON no formato {"a": {"nivel": "...", "comentario": "..."}, ...}, uma chave por letra de item.',
      '', `CASO: ${d.enunciado.filter((p) => !p.startsWith('[FIG')).join(' ')}`,
      ...d.itens.map((i) => `\nITEM ${i.letra} (${fmt(i.valor)} pontos): ${i.pergunta}\nPADRÃO: ${i.padrao.join(' ')}\nRESPOSTA DO ALUNO: ${respostas[i.letra] || '(em branco)'}`),
    ].join('\n');
    try {
      const { text } = await sample(pedido, { cache: false });
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const sugeridas = {};
      const comentarios = {};
      for (const i of d.itens) {
        const r = json[i.letra];
        if (r && NIVEIS.some((n) => n[0] === r.nivel)) sugeridas[i.letra] = r.nivel;
        if (r?.comentario) comentarios[i.letra] = String(r.comentario).slice(0, 500);
      }
      setNotas((n) => ({ ...sugeridas, ...n }));
      setIa({ estado: 'pronto', comentarios });
    } catch {
      setIa({ estado: 'erro', comentarios: {} });
    }
  };

  const salvar = () => {
    despachar({ tipo: 'registrarPratica', id: d.id, resultado: { t: Date.now(), nota, modo: 'discursiva', itens: notas } });
    setSalvo(true);
  };

  return (
    <article className="discursiva">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Todas as discursivas')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Discursiva {n}', { n: d.numero })} · Revalida 2023.2 · {t(d.especialidade)}</span>
          <h1>{d.tema}</h1>
          <TagArea area={d.area} />
        </div>
      </header>
      <section className="cartao"><Enunciado d={d} /></section>

      {d.itens.map((i) => (
        <section key={i.letra} className="cartao item-discursivo">
          <h2><span className="letra">{i.letra}</span> <span lang="pt-BR">{i.pergunta}</span> <small className="mudo">({t('{v} pontos', { v: fmt(i.valor) })})</small></h2>
          <label className="campo">
            <span className="rotulo-campo">{t('Sua resposta')}</span>
            <textarea id={`resp-${d.id}-${i.letra}`} rows={4} value={respostas[i.letra] || ''} disabled={aberto}
              onChange={(e) => setRespostas((r) => ({ ...r, [i.letra]: e.target.value }))} />
          </label>
          {aberto && (
            <>
              <div className="padrao-resposta" lang="pt-BR">
                <span className="sobretitulo">{t('Padrão de resposta do Inep')}</span>
                <ul>{i.padrao.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
              {ia.comentarios[i.letra] && <p className="aviso pequeno"><strong>{t('Sugestão da IA:')}</strong> {ia.comentarios[i.letra]}</p>}
              <div className="segmentado" role="group" aria-label={t('Como foi sua resposta no item {l}', { l: i.letra })}>
                {NIVEIS.map(([id, rotulo]) => (
                  <button key={id} className={notas[i.letra] === id ? 'ativo' : ''} aria-pressed={notas[i.letra] === id}
                    onClick={() => setNotas((n) => ({ ...n, [i.letra]: id }))}>{t(rotulo)}</button>
                ))}
              </div>
            </>
          )}
        </section>
      ))}

      {!aberto ? (
        <div className="linha-botoes">
          <button className="botao botao-primario" onClick={() => setAberto(true)}>{t('Entregar e ver o padrão de resposta')}</button>
        </div>
      ) : (
        <section className="cartao resultado-discursiva">
          <div>
            <span className="sobretitulo">{t('Sua nota')}</span>
            <strong className="nota-grande">{fmt(nota)} <small>/ 10</small></strong>
            <p className="mudo pequeno">{avaliados ? t('Nota pela sua autoavaliação de cada item.') : t('Marque Adequado, Parcial ou Inadequado em todos os itens.')}</p>
          </div>
          <div className="linha-botoes">
            {sample && <button className="botao" onClick={corrigirComIa} disabled={ia.estado === 'carregando'}>
              <Icone nome="estrela" /> {ia.estado === 'carregando' ? t('Corrigindo…') : t('Pedir correção à IA')}</button>}
            <button className="botao botao-primario" disabled={!avaliados || salvo} onClick={salvar}>{salvo ? t('Nota salva') : t('Salvar nota no meu desempenho')}</button>
          </div>
          {ia.estado === 'erro' && <p className="aviso">{t('A IA não conseguiu corrigir agora. Use o padrão de resposta para se avaliar.')}</p>}
        </section>
      )}
      <p className="mudo pequeno">{t('Referências do Inep:')} {d.referencias.join(' · ')}</p>
    </article>
  );
}

export default function Discursivas({ voltar }) {
  const { banco, progresso } = useApp();
  const [aberta, setAberta] = useState(null);
  const d = banco.discursivas.find((x) => x.id === aberta);
  if (d) return <Caso key={d.id} d={d} voltar={() => setAberta(null)} />;
  return (
    <div className="discursivas">
      <button className="botao-texto" onClick={voltar}><Icone nome="esquerda" tamanho={16} /> {t('Todas as estações')}</button>
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Prática · 2ª etapa')}</span>
          <h1>{t('Questões discursivas')}</h1>
          <p className="mudo">{t('Casos da prova discursiva do Revalida com o padrão de resposta definitivo do Inep. Escreva sua resposta, compare com o padrão e veja sua nota.')}</p>
        </div>
      </header>
      <ul className="lista-discursivas">
        {banco.discursivas.map((x) => {
          const ultima = (progresso.praticas[x.id] || []).slice(-1)[0];
          return (
            <li key={x.id}>
              <button className="cartao cartao-clicavel" onClick={() => setAberta(x.id)}>
                <span className="sobretitulo">{t('Discursiva {n}', { n: x.numero })} · Revalida 2023.2</span>
                <strong>{x.tema}</strong>
                <span className="mudo pequeno"><TagArea area={x.area} /> {ultima ? t('Última nota: {n}', { n: fmt(ultima.nota) }) : t('Não feita')}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
