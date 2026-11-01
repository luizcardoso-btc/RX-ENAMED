// Testes de ponta a ponta do servidor: cadastro, checkout (PIX, cartão, boleto), aviso assinado, acesso, painel admin e reembolso.
// Precisa de um Postgres vazio em TEST_DATABASE_URL (padrão: o banco local de testes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
  return { get: (c) => req('GET', c), post: (c, b, e) => req('POST', c, b, e), cookie: () => cookie };
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
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: '123' , aceite: true })).status, 400);
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: 'senha-forte-1' })).status, 400, 'sem aceite dos termos');
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: '12345678901' , aceite: true })).status, 400, 'senha comum/sem letras');
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana', email: 'ana@rx.test', senha: 'senha-forte-1' , aceite: true }, { origin: 'https://golpe.test' })).status, 403);
  assert.equal((await a.post('/api/cadastro', { nome: 'Ana Souza', email: 'ana@rx.test', senha: 'senha-forte-1' , aceite: true })).status, 201);
  assert.equal((await cliente().post('/api/cadastro', { nome: 'Ana', email: 'ANA@rx.test', senha: 'senha-forte-1' , aceite: true })).status, 409);
  const eu = (await a.get('/api/eu')).corpo;
  assert.equal(eu.usuario.email, 'ana@rx.test');
  assert.deepEqual(eu.acesso, { ativo: false, plano: 'gratis', ate: null });
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
  await a.post('/api/cadastro', { nome: 'Bruno Lima', email: 'bruno@rx.test', senha: 'senha-forte-1' , aceite: true });
  assert.equal((await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'pix', cpf: '123' })).status, 400);
  const r = await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'pix', cpf: CPF, valor: 1 });
  assert.equal(r.status, 201);
  const { pedido } = r.corpo;
  assert.equal(pedido.status, 'pendente');
  assert.equal(pedido.valorCentavos, 14790, 'o preço vem do servidor, não do navegador');
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
  await a.post('/api/cadastro', { nome: 'Carla Dias', email: 'carla@rx.test', senha: 'senha-forte-1' , aceite: true });
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
  await a.post('/api/cadastro', { nome: 'Davi Reis', email: 'davi@rx.test', senha: 'senha-forte-1' , aceite: true });
  const r = await a.post('/api/checkout/pagar', { plano: 'segunda-etapa', metodo: 'boleto', cpf: CPF });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.pedido.pagamento.boletoUrl, 'https://mp.test/boleto');
  assert.equal(r.corpo.pedido.valorCentavos, 79700);
});

test('admin: resumo de vendas, lista de alunos, liberação manual, revogação, reembolso e CSV', async () => {
  const adm = cliente();
  await adm.post('/api/cadastro', { nome: 'Admin RX', email: 'admin@rx.test', senha: 'senha-forte-1' , aceite: true });
  const resumo = (await adm.get('/api/admin/resumo?dias=30')).corpo;
  assert.equal(resumo.receita.total, 14790 + 49790 + 14790);
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
  await a.post('/api/cadastro', { nome: 'Elisa Melo', email: 'elisa@rx.test', senha: 'senha-forte-1' , aceite: true });
  assert.equal((await a.post('/api/checkout/cupom', { plano: 'mensal', cupom: 'RX20' })).status, 400, 'cupom só do ciclo');
  const previa = (await a.post('/api/checkout/cupom', { plano: 'ciclo', cupom: 'rx20' })).corpo;
  assert.equal(previa.valorCentavos, 49790 - 9958);
  const p1 = (await a.post('/api/checkout/pagar', { plano: 'ciclo', metodo: 'cartao', cpf: CPF, cupom: 'RX20', cartao: { token: 'ok', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(p1.valorCentavos, 39832);
  assert.equal(p1.descontoCentavos, 9958);
  assert.equal((await banco.um(`SELECT usos FROM cupons WHERE codigo = 'RX20'`)).usos, 1);
  assert.equal((await a.post('/api/checkout/cupom', { plano: 'ciclo', cupom: 'RX20' })).status, 400, 'limite de 1 uso atingido');

  const p2 = (await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: CPF, cupom: 'PAULA50', cartao: { token: 'ok3', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(p2.valorCentavos, 14790 - 5000);
  const p3 = (await a.post('/api/checkout/pagar', { plano: 'mensal', metodo: 'cartao', cpf: CPF, ref: 'PAULA', cartao: { token: 'ok4', metodoPagamento: 'visa', parcelas: 1 } })).corpo.pedido;
  assert.equal(p3.valorCentavos, 14790, 'link de indicação não dá desconto, só atribui a venda');
  const lista = (await adm.get('/api/admin/afiliados')).corpo.afiliados.find((x) => x.codigo === 'PAULA');
  assert.equal(lista.vendas, 2);
  assert.equal(lista.comissao_em_garantia, Math.round(9790 * 0.3) + Math.round(14790 * 0.3));
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
  await c.post('/api/cadastro', { nome: 'Fábio Prado', email: 'fabio@rx.test', senha: 'senha-forte-1', aceite: true });
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
  await c.post('/api/cadastro', { nome: 'Gina Luz', email: 'gina@rx.test', senha: 'senha-forte-1', aceite: true });
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
  await c.post('/api/cadastro', { nome: 'Hugo Reis', email: 'hugo@rx.test', senha: 'senha-forte-1', aceite: true });
  const comLogin = await fetch(`${url}/plataforma/data/comentarios.json`, { headers: { cookie: c.cookie() }, redirect: 'manual' });
  assert.notEqual(comLogin.status, 401, 'logado passa pela restrição');
  assert.notEqual(comLogin.status, 302);
});
