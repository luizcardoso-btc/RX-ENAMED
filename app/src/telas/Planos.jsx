import { useApp, Icone } from '../componentes.jsx';
import { textosPreco } from '../planos.js';
import { t, tc, idiomaAtual } from '../i18n.js';

export default function Planos() {
  const { banco, conta } = useApp();
  const { lancamento, planos } = banco.planos;
  const lingua = idiomaAtual();

  return (
    <div className="tela-planos">
      <header className="cabecalho-tela">
        <div>
          <span className="sobretitulo">{t('Planos')}</span>
          <h1>{t('Escolha o seu plano')}</h1>
          <p className="mudo">{t('Você está no plano Gratuito. Assine para liberar o curso completo, as questões comentadas e a 2ª etapa.')}</p>
        </div>
      </header>
      {lancamento?.ativo && (
        <p className="aviso-lancamento"><strong>{tc(lancamento, 'selo') ?? lancamento.pt.selo}</strong> {tc(lancamento, 'texto') ?? lancamento.pt.texto}</p>
      )}
      <ul className="grade-planos">
        {planos.map((p) => {
          const tx = lingua === 'es' ? p.es : p.pt;
          const preco = textosPreco(p, lancamento, lingua);
          return (
            <li key={p.id} className={`plano${p.destaque ? ' plano-destaque' : ''}`}>
              {p.destaque && <span className="plano-selo">{t('Recomendado')}</span>}
              <h2>{tx.nome}</h2>
              <p className="mudo pequeno">{tx.para}</p>
              <p className="plano-preco">
                {preco.de && <s className="mudo">{preco.de}</s>} <strong>{preco.preco}</strong>
              </p>
              <p className="mudo pequeno">{preco.periodo}{preco.parcela ? ` · ${preco.parcela}` : ''}</p>
              <ul className="plano-itens">{tx.itens.map((i) => <li key={i}><Icone nome="check" tamanho={14} /> {i}</li>)}</ul>
              {p.preco === 0 ? (
                <span className="botao botao-largo" aria-disabled="true">{t('Seu plano atual')}</span>
              ) : conta?.servidor ? (
                <a className={`botao botao-largo${p.destaque ? ' botao-primario' : ''}`} href={`/checkout?plano=${p.id}${lingua === 'es' ? '&lang=es' : ''}`}>
                  {t('Assinar {plano}', { plano: tx.nome })}
                </a>
              ) : p.checkout ? (
                <a className={`botao botao-largo${p.destaque ? ' botao-primario' : ''}`} href={p.checkout} target="_blank" rel="noopener">
                  {t('Assinar {plano}', { plano: tx.nome })}
                </a>
              ) : (
                <button className="botao botao-largo" disabled>{t('Pagamento abre em breve')}</button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mudo pequeno">{t('Preços em reais. Pagamento por PIX, cartão ou boleto, processado pelo Mercado Pago; o acesso é liberado na sua conta assim que ele for confirmado.')}</p>
    </div>
  );
}
