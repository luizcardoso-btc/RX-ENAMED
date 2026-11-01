// Configuração lida das variáveis de ambiente. Veja .env.exemplo.
const obrigatoria = (nome) => {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida (veja servidor/.env.exemplo).`);
  return v;
};

export function carregarConfig(env = process.env) {
  const producao = env.NODE_ENV === 'production';
  return {
    producao,
    porta: Number(env.PORT || 3000),
    urlBase: (env.URL_BASE || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
    bancoUrl: env.DATABASE_URL || obrigatoria('DATABASE_URL'),
    mercadoPago: {
      api: (env.MP_API_URL || 'https://api.mercadopago.com').replace(/\/$/, ''),
      tokenAcesso: producao ? obrigatoria('MP_ACCESS_TOKEN') : env.MP_ACCESS_TOKEN || '',
      chavePublica: producao ? obrigatoria('MP_PUBLIC_KEY') : env.MP_PUBLIC_KEY || '',
      segredoWebhook: producao ? obrigatoria('MP_WEBHOOK_SECRET') : env.MP_WEBHOOK_SECRET || '',
      descricaoFatura: env.MP_DESCRICAO_FATURA || 'RXENAMED',
    },
    email: {
      chaveResend: env.RESEND_API_KEY || '',
      remetente: env.EMAIL_REMETENTE || 'RX ENAMED <contato@rxenamed.com.br>',
      responderPara: env.EMAIL_RESPONDER_PARA || '',
    },
    // E-mails que viram admin ao se cadastrar (separados por vírgula). Também há o comando npm run criar-admin.
    emailsAdmin: (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
    pastaSite: env.PASTA_SITE || new URL('../../site/dist', import.meta.url).pathname,
    arquivoPlanos: env.ARQUIVO_PLANOS || new URL('../../conteudo/planos.json', import.meta.url).pathname,
  };
}
