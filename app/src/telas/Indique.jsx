// Programa de indicação na área do aluno: link pessoal, compartilhar e o que já ganhou.
import { useState, useEffect } from '../react.js';
import { useApp, Icone } from '../componentes.jsx';
import { t } from '../i18n.js';

export function CartaoIndique({ compacto = false }) {
  const { conta } = useApp();
  const [dados, setDados] = useState(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!conta.servidor || !conta.usuario) return;
    fetch('/api/indicacao', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then(setDados).catch(() => {});
  }, [conta.servidor, conta.usuario]);
  if (!conta.servidor) {
    return <section className="cartao indique"><h2>{t('Indique e ganhe')}</h2><p className="mudo">{t('O programa de indicação funciona no site do RX ENAMED, com a sua conta.')}</p></section>;
  }
  if (!dados) return <section className="cartao indique"><p className="mudo">{t('Carregando seu link…')}</p></section>;
  const mensagem = t('Estou estudando para o ENAMED/Revalida no RX ENAMED: questões oficiais do Inep comentadas, desafio diário e cronograma. Cadastre-se pelo meu link e ganhe {d}% de desconto na primeira assinatura: {link}', { d: dados.descontoIndicado, link: dados.link });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(dados.link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão */ }
  };
  return (
    <section className="cartao indique">
      <span className="sobretitulo">{t('Indique e ganhe')}</span>
      <h2>{t('Ganhe {d} dias de acesso completo por colega que assinar', { d: dados.diasPorIndicacao })}</h2>
      {!compacto && <p className="mudo">{t('Seu colega ganha {p}% de desconto na primeira assinatura. Quando ele assina, você ganha {d} dias de acesso completo, sem limite de indicações.', { p: dados.descontoIndicado, d: dados.diasPorIndicacao })}</p>}
      <div className="indique-link">
        <input id="link-indicacao" readOnly value={dados.link} aria-label={t('Seu link de indicação')} onFocus={(e) => e.target.select()} />
        <button className="botao" onClick={copiar}><Icone nome={copiado ? 'check' : 'copiar'} /> {copiado ? t('Copiado!') : t('Copiar')}</button>
      </div>
      <div className="linha-botoes">
        <a className="botao botao-primario" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer">{t('Enviar no WhatsApp')}</a>
        <a className="botao" href={`https://t.me/share/url?url=${encodeURIComponent(dados.link)}&text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer">{t('Enviar no Telegram')}</a>
      </div>
      <dl className="indique-numeros">
        <div><dt>{t('Colegas cadastrados')}</dt><dd>{dados.cadastros}</dd></div>
        <div><dt>{t('Assinaram')}</dt><dd>{dados.compraram}</dd></div>
        <div><dt>{t('Dias ganhos')}</dt><dd>{dados.dias}</dd></div>
      </dl>
    </section>
  );
}

export default function Indique() {
  return (
    <div className="tela-indique">
      <header className="cabecalho-tela"><div>
        <span className="sobretitulo">{t('Programa de indicação')}</span>
        <h1>{t('Estude de graça indicando colegas')}</h1>
        <p className="mudo">{t('Cada colega que assinar pelo seu link vale dias de acesso completo para você. Seu código também aparece no seu perfil.')}</p>
      </div></header>
      <CartaoIndique />
      <section className="cartao">
        <h2>{t('Como funciona')}</h2>
        <ol className="passos-indique">
          <li>{t('Copie seu link ou envie direto pelo WhatsApp ou Telegram.')}</li>
          <li>{t('Seu colega cria a conta grátis pelo link e começa a estudar.')}</li>
          <li>{t('Quando ele assinar qualquer plano, ganha o desconto e você recebe os dias de acesso completo na hora, com aviso por e-mail.')}</li>
        </ol>
        <p className="mudo pequeno">{t('Se a assinatura do colega for reembolsada, os dias ganhos por ela são cancelados. Indicar a si mesmo não vale.')}</p>
      </section>
    </div>
  );
}
