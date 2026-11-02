import { useState, useEffect, useMemo } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { AREAS } from '../data.js';
import { normalizar } from '../util.js';
import { t } from '../i18n.js';

// Área de residência — PRIVADA (só administradores). Questões inéditas do RX ENAMED no formato de acesso direto,
// servidas pelo servidor apenas para admin, e o acompanhamento das autorizações das bancas.

const INSTITUICOES = ['USP', 'UNIFESP', 'SUS-SP', 'UFRJ', 'UFMG', 'UFPR', 'UFRGS', 'UFG', 'UFMT', 'UnB', 'UFBA', 'UEFS',
  'UFPE', 'UFC', 'UFAC', 'UFPA', 'ENARE'];
const SITUACOES = ['Não solicitado', 'Solicitado', 'Autorizado', 'Negado'];
const CHAVE = 'rx-residencia-instituicoes';

function lerControle() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; }
}

/** Converte a questão inédita para o formato do banco e registra no app (fora da lista pública). */
function registrar(banco, q, numero) {
  const questao = {
    ...q, exame: 'Inédita RX', edicao: 'Residência', ano: 2026, numero, rotulo: 'Inédita RX · Residência', fonte: 'inedita',
    anulada: false, figuras: [], caso_clinico: /\b\d{1,3}\s+(anos|meses|dias|semanas)\b/i.test(q.enunciado), incidencia: '', classificacao: 'automática',
    busca: normalizar(`${q.enunciado} ${q.alternativas.join(' ')} ${q.especialidade} ${q.tema}`),
  };
  banco.porId[q.id] = questao;
  if (!banco.comentarios[q.id]) banco.comentarios[q.id] = { inedita: true, pt: { resumo: q.comentario, alternativas: {} }, es: { resumo: q.comentario, alternativas: {} } };
  return questao;
}

export default function Residencia() {
  const { banco, iniciarSessao, progresso } = useApp();
  const [questoes, setQuestoes] = useState(null);
  const [erro, setErro] = useState('');
  const [controle, setControle] = useState(lerControle);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch('/api/residencia/questoes', { credentials: 'same-origin' });
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (vivo) setQuestoes(d.questoes.map((q, i) => registrar(banco, q, i + 1)));
      } catch {
        if (vivo) setErro(t('Não foi possível carregar o banco de residência. Ele só abre para administradores, no site com servidor.'));
      }
    })();
    return () => { vivo = false; };
  }, []);

  const porArea = useMemo(() => {
    const m = {};
    for (const q of questoes || []) (m[q.area] ||= []).push(q);
    return m;
  }, [questoes]);
  const feitas = (questoes || []).filter((q) => progresso.respostas[q.id]).length;
  const certas = (questoes || []).filter((q) => progresso.respostas[q.id]?.at(-1)?.certa).length;

  const treinar = (lista, titulo) => iniciarSessao({ titulo, ids: lista.map((q) => q.id).sort(() => Math.random() - 0.5), origem: 'treino' });
  const mudar = (inst, campo, valor) => {
    const novo = { ...controle, [inst]: { ...(controle[inst] || {}), [campo]: valor } };
    setControle(novo);
    try { localStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* sem armazenamento */ }
  };

  return (
    <div className="tela-residencia">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo"><Icone nome="cadeado" tamanho={14} /> {t('Privado · visível só para administradores')}</span>
          <h1>{t('Residência médica')}</h1>
          <p className="mudo">{t('Área em construção. Questões inéditas do RX ENAMED no formato de acesso direto e o controle das autorizações das bancas. Ainda não aparece para os alunos.')}</p>
        </div>
      </header>

      {erro && <p className="aviso-ia">{erro}</p>}
      {!questoes && !erro && <p className="mudo">{t('Carregando…')}</p>}

      {questoes && (
        <>
          <section className="cartao res-resumo">
            <div>
              <strong>{t('{n} questões inéditas', { n: questoes.length })}</strong>
              <span className="mudo pequeno">{t('{f} respondidas · {c} certas', { f: feitas, c: certas })}</span>
            </div>
            <div className="linha-botoes">
              <button className="botao botao-primario" onClick={() => treinar(questoes, t('Residência · todas as áreas'))}>{t('Treinar todas')}</button>
              <button className="botao" onClick={() => treinar(questoes.slice().sort(() => Math.random() - 0.5).slice(0, 20), t('Residência · simulado rápido'))}>{t('Simulado rápido (20)')}</button>
            </div>
          </section>
          <ul className="res-areas">
            {AREAS.map((a) => (
              <li key={a.nome}>
                <button className="cartao res-area" disabled={!porArea[a.nome]?.length} onClick={() => treinar(porArea[a.nome], `${t('Residência')} · ${t(a.nome)}`)}>
                  <span className="sobretitulo">{t(a.nome)}</span>
                  <strong>{t('{n} questões', { n: porArea[a.nome]?.length || 0 })}</strong>
                  <span className="mudo pequeno">{t('Treinar esta área')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <section className="cartao res-instituicoes">
        <h2>{t('Provas das instituições')}</h2>
        <p className="mudo">{t('Provas de residência têm direitos autorais das instituições e bancas. Elas só entram na plataforma com autorização por escrito; aqui você acompanha os pedidos. O controle fica salvo neste navegador.')}</p>
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>{t('Instituição')}</th><th>{t('Situação')}</th><th>{t('Anotações')}</th></tr></thead>
            <tbody>
              {INSTITUICOES.map((i) => (
                <tr key={i}>
                  <td><strong>{i}</strong></td>
                  <td>
                    <select value={controle[i]?.situacao || SITUACOES[0]} onChange={(e) => mudar(i, 'situacao', e.target.value)} aria-label={t('Situação de {i}', { i })}>
                      {SITUACOES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
                    </select>
                  </td>
                  <td><input value={controle[i]?.nota || ''} onChange={(e) => mudar(i, 'nota', e.target.value)} placeholder={t('Contato, data do pedido…')} aria-label={t('Anotações de {i}', { i })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mudo pequeno">{t('As questões inéditas são de autoria do RX ENAMED e não têm vínculo com nenhuma instituição ou banca.')}</p>
    </div>
  );
}
