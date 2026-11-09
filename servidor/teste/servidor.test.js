// Testes de ponta a ponta do servidor: cadastro, checkout (PIX, cartão, boleto), aviso assinado, acesso, painel admin e reembolso.
// Precisa de um Postgres vazio em TEST_DATABASE_URL (padrão: o banco local de testes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { carregarConfig } from '../src/config.js';
import { criarBanco, migrar } from '../src/db.js';
import { carregarPlanos, somarMeses } from '../src/planos.js';
import { criarMercadoPago } from '../src/mercadopago.js';
import { criarApp } from '../src/app.js';
import { assinaturaMercadoPagoValida, cpfValido } from '../src/seguranca.js';
import { iniciarMpFalso } from './mp-falso.js';
import { criarCorreio } from '../src/email.js';
import { rodarRotinas } from '../src/rotinas.js';

const BANCO = process.env.TEST_DATABASE_URL || 'postgres://postgres@localhost:5433/rx_teste?host=/tmp';
const SEGREDO = 'segredo-de-teste';
const CPF = '52998224725';
// Ficha obrigatória do cadastro: celular, sexo e etapa da formação.
const FICHA = { telefone: '(11) 98765-4321', sexo: 'feminino', etapa: '6' };
let mpFalso; let banco; let servidor; let url; let planosTeste; let correio;
const enviados = [];

before(async () => {
  mpFalso = await iniciarMpFalso();
  banco = criarBanco(BANCO);
  await banco.consulta('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrar(banco);
  const config = carregarConfig({ DATABASE_URL: BANCO, MP_API_URL: mpFalso.url, MP_ACCESS_TOKEN: 'TEST', MP_PUBLIC_KEY: 'TEST-PUB',
    MP_WEBHOOK_SECRET: SEGREDO, ADMIN_EMAILS: 'admin@rx.test', PASTA_SITE: '/nao-existe', LIMITE_MULTIPLICADOR: '1000' });
  const planos = carregarPlanos(config.arquivoPlanos);
  planosTeste = planos;
  const base = criarCorreio({ banco, config });
  correio = async (msg) => { enviados.push(msg); return base(msg); };
  await new Promise((ok) => {
    servidor = criarApp({ banco, config: { ...config, urlBase: 'http://localhost' }, planos, mp: criarMercadoPago(config.mercadoPago), correio }).listen(0, ok);
  });
  url = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => { servidor?.close(); mpFalso?.fechar(); await banco?.fechar(); });

// Cliente com cookie, como um navegador.
function cliente() {
  let cookie = '';
  const req = async (metodo, caminho, corpo, extras = {}) => {
    const r = await fetch(url + caminho, {
      method: metodo, headers: { 'Content-Type': 'application/json', origin: 'http://localhost', ...(cookie ? { cookie } : {}), ...extras },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const novo = r.headers.get('set-cookie');
    if (novo) cookie = novo.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, corpo: tipo.includes('json') ? await r.json() : await r.text() };
  };
  return { get: (c) => req('GET', c), post: (c, b, e) => req('POST', c, b, e), put: (c, b) => req('PUT', c, b), del: (c) => req('DELETE', c, {}), cookie: () => cookie };
}
const assinar = (idDado, idReq = 'req-1', ts = Math.floor(Date.now() / 1000)) =>
  `ts=${ts},v1=${createHmac('sha256', SEGREDO).update(`id:${idDado};request-id:${idReq};ts:${ts};`).digest('hex')}`;
const avisar = (id, assinatura = assinar(String(id))) => fetch(`${url}/api/webhooks/mercadopago?data.id=${id}&type=payment`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signature': assinatura, 'x-request-id': 'req-1' },
  body: JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: String(id) } }),
});

test('utilitários: CPF, assinatura e soma de meses', () => {
  assert.ok(cpfValido('529.982.247-25'));
  assert.ok(!cpfValido('111.111.111-11'));
  const ts = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', 's').update(`id:123;request-id:r;ts:${ts};`).digest('hex');
  assert.ok(assinaturaMercadoPagoValida({ assinatura: `ts=${ts},v1=${v1}`, idRequisicao: 'r', idDado: '123', segredo: 's' }));
  assert.ok(!assinaturaMercadoPagoValida({ assinatura: `ts=${ts},v1=${v1}`, idRequisicao: 'r', idDado: '124', segredo: 's' }));
  assert.ok(!assinaturaMercadoPagoValida({ assinatura: `ts=${ts - 3600},v1=${v1}`, idRequisicao: 'r', idDado: '123', segredo: 's' }));
  assert.equal(somarMeses('2026-01-31T12:00:00Z', 1).toISOString().slice(0, 10), '2026-02-28');
});

test('cadastro, sessão e proteção das rotas', async () => {
  const a = cliente();
  assert.equal((await a.get('/api/eu')).corpo.usuario, null);
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: '123' , aceite: true, ...FICHA })).status, 400);
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: 'senha-forte-1' })).status, 400, 'sem aceite dos termos');
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: '12345678901' , aceite: true, ...FICHA })).status, 400, 'senha comum/sem letras');
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA }, { origin: 'https://golpe.test' })).status, 403);
  // Ficha completa: sem celular, sexo ou etapa, ou com a confirmação diferente, o cadastro é recusado.
  const base = { nome: 'Ana Souza', email: 'ana@rx.test', senha: 'senha-forte-1', aceite: true };
  assert.equal((await a.post('/api/cadastro', { ...base, ...FICHA, telefone: '1234' })).status, 400, 'celular curto');
  assert.equal((await a.post('/api/cadastro', { ...base, ...FICHA, sexo: '' })).status, 400, 'sem sexo');
  assert.equal((await a.post('/api/cadastro', { ...base, ...FICHA, etapa: '9' })).status, 400, 'etapa inválida');
  assert.equal((await a.post('/api/cadastro', { ...base, ...FICHA, confirmacao: 'outra-senha-9' })).status, 400, 'senhas diferentes');
  assert.equal((await a.post('/api/cadastro', { ...base, ...FICHA, confirmacao: 'senha-forte-1' })).status, 201);
  const ficha = await banco.um(`SELECT telefone, sexo, etapa FROM usuarios WHERE email = 'ana@rx.test'`);
  assert.deepEqual(ficha, { telefone: '11987654321', sexo: 'feminino', etapa: '6' });
  assert.equal((await cliente().post('/api/cadastro', { nome: 'Ana', email: 'ANA@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA })).status, 409);
  const eu = (await a.get('/api/eu')).corpo;
  assert.equal(eu.usuario.email, 'ana@rx.test');
  assert.deepEqual(eu.acesso, { ativo: false, plano: 'gratis', ate: null, planos: [], recursos: [] });
  assert.equal((await a.get('/api/admin/resumo')).status, 403);
  assert.equal((await cliente().post('/api/checkout/pagar', { plano: 'mensal', metodo: 'pix', cpf: CPF })).status, 401);
  assert.equal((await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'pix', cpf: CPF }, { origin: 'https://golpe.test' })).status, 403);
  const b = cliente();
  assert.equal((await b.post('/api/entrar', { email: 'ana@rx.test', senha: 'errada' })).status, 401);
  assert.equal((await b.post('/api/entrar', { email: 'ana@rx.test', senha: 'senha-forte-1' })).status, 200);
  assert.equal((await b.post('/api/sair', {})).status, 200);
  assert.equal((await b.get('/api/eu')).corpo.usuario, null);
});

test('PIX: pedido pendente, aviso com assinatura falsa é recusado, aviso válido libera o acesso uma vez só', async () => {
  const a = cliente();
  await a.post('/api/cadastro', { nome: 'Bruno Lima', email: 'bruno@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA });
  assert.equal((await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'pix', cpf: '123' })).status, 400);
  const r = await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'pix', cpf: CPF, valor: 1 });
  assert.equal(r.status, 201);
  const { pedido } = r.corpo;
  assert.equal(pedido.status, 'pendente');
  assert.equal(pedido.valorCentavos, 19790, 'o preço vem do servidor, não do navegador');
  assert.equal(pedido.pagamento.pixCopiaECola, '00020126PIXFALSO');
  const mpId = [...mpFalso.pagamentos.values()].find((p) => p.external_reference === pedido.id).id;

  mpFalso.aprovar(mpId);
  assert.equal((await avisar(mpId, 'ts=1,v1=falso')).status, 401);
  assert.equal((await a.get('/api/eu')).corpo.acesso.ativo, false);
  assert.equal((await avisar(mpId)).status, 200);
  assert.equal((await avisar(mpId)).status, 200); // repetido: não cria outra matrícula
  const eu = (await a.get('/api/eu')).corpo;
  assert.equal(eu.acesso.ativo, true);
  assert.equal(eu.acesso.plano, 'mensal');
  const n = await banco.um('SELECT count(*) AS n FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id WHERE u.email = $1', ['bruno@rx.test']);
  assert.equal(n.n, 1);
  assert.equal((await a.get(`/api/pedidos/${pedido.id}`)).corpo.pedido.status, 'aprovado');
  assert.equal((await cliente().get(`/api/pedidos/${pedido.id}`)).status, 401);
});

test('cartão: aprovado na hora, recusado com mensagem, parcelas acima do limite bloqueadas; renovação soma ao período atual', async () => {
  const a = cliente();
  await a.post('/api/cadastro', { nome: 'Carla Dias', email: 'carla@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA });
  const recusado = await a.post('/api/checkout/pagar', { plano: 'ciclo', metodo: 'cartao', cpf: CPF, cartao: { token: 'cartao-recusado', metodoPagamento: 'visa', parcelas: 1 } });
  assert.equal(recusado.status, 402);
  assert.match(recusado.corpo.erro, /limite/);
  assert.equal((await a.post('/api/checkout/pagar', { plano: 'ciclo', metodo: 'cartao', cpf: CPF, cartao: { token: 'ok', metodoPagamento: 'visa', parcelas: 12 } })).status, 400);
  const ok = await a.post('/api/checkout/pagar', { plano: 'ciclo', metodo: 'cartao', cpf: CPF, cartao: { token: 'ok', metodoPagamento: 'visa', parcelas: 6 } });
  assert.equal(ok.status, 201);
  assert.equal(ok.corpo.pedido.status, 'aprovado');
  assert.equal(ok.corpo.pedido.pagamento.finalCartao, '4242');
  const ate1 = new Date((await a.get('/api/eu')).corpo.acesso.ate);
  await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: CPF, cartao: { token: 'ok2', metodoPagamento: 'visa', parcelas: 1 } });
  const fins = await banco.varios(`SELECT m.inicio, m.fim FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id WHERE u.email = 'carla@rx.test' ORDER BY m.fim`);
  assert.equal(fins.length, 2);
  assert.equal(fins[1].inicio.getTime(), ate1.getTime(), 'o novo período começa quando o atual termina');
});

test('boleto: devolve link e código de barras', async () => {
  const a = cliente();
  await a.post('/api/cadastro', { nome: 'Davi Reis', email: 'davi@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA });
  const r = await a.post('/api/checkout/pagar', { plano: 'segunda-etapa', metodo: 'boleto', cpf: CPF });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.pedido.pagamento.boletoUrl, 'https://mp.test/boleto');
  assert.equal(r.corpo.pedido.valorCentavos, 129700);
});

test('admin: resumo de vendas, lista de alunos, liberação manual, revogação, reembolso e CSV', async () => {
  const adm = cliente();
  await adm.post('/api/cadastro', { nome: 'Admin RX', email: 'admin@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA });
  const resumo = (await adm.get('/api/admin/resumo?dias=30')).corpo;
  assert.equal(resumo.receita.total, 19790 + 99700 + 19790);
  assert.equal(resumo.alunos.ativos, 2);
  assert.equal(resumo.serie.length, 30);
  assert.ok(resumo.conversao > 0 && resumo.conversao < 1);

  const ativos = (await adm.get('/api/admin/alunos?situacao=ativo')).corpo;
  assert.deepEqual(ativos.alunos.map((x) => x.email).sort(), ['bruno@rx.test', 'carla@rx.test']);
  const davi = (await adm.get('/api/admin/alunos?busca=davi')).corpo.alunos[0];
  assert.equal(davi.situacao, 'gratuito');

  assert.equal((await adm.post(`/api/admin/alunos/${davi.id}/acesso`, { acao: 'conceder', plano: 'anual', meses: 12, observacao: 'bolsa' })).status, 201);
  assert.equal((await adm.get(`/api/admin/alunos/${davi.id}`)).corpo.matriculas[0].origem, 'manual');
  assert.equal((await adm.post(`/api/admin/alunos/${davi.id}/acesso`, { acao: 'revogar' })).corpo.revogadas, 1);
  assert.equal((await adm.get('/api/admin/alunos?busca=davi')).corpo.alunos[0].situacao, 'expirado');

  const pedidoBruno = (await adm.get('/api/admin/pedidos?status=aprovado')).corpo.pedidos.find((p) => p.email === 'bruno@rx.test');
  const reemb = await adm.post(`/api/admin/pedidos/${pedidoBruno.id}/reembolsar`, { motivo: 'arrependimento em 7 dias' });
  assert.equal(reemb.corpo.pedido.status, 'reembolsado');
  assert.equal((await adm.get('/api/admin/alunos?busca=bruno')).corpo.alunos[0].situacao, 'expirado');

  const planilha = await adm.get('/api/admin/alunos?formato=csv');
  assert.match(planilha.corpo, /Carla Dias/);
  const eventos = (await adm.get('/api/admin/auditoria')).corpo.eventos.map((e) => e.acao);
  assert.deepEqual(eventos.sort(), ['conceder_acesso', 'reembolsar', 'revogar_acesso']);
});

test('e-mails: boas-vindas, PIX gerado e pagamento aprovado ficam registrados, sem repetir', async () => {
  const modelos = (await banco.varios(`SELECT e.modelo FROM emails e JOIN usuarios u ON u.id = e.usuario_id WHERE u.email = 'bruno@rx.test'`)).map((e) => e.modelo).sort();
  assert.deepEqual(modelos, ['boasVindas', 'pagamentoAprovado', 'pixGerado']);
  assert.equal((await banco.um(`SELECT status FROM emails LIMIT 1`)).status, 'simulado');
});

test('senha: esqueci e redefinir com link de uso único', async () => {
  const anonimo = cliente();
  const r = await anonimo.post('/api/senha/esqueci', { email: 'carla@rx.test' });
  assert.equal(r.status, 200);
  assert.equal((await anonimo.post('/api/senha/esqueci', { email: 'ninguem@rx.test' })).corpo.mensagem, r.corpo.mensagem, 'não revela se o e-mail existe');
  const link = enviados.filter((m) => m.modelo === 'redefinirSenha').at(-1).dados.link;
  const token = new URL(link).searchParams.get('token');
  assert.equal((await anonimo.post('/api/senha/redefinir', { token, senha: '123' })).status, 400);
  assert.equal((await anonimo.post('/api/senha/redefinir', { token, senha: 'nova-senha-123' })).status, 200);
  assert.equal((await anonimo.get('/api/eu')).corpo.usuario.email, 'carla@rx.test');
  assert.equal((await cliente().post('/api/senha/redefinir', { token, senha: 'outra-senha-123' })).status, 400, 'link não vale duas vezes');
  assert.equal((await cliente().post('/api/entrar', { email: 'carla@rx.test', senha: 'nova-senha-123' })).status, 200);
});

test('cupons e afiliados: desconto calculado no servidor, comissão, limite de usos e uso contado na aprovação', async () => {
  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const af = (await adm.post('/api/admin/afiliados', { nome: 'Dra. Paula', email: 'paula@rx.test', codigo: 'paula', comissaoPercentual: 30 })).corpo.afiliado;
  assert.equal((await adm.post('/api/admin/cupons', { codigo: 'RX20', tipo: 'percentual', valor: 20, limiteUsos: 1, planos: ['ciclo'] })).status, 201);
  assert.equal((await adm.post('/api/admin/cupons', { codigo: 'rx20', tipo: 'percentual', valor: 10 })).status, 409);
  assert.equal((await adm.post('/api/admin/cupons', { codigo: 'PAULA50', tipo: 'fixo', valor: 50, afiliadoId: af.id })).status, 201);

  const a = cliente();
  await a.post('/api/cadastro', { nome: 'Elisa Melo', email: 'elisa@rx.test', senha: 'senha-forte-1' , aceite: true, ...FICHA });
  assert.equal((await a.post('/api/checkout/cupom', { plano: 'mensal', cupom: 'RX20' })).status, 400, 'cupom só do ciclo');
  const previa = (await a.post('/api/checkout/cupom', { plano: 'ciclo', cupom: 'rx20' })).corpo;
  assert.equal(previa.valorCentavos, 99700 - 19940);
  const p1 = (await a.post('/api/checkout/pagar', { plano: 'ciclo', metodo: 'cartao', cpf: CPF, cupom: 'RX20', cartao: { token: 'ok', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(p1.valorCentavos, 99700 - 19940);
  assert.equal(p1.descontoCentavos, 19940);
  assert.equal((await banco.um(`SELECT usos FROM cupons WHERE codigo = 'RX20'`)).usos, 1);
  assert.equal((await a.post('/api/checkout/cupom', { plano: 'ciclo', cupom: 'RX20' })).status, 400, 'limite de 1 uso atingido');

  const p2 = (await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: CPF, cupom: 'PAULA50', cartao: { token: 'ok3', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(p2.valorCentavos, 19790 - 5000);
  const p3 = (await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: CPF, ref: 'PAULA', cartao: { token: 'ok4', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(p3.valorCentavos, 19790, 'link de indicação não dá desconto, só atribui a venda');
  const lista = (await adm.get('/api/admin/afiliados')).corpo.afiliados.find((x) => x.codigo === 'PAULA');
  assert.equal(lista.vendas, 2);
  assert.equal(lista.comissao_em_garantia, Math.round(14790 * 0.3) + Math.round(19790 * 0.3));
  assert.equal(lista.comissao_liberada, 0, 'comissão só libera depois dos 7 dias de garantia');
  const resumo = (await adm.get('/api/admin/resumo')).corpo;
  assert.equal(resumo.porAfiliado[0].codigo, 'PAULA');
  assert.ok(resumo.porCupom.some((c) => c.codigo === 'RX20'));
});

test('progresso: salva na conta e devolve em outro aparelho', async () => {
  const celular = cliente();
  await celular.post('/api/entrar', { email: 'davi@rx.test', senha: 'senha-forte-1' });
  assert.equal((await celular.get('/api/progresso')).corpo.dados, null);
  const dados = { versao: 1, respostas: { q1: [{ t: 1, escolha: 'A', certa: true, origem: 'treino' }] }, aulas: {} };
  assert.equal((await celular.post('/api/progresso', dados)).status, 404, 'só PUT');
  const r = await fetch(`${url}/api/progresso`, { method: 'PUT', headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: await (async () => { const c = cliente(); await c.post('/api/entrar', { email: 'davi@rx.test', senha: 'senha-forte-1' }); return c.cookie(); })() }, body: JSON.stringify({ dados }) });
  assert.equal(r.status, 200);
  assert.deepEqual((await celular.get('/api/progresso')).corpo.dados.respostas, dados.respostas);
  assert.equal((await cliente().get('/api/progresso')).status, 401);
});

test('rotinas: aviso de vencimento em 7 dias, uma vez só', async () => {
  const u = await banco.um(`SELECT id FROM usuarios WHERE email = 'davi@rx.test'`);
  await banco.consulta(`INSERT INTO matriculas (usuario_id, plano_id, fim, origem) VALUES ($1, 'mensal', now() + interval '5 days', 'manual')`, [u.id]);
  const r1 = await rodarRotinas({ banco, planos: planosTeste, correio });
  assert.ok(r1.vencendo >= 1);
  await rodarRotinas({ banco, planos: planosTeste, correio });
  const n = await banco.um(`SELECT count(*) AS n FROM emails WHERE usuario_id = $1 AND modelo = 'acessoVencendo'`, [u.id]);
  assert.equal(n.n, 1);
});

test('segurança: bloqueio por tentativas, sem origem é recusado, cabeçalhos e duas etapas para admin', async () => {
  const sem = await fetch(`${url}/api/entrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(sem.status, 403, 'POST sem Origin/Referer é recusado');
  const h = (await fetch(`${url}/entrar`)).headers;
  assert.match(h.get('content-security-policy'), /object-src 'none'/);
  assert.doesNotMatch(h.get('content-security-policy').split(';').find((x) => x.includes('script-src')), /unsafe-inline/);
  assert.equal(h.get('x-frame-options'), 'DENY');

  const c = cliente();
  await c.post('/api/cadastro', { nome: 'Fábio Prado', email: 'fabio@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  for (let i = 0; i < 8; i += 1) assert.equal((await cliente().post('/api/entrar', { email: 'fabio@rx.test', senha: 'errada-' + i })).status, 401);
  assert.equal((await cliente().post('/api/entrar', { email: 'fabio@rx.test', senha: 'senha-forte-1' })).status, 429, 'conta bloqueada após 8 erros');
  await banco.consulta(`UPDATE usuarios SET bloqueado_ate = NULL WHERE email = 'fabio@rx.test'`);

  // Duas etapas: ativa para o admin; um novo login só acessa o painel depois do código.
  const { codigoTotp } = await import('../src/seguranca.js');
  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const { segredo } = (await adm.post('/api/2fa/iniciar', {})).corpo;
  assert.equal((await adm.post('/api/2fa/ativar', { codigo: '000000' })).status, 400);
  const ativ = await adm.post('/api/2fa/ativar', { codigo: codigoTotp(segredo) });
  assert.equal(ativ.corpo.codigosRecuperacao.length, 10);
  assert.equal((await adm.get('/api/admin/resumo')).status, 200, 'a sessão que ativou já está verificada');
  const outro = cliente();
  assert.equal((await outro.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' })).corpo.precisa2fa, true);
  assert.equal((await outro.get('/api/admin/resumo')).corpo.codigo, '2fa_verificar');
  assert.equal((await outro.post('/api/2fa/verificar', { codigo: ativ.corpo.codigosRecuperacao[0] })).status, 200, 'código de recuperação');
  assert.equal((await outro.get('/api/admin/resumo')).status, 200);
  const terceiro = cliente();
  await terceiro.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  assert.equal((await terceiro.post('/api/2fa/verificar', { codigo: ativ.corpo.codigosRecuperacao[0] })).status, 400, 'recuperação vale uma vez');
});

test('LGPD: exportar dados e excluir a conta', async () => {
  const c = cliente();
  await c.post('/api/cadastro', { nome: 'Gina Luz', email: 'gina@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  const dados = await c.get('/api/eu/dados');
  assert.equal(dados.corpo.conta.email, 'gina@rx.test');
  assert.ok(dados.corpo.conta.aceite_termos_em);
  assert.equal((await c.post('/api/eu/excluir', { senha: 'errada' })).status, 400);
  assert.equal((await c.post('/api/eu/excluir', { senha: 'senha-forte-1' })).status, 200);
  assert.equal((await c.get('/api/eu')).corpo.usuario, null);
  assert.equal((await cliente().post('/api/entrar', { email: 'gina@rx.test', senha: 'senha-forte-1' })).status, 401);
  const u = await banco.um(`SELECT nome, cpf FROM usuarios WHERE excluido_em IS NOT NULL`);
  assert.equal(u.nome, 'Conta excluída');
});

test('área do aluno: sem login vai para o cadastro; dados da plataforma exigem conta', async () => {
  const semLogin = await fetch(`${url}/plataforma/index.html`, { redirect: 'manual' });
  assert.equal(semLogin.status, 302);
  assert.match(semLogin.headers.get('location'), /^\/entrar\?modo=cadastro&voltar=%2Fplataforma%2Findex\.html/);
  assert.equal((await fetch(`${url}/plataforma/data/comentarios.json`)).status, 401);
  const c = cliente();
  await c.post('/api/cadastro', { nome: 'Hugo Reis', email: 'hugo@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  const comLogin = await fetch(`${url}/plataforma/data/comentarios.json`, { headers: { cookie: c.cookie() }, redirect: 'manual' });
  assert.notEqual(comLogin.status, 401, 'logado passa pela restrição');
  assert.notEqual(comLogin.status, 302);
});

test('indicação: link, desconto de 10% para o indicado, 30 dias para quem indicou, sem autoindicação e cancelada no reembolso', async () => {
  const ana = cliente();
  await ana.post('/api/cadastro', { nome: 'Iara Nunes', email: 'iara@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  const meu = (await ana.get('/api/indicacao')).corpo;
  assert.match(meu.codigo, /^IARA[A-Z2-9]{4}$/);
  assert.equal(meu.link, `http://localhost/i/${meu.codigo}`);

  // O amigo abre o link (cookie de indicação) e se cadastra.
  const link = await fetch(`${url}/i/${meu.codigo}`, { redirect: 'manual' });
  assert.equal(link.status, 302);
  const cookieInd = link.headers.get('set-cookie').split(';')[0];
  const amigo = cliente();
  const cad = await fetch(`${url}/api/cadastro`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: cookieInd },
    body: JSON.stringify({ nome: 'João Pires', email: 'joao@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA }) });
  assert.equal(cad.status, 201);
  await amigo.post('/api/entrar', { email: 'joao@rx.test', senha: 'senha-forte-1' });
  assert.equal((await banco.um(`SELECT origem FROM usuarios WHERE email = 'joao@rx.test'`)).origem, 'indicacao');
  assert.equal((await amigo.get('/api/checkout/config')).corpo.descontoIndicacao, 10);

  const compra = (await amigo.post('/api/checkout/pagar', { plano: 'ciclo', metodo: 'cartao', cpf: '11144477735', cartao: { token: 'ind1', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(compra.valorCentavos, 99700 - 9970, '10% de desconto na primeira compra');
  const iara = (await ana.get('/api/indicacao')).corpo;
  assert.equal(iara.cadastros, 1);
  assert.equal(iara.compraram, 1);
  assert.equal(iara.dias, 30);
  assert.equal((await ana.get('/api/eu')).corpo.acesso.ativo, true, 'quem indicou ganhou acesso completo');
  assert.ok(enviados.some((m) => m.modelo === 'indicacaoRecompensa'));

  // Segunda compra do indicado: sem desconto e sem nova recompensa.
  const segunda = (await amigo.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: '11144477735', cartao: { token: 'ind2', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(segunda.valorCentavos, 19790);
  assert.equal((await ana.get('/api/indicacao')).corpo.compraram, 1);

  // Reembolso da primeira compra cancela os 30 dias.
  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const { codigoTotp } = await import('../src/seguranca.js');
  const seg = (await banco.um(`SELECT totp_segredo FROM usuarios WHERE email = 'admin@rx.test'`)).totp_segredo;
  await adm.post('/api/2fa/verificar', { codigo: codigoTotp(seg) });
  assert.equal((await adm.post(`/api/admin/pedidos/${compra.id}/reembolsar`, { motivo: 'teste' })).status, 200);
  assert.equal((await ana.get('/api/indicacao')).corpo.compraram, 0);
  assert.equal((await ana.get('/api/eu')).corpo.acesso.ativo, false, 'dias da indicação cancelados');

  // Autoindicação pelo mesmo CPF não gera recompensa.
  const meuLink = await fetch(`${url}/i/${meu.codigo}`, { redirect: 'manual' });
  const ck = meuLink.headers.get('set-cookie').split(';')[0];
  await fetch(`${url}/api/cadastro`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: ck },
    body: JSON.stringify({ nome: 'Iara Segunda', email: 'iara2@rx.test', senha: 'senha-forte-1', aceite: true }) });
  await banco.consulta(`UPDATE usuarios SET cpf = '52998224725' WHERE email IN ('iara@rx.test', 'iara2@rx.test')`);
  const fake = cliente();
  await fake.post('/api/entrar', { email: 'iara2@rx.test', senha: 'senha-forte-1' });
  await fake.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: CPF, cartao: { token: 'ind3', metodoPagamento: 'visa', parcelas: 1 } });
  assert.equal((await ana.get('/api/indicacao')).corpo.compraram, 0, 'mesmo CPF não recompensa');
});

test('metas: progresso, ritmo, funil com visitas anônimas e edição pelo admin', async () => {
  const antes = (await banco.um(`SELECT total, unicos FROM visitas WHERE pagina = 'planos'`)) || { total: 0, unicos: 0 };
  await fetch(`${url}/planos.html`, { headers: { 'user-agent': 'Mozilla/5.0 teste' } });
  await fetch(`${url}/planos.html`, { headers: { 'user-agent': 'Mozilla/5.0 teste' } });
  await fetch(`${url}/planos.html`, { headers: { 'user-agent': 'Googlebot/2.1' } });
  await new Promise((ok) => setTimeout(ok, 200));
  const v = await banco.um(`SELECT total, unicos FROM visitas WHERE pagina = 'planos'`);
  assert.equal(v.total - antes.total, 2, 'robôs não contam');
  assert.equal(v.unicos - antes.unicos, 1, 'mesmo visitante conta uma vez por dia');

  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const { codigoTotp } = await import('../src/seguranca.js');
  const seg = (await banco.um(`SELECT totp_segredo FROM usuarios WHERE email = 'admin@rx.test'`)).totp_segredo;
  await adm.post('/api/2fa/verificar', { codigo: codigoTotp(seg) });
  const m = (await adm.get('/api/admin/metas')).corpo;
  assert.equal(m.metas.usuarios, 100);
  assert.equal(m.metas.receitaCentavos, 100000000);
  assert.ok(m.atual.usuarios > 5);
  assert.ok(m.atual.receita > 0);
  assert.equal(m.serie.length, 60);
  assert.ok(m.funil.visitantes >= 1);
  assert.equal(m.topIndicadores[0].codigo.slice(0, 4), 'IARA');
  const put = await fetch(`${url}/api/admin/metas`, { method: 'PUT', headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: adm.cookie() },
    body: JSON.stringify({ usuarios: 500, receitaReais: 1000000, prazo: '2027-12-31' }) });
  assert.equal(put.status, 200);
  const m2 = (await adm.get('/api/admin/metas')).corpo;
  assert.equal(m2.metas.usuarios, 500);
  assert.ok(m2.diasRestantes > 300);
  assert.ok(m2.necessario.receitaDia > 0);
});

test('IA do simulador: login, streaming, recusa, limite do plano gratuito', async () => {
  // Sem chave: a rota existe e avisa que a IA está desligada.
  const a = cliente();
  assert.equal((await a.post('/api/ia/mensagem', { entrada: 'oi' })).status, 401);
  const cad = await a.post('/api/cadastro', { nome: 'Sofia Ramos', email: 'simulador@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  assert.equal(cad.status, 201, JSON.stringify(cad.corpo));
  assert.deepEqual((await a.get('/api/ia/estado')).corpo, { disponivel: false, limiteDia: 0 });
  assert.equal((await a.post('/api/ia/mensagem', { entrada: 'oi' })).status, 503);

  // Com um cliente falso da API: confere o pedido montado e o texto devolvido aos pedaços.
  const pedidos = [];
  const falso = { beta: { messages: { stream: (params) => {
    pedidos.push(params);
    const ouvintes = [];
    const recusa = params.messages.at(-1).content === 'recuse';
    queueMicrotask(() => ['Começou ', 'há uma hora.'].forEach((d) => ouvintes.forEach((f) => f(d))));
    return { on: (ev, f) => { if (ev === 'text') ouvintes.push(f); }, finalMessage: async () => { await new Promise((r) => setTimeout(r, 5)); return { stop_reason: recusa ? 'refusal' : 'end_turn' }; } };
  } } } };
  const subir = (extra) => new Promise((ok) => {
    const config = carregarConfig({ DATABASE_URL: BANCO, PASTA_SITE: '/nao-existe', ADMIN_EMAILS: 'admin@rx.test', ...extra });
    const s = criarApp({ banco, config: { ...config, urlBase: 'http://localhost' }, planos: planosTeste, mp: criarMercadoPago(config.mercadoPago), correio, ia: falso }).listen(0, () => ok(s));
  });
  const s1 = await subir({ LIMITE_MULTIPLICADOR: '1000' });
  const base = `http://127.0.0.1:${s1.address().port}`;
  const post = (corpo) => fetch(`${base}/api/ia/mensagem`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: a.cookie() }, body: JSON.stringify(corpo) });
  try {
    const r = await post({ entrada: [{ role: 'user', content: 'Quando começou?' }], sistema: 'Você é o paciente.', nivel: 'quick' });
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'Começou há uma hora.');
    const p = pedidos.at(-1);
    assert.equal(p.model, 'claude-opus-5-5');
    assert.equal(p.output_config.effort, 'low');
    assert.equal(p.fallbacks, 'default');
    assert.match(p.system, /RX ENAMED[\s\S]*Você é o paciente\./);
    assert.ok((await (await post({ entrada: 'recuse' })).text()).endsWith('\n\u0000refused'));
    assert.equal((await post({ entrada: [{ role: 'assistant', content: 'x' }] })).status, 400, 'última fala precisa ser do aluno');
    assert.equal((await post({ entrada: 'x'.repeat(70_000) })).status, 400);
  } finally { s1.close(); }

  // Plano gratuito com limite zero: bloqueia e convida a assinar.
  const s2 = await subir({ IA_LIMITE_DIA_GRATIS: '0' });
  try {
    const r = await fetch(`http://127.0.0.1:${s2.address().port}/api/ia/mensagem`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: a.cookie() }, body: JSON.stringify({ entrada: 'oi' }) });
    assert.equal(r.status, 429);
    assert.equal((await r.json()).codigo, 'quota');
  } finally { s2.close(); }
});

test('residência: banco privado, só administradores', async () => {
  const aluno = cliente();
  assert.equal((await aluno.get('/api/residencia/questoes')).status, 401);
  await aluno.post('/api/cadastro', { nome: 'Rita Prado', email: 'residencia-aluno@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  assert.equal((await aluno.get('/api/residencia/questoes')).status, 404, 'aluno não vê nem que a rota existe');
  const adm = cliente();
  assert.equal((await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' })).status, 200);
  const r = await adm.get('/api/residencia/questoes');
  assert.equal(r.status, 200);
  assert.ok(r.corpo.questoes.length >= 50);
  for (const q of r.corpo.questoes) {
    assert.ok(q.id && q.enunciado && q.comentario && q.alternativas.length === 4, q.id);
    assert.ok('ABCD'.includes(q.gabarito), q.id);
  }
  assert.equal(new Set(r.corpo.questoes.map((q) => q.id)).size, r.corpo.questoes.length, 'ids únicos');
});

// ---------------------------------------------------------------- 2ª etapa: estações, motor gratuito, simulados e dupla

async function alunoNovo(nome) {
  const c = cliente();
  const email = `${nome.toLowerCase()}-${Date.now()}@rx.test`;
  assert.equal((await c.post('/api/cadastro', { nome, email, senha: 'senha-forte-1', aceite: true, ...FICHA })).status, 201);
  c.email = email;
  return c;
}

async function darPlano(c, plano) {
  await banco.consulta(`INSERT INTO matriculas (usuario_id, plano_id, fim, origem) SELECT id, $2, now() + interval '30 days', 'manual' FROM usuarios WHERE email = $1`, [c.email, plano]);
}

test('2ª etapa: candidato só recebe o impresso da porta; PEP e roteiro só depois de encerrar', async () => {
  const anon = cliente();
  assert.equal((await anon.get('/api/pratica/estacoes')).status, 401);
  const a = await alunoNovo('Carla');
  const lista = (await a.get('/api/pratica/estacoes')).corpo;
  assert.ok(lista.estacoes.length >= 50, 'autorais e oficiais publicadas');
  assert.ok(lista.estacoes.some((e) => e.origem === 'oficial') && lista.estacoes.some((e) => e.origem === 'autoral'));
  const textoLista = JSON.stringify(lista.estacoes);
  for (const reservado of ['"pep"', '"achado"', '"resultado"', '"diagnostico"', '"resposta"']) assert.ok(!textoLista.includes(reservado), `lista sem ${reservado}`);

  const cand = (await a.get('/api/pratica/estacoes/cm-01-dor-toracica')).corpo.estacao;
  assert.ok(cand.cenario && cand.tarefas.length);
  assert.equal(cand.pep, undefined);
  assert.ok(!JSON.stringify(cand).includes('Supradesnivelamento'), 'resultado do ECG não vai para o candidato');
  assert.equal((await a.get('/api/pratica/estacoes/inep-2022-1-e01')).status, 404, 'estação em revisão não aparece para aluno');

  const t = (await a.post('/api/pratica/tentativas', { estacaoId: 'cm-01-dor-toracica', modo: 'gratuito' })).corpo;
  assert.ok(t.id);
  const r1 = (await a.post(`/api/pratica/tentativas/${t.id}/fala`, { texto: 'Quando começou a dor?' })).corpo;
  assert.equal(r1.de, 'paciente');
  assert.match(r1.texto, /hora/);
  const r2 = (await a.post(`/api/pratica/tentativas/${t.id}/fala`, { texto: 'Solicito um ECG de 12 derivações' })).corpo;
  assert.equal(r2.de, 'examinador');
  assert.match(r2.texto, /Supradesnivelamento/);
  const r3 = (await a.post(`/api/pratica/tentativas/${t.id}/revelar`, { chave: 'a5' })).corpo;
  assert.ok(r3.texto && r3.pergunta);
  assert.equal((await a.post(`/api/pratica/tentativas/${t.id}/resultado`, { niveis: {} })).status, 409, 'nota só depois de encerrar');
  assert.equal((await a.post(`/api/pratica/tentativas/${t.id}/ia/avaliar`, {})).status, 503, 'sem chave, IA desligada');

  const fim = (await a.post(`/api/pratica/tentativas/${t.id}/encerrar`, { conclusao: 'IAM com supra de ST anterior; AAS, clopidogrel e angioplastia primária.' })).corpo;
  assert.equal(fim.correcao.pep.length, 10);
  assert.ok(fim.correcao.pacienteCompleto.roteiro.length);
  assert.equal((await a.post(`/api/pratica/tentativas/${t.id}/fala`, { texto: 'mais uma' })).status, 409, 'não conversa depois de encerrar');

  const niveis = Object.fromEntries(fim.correcao.pep.map((c, i) => [c.id, i < 6 ? 'adequado' : i < 8 ? 'parcial' : 'inadequado']));
  const res = (await a.post(`/api/pratica/tentativas/${t.id}/resultado`, { niveis, avaliadoPor: 'autoavaliacao' })).corpo;
  assert.ok(res.nota > 0 && res.nota < 10);
  assert.equal(res.cumpridos.length, 6);
  assert.equal((await a.post(`/api/pratica/tentativas/${t.id}/resultado`, { niveis })).status, 409, 'uma nota por tentativa');
  const hist = (await a.get('/api/pratica/resultados')).corpo.resultados;
  assert.equal(hist[0].estacao_id, 'cm-01-dor-toracica');

  // Outro aluno não mexe na tentativa alheia.
  const b = await alunoNovo('Bruno');
  assert.equal((await b.post(`/api/pratica/tentativas/${t.id}/encerrar`, {})).status, 404);
});

test('2ª etapa: simulado de 10 estações segue o edital (duas por área) e fecha a nota média', async () => {
  const a = await alunoNovo('Dora');
  assert.equal((await a.post('/api/pratica/simulados', { quantidade: 10, edital: 'revalida-padrao' })).status, 403, 'simulado de estações exige plano');
  await darPlano(a, 'segunda-etapa');
  const s = (await a.post('/api/pratica/simulados', { quantidade: 10, edital: 'revalida-padrao' })).corpo;
  assert.equal(s.estacoes.length, 10);
  assert.deepEqual(s.blocos, [5, 5]);
  const porArea = {};
  for (const e of s.estacoes) porArea[e.area] = (porArea[e.area] || 0) + 1;
  assert.deepEqual(Object.values(porArea), [2, 2, 2, 2, 2]);
  const primeira = s.estacoes[0];
  const t = (await a.post('/api/pratica/tentativas', { estacaoId: primeira.id, modo: 'roteiro', simuladoId: s.id })).corpo;
  const fim = (await a.post(`/api/pratica/tentativas/${t.id}/encerrar`, { conclusao: '' })).corpo;
  const tudo = Object.fromEntries(fim.correcao.pep.map((c) => [c.id, 'adequado']));
  await a.post(`/api/pratica/tentativas/${t.id}/resultado`, { niveis: tudo });
  const fecha = (await a.post(`/api/pratica/simulados/${s.id}/concluir`, {})).corpo;
  assert.equal(fecha.feitas, 1);
  assert.equal(fecha.nota, 1, '10 numa estação e zero nas outras nove: média 1');
});

test('2ª etapa: dupla com médico e ator, Meet, impresso liberado, avaliação e nota no histórico do médico', async () => {
  const ator = await alunoNovo('Ator');
  const medico = await alunoNovo('Medico');
  assert.equal((await ator.post('/api/dupla/salas', { papel: 'ator', meetUrl: 'https://meet.google.com/abc-defg-hij' })).corpo.codigo, 'plano', 'criar sala exige plano');
  await darPlano(ator, 'mensal');
  assert.equal((await ator.post('/api/dupla/salas', { papel: 'ator', meetUrl: 'https://meet.google.com/abc-defg-hij' })).status, 403, 'mensal é só teoria');
  await darPlano(ator, 'ciclo');
  assert.equal((await ator.post('/api/dupla/salas', { papel: 'ator', meetUrl: 'https://golpe.test/x' })).status, 400, 'só link do Meet');
  const sala = (await ator.post('/api/dupla/salas', { papel: 'ator', meetUrl: 'https://meet.google.com/abc-defg-hij', estacaoId: 'cm-01-dor-toracica' })).corpo;
  assert.equal(sala.papel, 'ator');
  assert.ok(sala.reservado.pep.length, 'ator recebe o PEP');
  const entrou = (await medico.post(`/api/dupla/salas/${sala.codigo}/entrar`, {})).corpo;
  assert.equal(entrou.papel, 'medico');
  assert.equal(entrou.meetUrl, 'https://meet.google.com/abc-defg-hij');
  assert.equal(entrou.reservado, undefined, 'médico sem roteiro');
  assert.equal(entrou.estacao.titulo, 'Estação sorteada', 'em modo prova o médico não vê o tema antes de começar');
  assert.equal((await medico.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'iniciar' })).status, 403, 'quem inicia é o ator');
  assert.equal((await ator.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'iniciar' })).corpo.estado, 'em_andamento');
  let vm = (await medico.get(`/api/dupla/salas/${sala.codigo}`)).corpo;
  assert.ok(vm.estacao.tarefas.length, 'médico recebe o impresso da porta ao iniciar');
  assert.equal(vm.estacao.pedidos, undefined, 'sem lista de impressos para o médico');
  assert.equal(vm.avaliacao, undefined);
  assert.equal(vm.liberados.length, 0);
  await ator.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'liberar', chave: 'x0' });
  vm = (await medico.get(`/api/dupla/salas/${sala.codigo}`)).corpo;
  assert.match(vm.liberados[0].texto, /Supradesnivelamento/);
  assert.equal((await medico.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'avaliar', criterioId: 'ecg', nivel: 'adequado' })).status, 403, 'médico não avalia');
  for (const c of sala.reservado.pep) await ator.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'avaliar', criterioId: c.id, nivel: 'adequado' });
  assert.equal((await medico.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'encerrar' })).status, 403, 'médico não encerra antes do tempo');
  const fim = (await ator.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'encerrar' })).corpo;
  assert.equal(fim.resultado.nota, 10);
  vm = (await medico.get(`/api/dupla/salas/${sala.codigo}`)).corpo;
  assert.equal(vm.correcao.pep.length, 10, 'médico vê o PEP depois de encerrar');
  const hist = (await medico.get('/api/pratica/resultados')).corpo.resultados;
  assert.equal(hist[0].modo, 'dupla');
  assert.equal(hist[0].avaliado_por, 'ator');
  const intruso = await alunoNovo('Intruso');
  assert.equal((await intruso.get(`/api/dupla/salas/${sala.codigo}`)).status, 403);
  assert.equal((await intruso.post(`/api/dupla/salas/${sala.codigo}/entrar`, {})).status, 409, 'sala cheia');
  const nova = (await ator.post(`/api/dupla/salas/${sala.codigo}/acao`, { tipo: 'nova_rodada', trocarPapeis: true })).corpo;
  assert.equal(nova.papel, 'medico', 'papéis trocados na nova rodada');
});

test('2ª etapa: admin vê o acervo inteiro com origem, pendências e validação', async () => {
  // Admin próprio do teste (o admin principal já tem duas etapas ativadas pelo teste de segurança).
  const adm = await alunoNovo('Gestor');
  await banco.consulta("UPDATE usuarios SET papel = 'admin' WHERE nome = 'Gestor'");
  const r = (await adm.get('/api/admin/estacoes')).corpo;
  assert.ok(r.estacoes.length > 52);
  const revisao = r.estacoes.filter((e) => e.status === 'revisao');
  assert.ok(revisao.length && revisao.every((e) => e.pendencias.length), 'estação em revisão sempre diz o motivo');
  assert.ok(r.estacoes.filter((e) => e.status === 'publicada').every((e) => e.problemas.length === 0 && e.somaPep === 10));
  const aluno = await alunoNovo('Eva');
  assert.equal((await aluno.get('/api/admin/estacoes')).status, 403);
});

test('admin: mapa das escolas médicas e acompanhamento da prospecção', async () => {
  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const { codigoTotp } = await import('../src/seguranca.js');
  const seg = (await banco.um(`SELECT totp_segredo FROM usuarios WHERE email = 'admin@rx.test'`)).totp_segredo;
  await adm.post('/api/2fa/verificar', { codigo: codigoTotp(seg) });
  const resp = await adm.get('/api/admin/faculdades');
  assert.equal(resp.status, 200, JSON.stringify(resp.corpo).slice(0, 200));
  const { escolas, fonte } = resp.corpo;
  assert.equal(escolas.length, 467, 'todos os cursos de Medicina do censo');
  assert.match(fonte, /INEP/);
  assert.ok(escolas.every((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.uf && e.municipio), 'toda escola tem coordenadas, cidade e UF');
  assert.ok(escolas.some((e) => e.rede === 'Pública') && escolas.some((e) => e.rede === 'Privada'));
  const unb = escolas.find((e) => e.sigla === 'UNB');
  assert.equal(unb.crm, null);

  assert.equal((await adm.put(`/api/admin/faculdades/${unb.curso}`, { status: 'inventado' })).status, 400);
  assert.equal((await adm.put(`/api/admin/faculdades/${unb.curso}`, { status: 'contato_feito', contato_email: 'sem-arroba' })).status, 400);
  const salvo = (await adm.put(`/api/admin/faculdades/${unb.curso}`, { status: 'reuniao_agendada', prioridade: 'alta', contato_nome: 'Profa. Ana', contato_email: 'coord@unb.test', proxima_acao: 'Reunião com a coordenação', proxima_data: '2026-12-01' })).corpo.crm;
  assert.equal(salvo.status, 'reuniao_agendada');
  assert.equal((await adm.post(`/api/admin/faculdades/${unb.curso}/interacoes`, { tipo: 'ligacao', texto: 'Coordenação pediu apresentação online' })).status, 201);
  assert.equal((await adm.post(`/api/admin/faculdades/${unb.curso}/interacoes`, { tipo: 'pombo', texto: 'x' })).status, 400);
  const det = (await adm.get(`/api/admin/faculdades/${unb.curso}`)).corpo;
  assert.equal(det.crm.contato_nome, 'Profa. Ana');
  assert.equal(det.interacoes.length, 1);
  const lista = (await adm.get('/api/admin/faculdades')).corpo.escolas;
  assert.equal(lista.find((e) => e.curso === unb.curso).crm.interacoes, 1);
  const planilha = await adm.get('/api/admin/faculdades?formato=csv');
  assert.match(planilha.corpo, /Reunião com a coordenação/);
  assert.ok((await adm.get('/api/admin/auditoria')).corpo.eventos.some((e) => e.acao === 'faculdade_status'));
  assert.equal((await adm.get('/api/admin/faculdades/999999999')).status, 404);

  const aluno = cliente();
  await aluno.post('/api/cadastro', { nome: 'Leo Prospect', email: 'leo@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  assert.equal((await aluno.get('/api/admin/faculdades')).status, 403, 'aluno não vê a prospecção');
});

test('admin: eventos para estande e prospecção das faculdades do Paraguai', async () => {
  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const { codigoTotp } = await import('../src/seguranca.js');
  const seg = (await banco.um(`SELECT totp_segredo FROM usuarios WHERE email = 'admin@rx.test'`)).totp_segredo;
  await adm.post('/api/2fa/verificar', { codigo: codigoTotp(seg) });
  const r = await adm.get('/api/admin/eventos');
  assert.equal(r.status, 200, JSON.stringify(r.corpo).slice(0, 200));
  const { eventos, paraguai } = r.corpo;
  assert.ok(eventos.some((e) => /CBMFC/.test(e.nome) && String(e.inicio).startsWith('2027-04')), 'eventos levantados já vêm cadastrados');
  assert.ok(eventos.some((e) => e.pais === 'Paraguai' && e.publico === 'revalida'), 'apresentação no Paraguai');
  const ums = paraguai.universidades.find((u) => u.id === 'ums');
  assert.ok(ums.portaDeEntrada && ums.crm.prioridade === 'alta', 'UMS como porta de entrada');
  assert.ok(paraguai.universidades.every((u) => u.sedes.every((s) => paraguai.cidades[s])), 'toda sede tem coordenadas');
  assert.ok(paraguai.estatisticas.length >= 4 && paraguai.estatisticas.every((s) => s.fonte));

  assert.equal((await adm.post('/api/admin/eventos', { nome: 'X' })).status, 400);
  assert.equal((await adm.post('/api/admin/eventos', { nome: 'Feira teste', inicio: '2027-05-10', fim: '2027-05-01' })).status, 400);
  assert.equal((await adm.post('/api/admin/eventos', { nome: 'Feira teste', lat: '-25' })).status, 400, 'latitude sem longitude');
  assert.equal((await adm.post('/api/admin/eventos', { nome: 'Feira teste', site: 'javascript:alert(1)' })).status, 400);
  const novo = await adm.post('/api/admin/eventos', { nome: 'Congreso de estudiantes PJC', tipo: 'academico', publico: 'revalida', inicio: '2027-08-12', cidade: 'Pedro Juan Caballero', pais: 'Paraguai', lat: '-22,5472', lng: '-55.7333', custo_centavos: '150000', status: 'pedido_proposta' });
  assert.equal(novo.status, 201, JSON.stringify(novo.corpo));
  const id = novo.corpo.evento.id;
  assert.equal(novo.corpo.evento.lat, -22.5472);
  const editado = await adm.put(`/api/admin/eventos/${id}`, { ...novo.corpo.evento, status: 'fechado', proxima_acao: 'Enviar arte do estande' });
  assert.equal(editado.corpo.evento.status, 'fechado');
  assert.equal((await adm.post(`/api/admin/eventos/${id}/interacoes`, { tipo: 'whatsapp', texto: 'Organização confirmou o espaço' })).status, 201);
  const det = (await adm.get(`/api/admin/eventos/${id}`)).corpo;
  assert.equal(det.interacoes.length, 1);
  assert.equal((await adm.get('/api/admin/eventos/nao-existe')).status, 404);
  assert.ok((await adm.get('/api/admin/auditoria')).corpo.eventos.some((e) => e.acao === 'evento_status'));
  assert.equal((await adm.del(`/api/admin/eventos/${id}`)).status, 200);
  assert.equal((await adm.get(`/api/admin/eventos/${id}`)).status, 404);

  assert.equal((await adm.put('/api/admin/paraguai/ums', { status: 'inventado' })).status, 400);
  assert.equal((await adm.put('/api/admin/paraguai/ums', { status: 'reuniao_agendada', alunos_brasileiros: '-3' })).status, 400);
  const crm = (await adm.put('/api/admin/paraguai/ums', { status: 'reuniao_agendada', prioridade: 'alta', alunos_brasileiros: '1200', contato_nome: 'Coordinación', proxima_data: '2026-12-02' })).corpo.crm;
  assert.equal(crm.alunos_brasileiros, 1200);
  assert.equal((await adm.post('/api/admin/paraguai/ums/interacoes', { tipo: 'reuniao', texto: 'Data da palestra combinada' })).status, 201);
  assert.equal((await adm.get('/api/admin/paraguai/ums')).corpo.interacoes.length, 1);
  assert.equal((await adm.get('/api/admin/paraguai/inexistente')).status, 404);

  const aluno = cliente();
  await aluno.post('/api/cadastro', { nome: 'Rui Evento', email: 'rui-evento@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  assert.equal((await aluno.get('/api/admin/eventos')).status, 403, 'aluno não vê eventos');
});

test('plano ENAMED 4º ano: só para quem está até o 4º ano', async () => {
  const sexto = cliente();
  await sexto.post('/api/cadastro', { nome: 'Ana Sexto', email: 'ana-sexto@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA, etapa: '6' });
  const negado = await sexto.post('/api/checkout/pagar', { plano: 'enamed-4ano', metodo: 'pix', cpf: '52998224725' });
  assert.equal(negado.status, 403);
  assert.equal(negado.corpo.codigo, 'plano_etapa');
  const eu = (await sexto.get('/api/eu')).corpo;
  assert.equal(eu.usuario.etapa, '6', '/api/eu informa a etapa da ficha');
  const quarto = cliente();
  await quarto.post('/api/cadastro', { nome: 'Bia Quarto', email: 'bia-quarto@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA, etapa: '4' });
  const ok = await quarto.post('/api/checkout/pagar', { plano: 'enamed-4ano', metodo: 'pix', cpf: '52998224725' });
  assert.notEqual(ok.status, 403, JSON.stringify(ok.corpo));
});

test('simulado nacional: correção no servidor, ranking por faculdade e relatório da turma', async () => {
  const { readFileSync } = await import('node:fs');
  const banco_q = JSON.parse(readFileSync(new URL('../../app/public/data/questoes.json', import.meta.url), 'utf8')).questoes;
  const gab = new Map(banco_q.map((q) => [q.id, q]));
  const adm = cliente();
  await adm.post('/api/entrar', { email: 'admin@rx.test', senha: 'senha-forte-1' });
  const { codigoTotp } = await import('../src/seguranca.js');
  const seg = (await banco.um(`SELECT totp_segredo FROM usuarios WHERE email = 'admin@rx.test'`)).totp_segredo;
  await adm.post('/api/2fa/verificar', { codigo: codigoTotp(seg) });
  const agora = Date.now();
  assert.equal((await adm.post('/api/admin/nacional', { nome: 'X', exame: 'enamed' })).status, 400);
  const criado = await adm.post('/api/admin/nacional', { nome: 'Nacional teste', exame: 'enamed', quantidade: 20, duracaoMin: 60, inicio: new Date(agora - 60000).toISOString(), fim: new Date(agora + 3600000).toISOString() });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  const sim = criado.corpo.simulado;
  assert.equal(sim.questoes.length, 20);
  assert.ok(sim.questoes.every((id) => gab.get(id)?.gabarito && !gab.get(id).anulada), 'só questões válidas no caderno');
  assert.ok(new Set(sim.questoes.map((id) => gab.get(id).area)).size >= 4, 'caderno com várias áreas');

  // Faculdade: lista pública, cadastro com faculdade inválida recusado.
  const { faculdades } = (await cliente().get('/api/faculdades')).corpo;
  assert.ok(faculdades.length > 400 && faculdades.some((f) => f.codigo.startsWith('py:')));
  const unb = faculdades.find((f) => /Brasília/.test(f.nome) && f.codigo.startsWith('br:'));
  assert.equal((await cliente().post('/api/cadastro', { nome: 'Fac Errada', email: 'fac-errada@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA, faculdade: 'br:0' })).status, 400);

  const semFac = cliente();
  await semFac.post('/api/cadastro', { nome: 'Sem Faculdade', email: 'sem-fac@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  const r409 = await semFac.post(`/api/nacional/${sim.id}/iniciar`, {});
  assert.equal(r409.status, 409);
  assert.equal(r409.corpo.codigo, 'faculdade');

  // Três alunos da mesma faculdade: notas 100%, 50% e 0%.
  const notas = [];
  for (const [i, fracao] of [1, 0.5, 0].entries()) {
    const c = cliente();
    await c.post('/api/cadastro', { nome: `Aluno Nacional ${i}`, email: `nacional${i}@rx.test`, senha: 'senha-forte-1', aceite: true, ...FICHA, etapa: '4', faculdade: unb.codigo, compartilharFaculdade: i === 0 });
    const ini = await c.post(`/api/nacional/${sim.id}/iniciar`, {});
    assert.equal(ini.status, 200, JSON.stringify(ini.corpo));
    const respostas = Object.fromEntries(ini.corpo.questoes.map((id, k) => [id, k < ini.corpo.questoes.length * fracao ? gab.get(id).gabarito : (gab.get(id).gabarito === 'A' ? 'B' : 'A')]));
    respostas.inventada = 'A';
    const env = await c.post(`/api/nacional/${sim.id}/enviar`, { respostas });
    assert.equal(env.status, 200, JSON.stringify(env.corpo));
    notas.push(env.corpo.resultado.nota);
    assert.equal((await c.post(`/api/nacional/${sim.id}/enviar`, { respostas })).status, 409, 'uma entrega por aluno');
    if (i === 2) {
      const rk = env.corpo.ranking;
      assert.equal(rk.participantes, 3);
      assert.equal(rk.posicao, 3);
      assert.equal(rk.faculdades.length, 1, 'faculdade com 3 participantes entra no ranking');
      assert.equal(rk.faculdades[0].media, 50, JSON.stringify(rk));
      assert.ok(rk.top.every((x) => !/@/.test(x.nome) && x.nome.split(' ').length <= 2), 'nome curto, sem e-mail');
    }
  }
  assert.deepEqual(notas, [100, 50, 0]);
  const lista = (await cliente().get('/api/nacional')).corpo.simulados;
  assert.ok(lista.some((s) => s.id === sim.id && s.situacao === 'aberto' && s.participantes === 3));
  const det = (await adm.get(`/api/admin/nacional/${sim.id}`)).corpo;
  assert.equal(det.porFaculdade[0].participantes, 3);
  assert.match((await adm.get(`/api/admin/nacional/${sim.id}?formato=csv`)).corpo, /nacional0@rx.test/);

  // Relatório da turma e link da coordenação: números de todos, nome só de quem autorizou.
  const turmas = (await adm.get('/api/admin/turmas')).corpo.turmas;
  const t = turmas.find((x) => x.faculdade === unb.codigo);
  assert.equal(t.alunos, 3);
  assert.equal(t.autorizaram, 1);
  const rel = (await adm.get(`/api/admin/turmas/${encodeURIComponent(unb.codigo)}`)).corpo.relatorio;
  assert.equal(rel.alunos, 3);
  assert.equal(rel.individuais.length, 1);
  assert.equal(rel.individuais[0].nome, 'Aluno Nacional 0');
  assert.equal(rel.nacionais[0].participantes, 3);
  const link = await adm.post(`/api/admin/turmas/${encodeURIComponent(unb.codigo)}/link`, { dias: 30 });
  assert.equal(link.status, 201);
  const token = link.corpo.link.split('/relatorio/')[1];
  const publico = await cliente().get(`/api/relatorio/${token}`);
  assert.equal(publico.status, 200);
  assert.equal(publico.corpo.relatorio.alunos, 3);
  assert.ok(!JSON.stringify(publico.corpo).includes('@rx.test'), 'o relatório nunca mostra e-mail');
  const pagina = await cliente().get(`/relatorio/${token}`);
  assert.equal(pagina.status, 200);
  const links = (await adm.get(`/api/admin/turmas/${encodeURIComponent(unb.codigo)}`)).corpo.links;
  await adm.post(`/api/admin/turmas/links/${links[0].id}/revogar`, {});
  assert.equal((await cliente().get(`/api/relatorio/${token}`)).status, 404, 'link revogado');
  assert.equal((await cliente().get('/api/relatorio/curto')).status, 404);
  const aluno = cliente();
  await aluno.post('/api/entrar', { email: 'nacional1@rx.test', senha: 'senha-forte-1' });
  assert.equal((await aluno.get('/api/admin/turmas')).status, 403);
});

test('páginas do servidor: scripts embutidos batem com a política de segurança (login funciona)', async () => {
  for (const pagina of ['/entrar', '/minha-conta', '/redefinir-senha']) {
    const r = await fetch(url + pagina);
    const csp = r.headers.get('content-security-policy');
    const html = await r.text();
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.trim());
    for (const s of scripts) {
      const hash = `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
      assert.ok(csp.includes(hash), `${pagina}: script embutido bloqueado pela CSP`);
    }
  }
});

test('recuperação de acesso pelo terminal: senha temporária e desbloqueio', async () => {
  const { execFile } = await import('node:child_process');
  const c = cliente();
  await c.post('/api/cadastro', { nome: 'Conta Esquecida', email: 'esquecida@rx.test', senha: 'senha-forte-1', aceite: true, ...FICHA });
  await banco.consulta(`UPDATE usuarios SET falhas_login = 9, bloqueado_ate = now() + interval '1 hour' WHERE email = 'esquecida@rx.test'`);
  const saida = await new Promise((ok, falha) => execFile(process.execPath, ['src/redefinir-acesso.js', 'esquecida@rx.test'],
    { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, DATABASE_URL: BANCO } }, (e, so, se) => (e ? falha(new Error(se || e.message)) : ok(so))));
  const senha = saida.match(/Senha temporária: (\S+)/)[1];
  const r = await cliente().post('/api/entrar', { email: 'esquecida@rx.test', senha });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
});

test('planos: cada plano libera só os seus módulos (teoria, estações, dupla)', async () => {
  const a = await alunoNovo('Planos');
  const lista = (await a.get('/api/pratica/estacoes')).corpo.estacoes;
  const livre = lista.find((e) => e.livre);
  const paga = lista.find((e) => !e.livre);
  assert.ok(livre && paga, 'há estações livres e fechadas no gratuito');
  assert.equal(lista.filter((e) => e.livre).length, 5, 'uma livre por área');
  assert.equal((await a.post('/api/pratica/tentativas', { estacaoId: livre.id, modo: 'roteiro' })).status, 201);
  assert.equal((await a.post('/api/pratica/tentativas', { estacaoId: paga.id, modo: 'roteiro' })).corpo.codigo, 'plano');

  await darPlano(a, 'mensal');
  let eu = (await a.get('/api/eu')).corpo;
  assert.deepEqual(eu.acesso.recursos, ['teoria'], 'mensal: só teoria');
  assert.equal((await a.post('/api/pratica/tentativas', { estacaoId: paga.id, modo: 'roteiro' })).status, 403);

  const b = await alunoNovo('Segunda');
  await darPlano(b, 'segunda-etapa');
  eu = (await b.get('/api/eu')).corpo;
  assert.deepEqual(eu.acesso.recursos.sort(), ['dupla', 'estacoes'], '2ª etapa: sem teoria');
  assert.equal((await b.post('/api/pratica/tentativas', { estacaoId: paga.id, modo: 'roteiro' })).status, 201);

  const c = await alunoNovo('Anual');
  await darPlano(c, 'anual');
  assert.deepEqual((await c.get('/api/eu')).corpo.acesso.recursos.sort(), ['dupla', 'estacoes', 'teoria']);
});

test('admin: contas de admin aparecem na lista e podem virar conta de aluno para testar planos', async () => {
  const adm = await alunoNovo('Chefe');
  await banco.consulta(`UPDATE usuarios SET papel = 'admin' WHERE email = $1`, [adm.email]);
  const teste = await alunoNovo('Teste');
  const u = await banco.um('SELECT id FROM usuarios WHERE email = $1', [teste.email]);
  await banco.consulta(`UPDATE usuarios SET papel = 'admin' WHERE id = $1`, [u.id]);
  const lista = (await adm.get(`/api/admin/alunos?busca=${encodeURIComponent(teste.email)}`)).corpo.alunos;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].papel, 'admin');
  assert.deepEqual((await teste.get('/api/eu')).corpo.usuario.papel, 'admin');

  const eu = (await adm.get('/api/eu')).corpo.usuario;
  assert.equal((await adm.post(`/api/admin/alunos/${eu.id}/papel`, { papel: 'aluno' })).status, 400, 'não muda o próprio papel');
  assert.equal((await adm.post(`/api/admin/alunos/${u.id}/papel`, { papel: 'aluno' })).status, 200);
  assert.equal((await teste.get('/api/admin/resumo')).status, 403, 'virou aluno: sem painel');
  await adm.post(`/api/admin/alunos/${u.id}/acesso`, { acao: 'conceder', plano: 'segunda-etapa', meses: 1 });
  assert.deepEqual((await teste.get('/api/eu')).corpo.acesso.recursos.sort(), ['dupla', 'estacoes']);
});
