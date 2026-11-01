// E-mails transacionais. Envio pela API do Resend (https://resend.com); sem chave, o e-mail é só registrado (modo simulado).
// Todo envio fica na tabela "emails". Com "chave", o mesmo aviso nunca é mandado duas vezes.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reais = (c) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const data = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function moldura(titulo, corpo, botao) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;color:#0b1b3a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b111b;padding:18px 24px;color:#e9eef8;font-size:18px;font-weight:700">RX <span style="color:#6aa8ff">ENAMED</span></td></tr>
<tr><td style="padding:28px 24px;font-size:15px;line-height:1.6">
<h1 style="font-size:20px;margin:0 0 14px">${esc(titulo)}</h1>${corpo}
${botao ? `<p style="margin:24px 0 8px"><a href="${esc(botao.url)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">${esc(botao.texto)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px">RX ENAMED · curso preparatório para ENAMED e Revalida. Você recebe este e-mail porque tem uma conta no RX ENAMED.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Modelos: cada um devolve { assunto, html, texto }. */
export const MODELOS = {
  boasVindas: ({ nome, url }) => ({
    assunto: 'Bem-vindo ao RX ENAMED',
    html: moldura(`Olá, ${nome.split(' ')[0]}!`, `<p>Sua conta está pronta. No plano gratuito você tem 25 questões oficiais por dia, 1 simulado por mês e o Raio-X completo da prova.</p><p>Comece pelo Raio-X: em 30 minutos você sabe em que área está mais forte e por onde começar.</p>`, { texto: 'Começar a estudar', url: `${url}/plataforma/index.html` }),
    texto: `Olá, ${nome}! Sua conta no RX ENAMED está pronta. Comece em ${url}/plataforma/index.html`,
  }),
  pixGerado: ({ nome, plano, valor, copiaECola, url }) => ({
    assunto: `Seu PIX de ${reais(valor)} para o RX ENAMED`,
    html: moldura('Falta só pagar o PIX', `<p>${esc(nome.split(' ')[0])}, seu pedido do plano <strong>${esc(plano)}</strong> (${reais(valor)}) está aguardando o PIX. O código vale por 30 minutos:</p><p style="background:#f1f5f9;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;word-break:break-all">${esc(copiaECola)}</p><p>Assim que o pagamento cair, o acesso é liberado sozinho.</p>`, { texto: 'Ver meu pedido', url: `${url}/minha-conta` }),
    texto: `Seu PIX do plano ${plano} (${reais(valor)}): ${copiaECola}`,
  }),
  boletoGerado: ({ nome, plano, valor, boletoUrl, codigo }) => ({
    assunto: `Seu boleto de ${reais(valor)} para o RX ENAMED`,
    html: moldura('Seu boleto está pronto', `<p>${esc(nome.split(' ')[0])}, aqui está o boleto do plano <strong>${esc(plano)}</strong> (${reais(valor)}). Ele vence em 3 dias e a compensação leva até 3 dias úteis.</p>${codigo ? `<p style="background:#f1f5f9;padding:12px;border-radius:8px;font-family:monospace;font-size:13px">${esc(codigo)}</p>` : ''}`, { texto: 'Abrir boleto', url: boletoUrl }),
    texto: `Boleto do plano ${plano} (${reais(valor)}): ${boletoUrl}`,
  }),
  pagamentoAprovado: ({ nome, plano, valor, ate, url }) => ({
    assunto: 'Pagamento aprovado: seu acesso está liberado',
    html: moldura('Pagamento aprovado!', `<p>${esc(nome.split(' ')[0])}, recebemos ${reais(valor)} pelo plano <strong>${esc(plano)}</strong>. Seu acesso completo vai até <strong>${data(ate)}</strong>.</p><p>Você tem 7 dias para desistir e receber o valor de volta, é só responder este e-mail.</p>`, { texto: 'Ir para a área do aluno', url: `${url}/plataforma/index.html` }),
    texto: `Pagamento aprovado. Plano ${plano}, acesso até ${data(ate)}. ${url}/plataforma/index.html`,
  }),
  acessoVencendo: ({ nome, plano, ate, dias, url }) => ({
    assunto: dias <= 1 ? 'Seu acesso ao RX ENAMED termina amanhã' : `Seu acesso ao RX ENAMED termina em ${dias} dias`,
    html: moldura(dias <= 1 ? 'Seu acesso termina amanhã' : `Faltam ${dias} dias`, `<p>${esc(nome.split(' ')[0])}, seu plano <strong>${esc(plano)}</strong> vai até <strong>${data(ate)}</strong>. Não há cobrança automática: se renovar antes, os dias novos se somam aos que faltam.</p>`, { texto: 'Renovar meu acesso', url: `${url}/planos.html` }),
    texto: `Seu plano ${plano} vai até ${data(ate)}. Renove em ${url}/planos.html`,
  }),
  acessoEncerrado: ({ nome, url }) => ({
    assunto: 'Seu acesso completo terminou',
    html: moldura('Seu acesso completo terminou', `<p>${esc(nome.split(' ')[0])}, sua conta voltou ao plano gratuito (25 questões por dia e 1 simulado por mês). Seu progresso continua salvo.</p>`, { texto: 'Voltar ao plano completo', url: `${url}/planos.html` }),
    texto: `Seu acesso completo terminou. Renove em ${url}/planos.html`,
  }),
  redefinirSenha: ({ nome, link }) => ({
    assunto: 'Redefina sua senha do RX ENAMED',
    html: moldura('Redefinir senha', `<p>${esc(nome.split(' ')[0])}, recebemos um pedido para trocar sua senha. O link vale por 1 hora. Se não foi você, ignore este e-mail.</p>`, { texto: 'Criar nova senha', url: link }),
    texto: `Redefina sua senha (vale 1 hora): ${link}`,
  }),
};

export function criarCorreio({ banco, config }, buscar = fetch) {
  const { chaveResend, remetente, responderPara } = config.email;
  return async function enviar({ modelo, para, usuarioId = null, chave = null, dados }) {
    if (chave && (await banco.um('SELECT 1 FROM emails WHERE chave = $1', [chave]))) return { ja: true };
    const { assunto, html, texto } = MODELOS[modelo]({ ...dados, url: config.urlBase });
    let status = 'simulado';
    let erro = null;
    if (chaveResend) {
      try {
        const r = await buscar('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${chaveResend}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: remetente, to: [para], subject: assunto, html, text: texto, ...(responderPara ? { reply_to: responderPara } : {}) }),
        });
        status = r.ok ? 'enviado' : 'falhou';
        if (!r.ok) erro = (await r.text()).slice(0, 300);
      } catch (e) { status = 'falhou'; erro = e.message.slice(0, 300); }
    }
    try {
      await banco.consulta('INSERT INTO emails (usuario_id, para, modelo, assunto, chave, status, erro) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [usuarioId, para, modelo, assunto, chave, status, erro]);
    } catch (e) { if (e.code !== '23505') throw e; } // chave repetida em envio simultâneo
    if (status === 'falhou') console.error('e-mail falhou', modelo, para, erro);
    return { status };
  };
}
