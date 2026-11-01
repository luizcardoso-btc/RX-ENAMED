// Configuração lida das variáveis de ambiente. Veja .env.exemplo.
const obrigatoria = (nome) => {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida (veja servidor/.env.exemplo).`);
  return v;
};

/** Em produção, recusa configurações inseguras antes de subir. Devolve avisos (não fatais). */
export function conferirProducao(config) {
  if (!config.producao) return [];
  const erros = [];
  const avisos = [];
  if (!config.bancoUrl) erros.push('DATABASE_URL não definida: em Variables, use ${{rx-enamed-banco.DATABASE_URL}}.');
  if (!/^https:\/\//.test(config.urlBase)) erros.push('URL_BASE não definida ou sem https:// (ex.: https://rx-enamed-production.up.railway.app).');
  const mp = config.mercadoPago;
  if (!mp.tokenAcesso || !mp.chavePublica) avisos.push('MP_ACCESS_TOKEN/MP_PUBLIC_KEY vazios: o checkout fica desligado (o site funciona).');
  else if (mp.tokenAcesso.startsWith('TEST-')) avisos.push('MP_ACCESS_TOKEN de TESTE em produção: nenhum pagamento real será cobrado.');
  if (mp.tokenAcesso && (!mp.segredoWebhook || mp.segredoWebhook.length < 16)) avisos.push('MP_WEBHOOK_SECRET vazio ou curto: a liberação automática não vai funcionar até preencher.');
  if (!config.emailsAdmin.length) avisos.push('ADMIN_EMAILS vazio: ninguém vira admin ao se cadastrar.');
  return { erros, avisos };
}

export function carregarConfig(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  return {
    producao,
    porta: Number(env.PORT || 3000),
    urlBase: (env.URL_BASE || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
    bancoUrl: env.DATABASE_URL || '',
    bancoSsl: env.DATABASE_SSL === 'true' ? true : env.DATABASE_SSL === 'false' ? false : null, // null = automático
    // Multiplica os limites de requisição (1 em produção; os testes usam um valor alto).
    multiplicadorLimites: Math.max(1, Number(env.LIMITE_MULTIPLICADOR) || 1),
    // Admin precisa de verificação em duas etapas (padrão em produção).
    exigir2faAdmin: env.ADMIN_EXIGIR_2FA ? env.ADMIN_EXIGIR_2FA === 'true' : producao,
    mercadoPago: {
      api: (env.MP_API_URL || 'https://api.mercadopago.com').replace(/\/$/, ''),
      tokenAcesso: env.MP_ACCESS_TOKEN || '',
      chavePublica: env.MP_PUBLIC_KEY || '',
      segredoWebhook: env.MP_WEBHOOK_SECRET || '',
      descricaoFatura: env.MP_DESCRICAO_FATURA || 'RXENAMED',
    },
    email: {
      chaveResend: env.RESEND_API_KEY || '',
      remetente: env.EMAIL_REMETENTE || 'RX ENAMED <contato@rxenamed.com.br>',
      responderPara: env.EMAIL_RESPONDER_PARA || '',
    },
    legal: {
      empresa: env.LEGAL_EMPRESA || 'RX ENAMED',
      documento: env.LEGAL_DOCUMENTO || '', // CNPJ ou CPF do responsável, mostrado nos Termos e na Política de Privacidade
      email: env.LEGAL_EMAIL || env.EMAIL_RESPONDER_PARA || 'contato@rxenamed.com.br',
      data: env.LEGAL_DATA || '1º de novembro de 2026',
    },
    // E-mails que viram admin ao se cadastrar (separados por vírgula). Também há o comando npm run criar-admin.
    emailsAdmin: (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    pastaSite: env.PASTA_SITE || new URL('../../site/dist', import.meta.url).pathname,
    arquivoPlanos: env.ARQUIVO_PLANOS || new URL('../../conteudo/planos.json', import.meta.url).pathname,
  };
}
