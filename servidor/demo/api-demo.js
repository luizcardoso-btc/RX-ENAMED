// Demonstração do painel admin: substitui a chamada ao servidor por dados FICTÍCIOS gerados no navegador.
// Usada só para visualizar o painel sem o servidor no ar. Nada aqui é real.
export { idioma, $, reais, data, dataHora, esc, mostrarErro } from './comum-base.js';

const DIA = 86400000;
const agora = Date.now();
let semente = 7;
const aleatorio = () => { semente = (semente * 16807) % 2147483647; return (semente - 1) / 2147483646; };
const escolher = (l) => l[Math.floor(aleatorio() * l.length)];
const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(aleatorio() * 16).toString(16));

const PLANOS = [
  { id: 'mensal', nome: 'Mensal', valorCentavos: 14790, duracaoMeses: 1, parcelasMax: 1 },
  { id: 'ciclo', nome: 'Ciclo de prova', valorCentavos: 49790, duracaoMeses: 6, parcelasMax: 6 },
  { id: 'segunda-etapa', nome: '2ª etapa', valorCentavos: 79790, duracaoMeses: 8, parcelasMax: 6 },
  { id: 'anual', nome: 'Anual completo', valorCentavos: 149000, duracaoMeses: 12, parcelasMax: 12 },
];
const porPlano = Object.fromEntries(PLANOS.map((p) => [p.id, p]));
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Hugo', 'Isabela', 'João', 'Larissa', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Valéria', 'Yuri', 'Camila', 'Lucas', 'Mariana', 'Pedro', 'Juliana', 'Gustavo', 'Beatriz', 'Renato'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Lima', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Gomes', 'Ribeiro', 'Martins', 'Araújo', 'Barbosa', 'Rocha', 'Mendes', 'Castro'];

const afiliados = [
  { id: uuid(), nome: 'Dra. Fictícia Andrade', email: 'parceira1@exemplo.com', codigo: 'DRAANDRADE', comissao_percentual: 25, chave_pix: 'parceira1@exemplo.com', ativo: true, criado_em: new Date(agora - 40 * DIA) },
  { id: uuid(), nome: 'Canal Exemplo Med', email: 'canal@exemplo.com', codigo: 'CANALMED', comissao_percentual: 20, chave_pix: null, ativo: true, criado_em: new Date(agora - 25 * DIA) },
];
const cupons = [
  { id: uuid(), codigo: 'ENAMED20', tipo: 'percentual', valor: 20, planos: ['ciclo'], valido_ate: new Date(agora + 20 * DIA), limite_usos: 100, usos: 0, afiliado_id: null, ativo: true, criado_em: new Date(agora - 30 * DIA) },
  { id: uuid(), codigo: 'ANDRADE50', tipo: 'fixo', valor: 5000, planos: null, valido_ate: null, limite_usos: null, usos: 0, afiliado_id: afiliados[0].id, ativo: true, criado_em: new Date(agora - 28 * DIA) },
];
const usuarios = [];
const pedidos = [];
const matriculas = [];
const auditoria = [];
const emails = [];
const somarMeses = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

for (let i = 0; i < 64; i += 1) {
  const nome = `${escolher(NOMES)} ${escolher(SOBRENOMES)}`;
  const criado = new Date(agora - Math.floor(aleatorio() * 45 * DIA));
  const u = { id: uuid(), nome, email: `${nome.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.')}${i}@exemplo.com`, cpf: null, papel: 'aluno', criado_em: criado, ultimo_acesso: new Date(Math.min(agora, criado.getTime() + aleatorio() * 20 * DIA)) };
  usuarios.push(u);
  emails.push({ usuario_id: u.id, modelo: 'boasVindas', assunto: 'Bem-vindo ao RX ENAMED', status: 'simulado', criado_em: criado });
  const compras = aleatorio() < 0.55 ? 1 + (aleatorio() < 0.15 ? 1 : 0) : 0;
  for (let c = 0; c < compras; c += 1) {
    const plano = escolher(['mensal', 'mensal', 'ciclo', 'ciclo', 'ciclo', 'segunda-etapa', 'anual']);
    const metodo = escolher(['pix', 'pix', 'pix', 'cartao', 'cartao', 'boleto']);
    const quando = new Date(Math.min(agora - 3600000, criado.getTime() + aleatorio() * 10 * DIA));
    const cupom = aleatorio() < 0.2 ? (plano === 'ciclo' ? cupons[0] : cupons[1]) : null;
    const afiliado = cupom?.afiliado_id ? afiliados[0] : aleatorio() < 0.15 ? afiliados[1] : null;
    const original = porPlano[plano].valorCentavos;
    const desconto = cupom ? (cupom.tipo === 'percentual' ? Math.round(original * cupom.valor / 100) : cupom.valor) : 0;
    const status = metodo === 'cartao' && aleatorio() < 0.18 ? 'recusado' : metodo !== 'cartao' && aleatorio() < 0.22 ? (aleatorio() < 0.5 ? 'expirado' : 'pendente') : aleatorio() < 0.03 ? 'reembolsado' : 'aprovado';
    const p = { id: uuid(), usuario_id: u.id, plano_id: plano, valor_centavos: original - desconto, desconto_centavos: desconto, metodo, parcelas: metodo === 'cartao' ? escolher([1, 1, 3, 6].filter((n) => n <= porPlano[plano].parcelasMax)) : 1,
      status, status_detalhe: status === 'recusado' ? 'cc_rejected_insufficient_amount' : null, mp_pagamento_id: String(90000000 + Math.floor(aleatorio() * 9999999)),
      criado_em: quando, pago_em: status === 'aprovado' || status === 'reembolsado' ? new Date(quando.getTime() + 300000) : null, atualizado_em: quando,
      cupom_id: cupom?.id || null, afiliado_id: afiliado?.id || null, comissao_centavos: afiliado ? Math.round((original - desconto) * afiliado.comissao_percentual / 100) : 0, comissao_paga_em: null };
    pedidos.push(p);
    if (status === 'aprovado') {
      if (cupom) cupom.usos += 1;
      const vigente = matriculas.filter((m) => m.usuario_id === u.id && m.status === 'ativa' && m.fim > quando).sort((x, y) => y.fim - x.fim)[0];
      const inicio = vigente ? vigente.fim : p.pago_em;
      matriculas.push({ id: uuid(), usuario_id: u.id, plano_id: plano, inicio, fim: somarMeses(inicio, porPlano[plano].duracaoMeses), status: 'ativa', origem: 'pagamento', pedido_id: p.id, observacao: null });
      emails.push({ usuario_id: u.id, modelo: 'pagamentoAprovado', assunto: 'Pagamento aprovado: seu acesso está liberado', status: 'simulado', criado_em: p.pago_em });
    }
  }
}
// Alguns acessos já vencidos e outros perto de vencer, para o painel mostrar todas as situações.
for (const m of matriculas.slice(0, 5)) { m.inicio = new Date(agora - 40 * DIA); m.fim = new Date(agora - 8 * DIA); }
for (const m of matriculas.slice(5, 9)) m.fim = new Date(agora + (2 + Math.floor(aleatorio() * 5)) * DIA);

const admin = { id: uuid(), nome: 'Administrador (demonstração)', email: 'admin@exemplo.com', papel: 'admin' };
const matAtual = (uid) => matriculas.filter((m) => m.usuario_id === uid && m.status === 'ativa' && m.inicio <= new Date() && m.fim > new Date()).sort((a, b) => b.fim - a.fim)[0];
function situacao(u) {
  const m = matAtual(u.id);
  if (m) return m.fim - agora <= 7 * DIA ? 'vencendo' : 'ativo';
  return matriculas.some((x) => x.usuario_id === u.id) ? 'expirado' : 'gratuito';
}
const alunoLinha = (u) => {
  const m = matAtual(u.id);
  return { id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, criado_em: u.criado_em, ultimo_acesso: u.ultimo_acesso, plano: m?.plano_id || null, acesso_ate: m?.fim || null,
    total_pago: pedidos.filter((p) => p.usuario_id === u.id && p.status === 'aprovado').reduce((s, p) => s + p.valor_centavos, 0), situacao: situacao(u) };
};
const paginar = (lista, pagina) => ({ total: lista.length, pagina, porPagina: 50, itens: lista.slice((pagina - 1) * 50, pagina * 50) });
const auditar = (acao, alvo, detalhes) => auditoria.unshift({ em: new Date(), admin: admin.nome, acao, alvo, detalhes });
const inicioDia = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function resumo(dias) {
  const desde = agora - dias * DIA;
  const aprov = pedidos.filter((p) => p.status === 'aprovado');
  const soma = (l) => l.reduce((s, p) => s + p.valor_centavos, 0);
  const noPeriodo = aprov.filter((p) => p.pago_em >= desde);
  const criados = pedidos.filter((p) => p.criado_em >= desde);
  const mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
  const agrupar = (l, chave) => Object.values(l.reduce((acc, p) => { const k = chave(p); (acc[k] ||= []).push(p); return acc; }, {}));
  const alunos = usuarios.map(situacao);
  return {
    dias,
    receita: { hoje: soma(aprov.filter((p) => p.pago_em >= inicioDia(agora))), semana: soma(aprov.filter((p) => p.pago_em >= agora - 7 * DIA)), mes: soma(aprov.filter((p) => p.pago_em >= mes)),
      periodo: soma(noPeriodo), total: soma(aprov), vendas_periodo: noPeriodo.length },
    alunos: { total: usuarios.length, ativos: alunos.filter((s) => s === 'ativo' || s === 'vencendo').length, vencendo: alunos.filter((s) => s === 'vencendo').length,
      expirados: alunos.filter((s) => s === 'expirado').length, gratuitos: alunos.filter((s) => s === 'gratuito').length, novos: usuarios.filter((u) => u.criado_em >= desde).length },
    porPlano: agrupar(noPeriodo, (p) => p.plano_id).map((l) => ({ plano: l[0].plano_id, vendas: l.length, receita: soma(l) })).sort((a, b) => b.receita - a.receita),
    porMetodo: agrupar(criados, (p) => p.metodo).map((l) => ({ metodo: l[0].metodo, aprovados: l.filter((p) => p.status === 'aprovado').length, tentativas: l.length })),
    porAfiliado: agrupar(noPeriodo.filter((p) => p.afiliado_id), (p) => p.afiliado_id).map((l) => { const a = afiliados.find((x) => x.id === l[0].afiliado_id); return { id: a.id, nome: a.nome, codigo: a.codigo, vendas: l.length, receita: soma(l), comissao: l.reduce((s, p) => s + p.comissao_centavos, 0) }; }),
    porCupom: agrupar(noPeriodo.filter((p) => p.cupom_id), (p) => p.cupom_id).map((l) => ({ codigo: cupons.find((c) => c.id === l[0].cupom_id).codigo, vendas: l.length, desconto: l.reduce((s, p) => s + p.desconto_centavos, 0), receita: soma(l) })),
    serie: Array.from({ length: dias }, (_, i) => { const d = inicioDia(agora - (dias - 1 - i) * DIA); return { dia: new Date(d).toISOString().slice(0, 10), receita: soma(aprov.filter((p) => p.pago_em >= d && p.pago_em < d + DIA)), cadastros: usuarios.filter((u) => u.criado_em >= d && u.criado_em < d + DIA).length }; }),
    reembolsos: { n: pedidos.filter((p) => p.status === 'reembolsado' && p.atualizado_em >= desde).length, valor: soma(pedidos.filter((p) => p.status === 'reembolsado' && p.atualizado_em >= desde)) },
    pedidos: {}, conversao: criados.length ? criados.filter((p) => p.status === 'aprovado').length / criados.length : 0,
    ticketMedio: noPeriodo.length ? Math.round(soma(noPeriodo) / noPeriodo.length) : 0,
  };
}

function afiliadosLista() {
  return afiliados.map((a) => {
    const l = pedidos.filter((p) => p.afiliado_id === a.id && p.status === 'aprovado');
    const s = (f) => l.filter(f).reduce((t, p) => t + p.comissao_centavos, 0);
    return { ...a, vendas: l.length, receita: l.reduce((t, p) => t + p.valor_centavos, 0),
      comissao_liberada: s((p) => !p.comissao_paga_em && p.pago_em < agora - 7 * DIA), comissao_em_garantia: s((p) => !p.comissao_paga_em && p.pago_em >= agora - 7 * DIA), comissao_paga: s((p) => p.comissao_paga_em) };
  }).sort((a, b) => b.receita - a.receita);
}

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  await new Promise((r) => setTimeout(r, 120));
  const [rota, qs] = caminho.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const erro = (m) => { throw new Error(m); };
  let m;
  if (rota === '/eu') return { usuario: admin, acesso: { ativo: true, plano: 'anual' } };
  if (rota === '/sair') { alert('Demonstração: o botão Sair encerra a sessão no painel de verdade.'); return {}; }
  if (rota === '/checkout/config') return { planos: PLANOS };
  if (rota === '/admin/resumo') return resumo(Number(q.dias) || 30);
  if (rota === '/admin/alunos') {
    let l = usuarios.map(alunoLinha);
    if (q.busca) l = l.filter((a) => `${a.nome} ${a.email}`.toLowerCase().includes(q.busca.toLowerCase()));
    if (q.situacao) l = l.filter((a) => a.situacao === q.situacao);
    l.sort((a, b) => b.criado_em - a.criado_em);
    const p = paginar(l, Number(q.pagina) || 1);
    return { alunos: p.itens, total: p.total, pagina: p.pagina, porPagina: 50 };
  }
  if ((m = rota.match(/^\/admin\/alunos\/([^/]+)$/))) {
    const u = usuarios.find((x) => x.id === m[1]);
    return { aluno: u, matriculas: matriculas.filter((x) => x.usuario_id === u.id).sort((a, b) => b.inicio - a.inicio), pedidos: pedidos.filter((p) => p.usuario_id === u.id).sort((a, b) => b.criado_em - a.criado_em),
      emails: emails.filter((e) => e.usuario_id === u.id).sort((a, b) => b.criado_em - a.criado_em), progresso: { questoes: Math.floor(aleatorio() * 400), atualizado_em: u.ultimo_acesso } };
  }
  if ((m = rota.match(/^\/admin\/alunos\/([^/]+)\/acesso$/))) {
    const u = usuarios.find((x) => x.id === m[1]);
    if (corpo.acao === 'conceder') {
      const vig = matAtual(u.id);
      const inicio = vig ? vig.fim : new Date();
      matriculas.push({ id: uuid(), usuario_id: u.id, plano_id: corpo.plano, inicio, fim: somarMeses(inicio, corpo.meses), status: 'ativa', origem: 'manual', observacao: corpo.observacao || null });
      auditar('conceder_acesso', u.id, { plano: corpo.plano, meses: corpo.meses, observacao: corpo.observacao });
    } else {
      for (const x of matriculas) if (x.usuario_id === u.id && x.status === 'ativa' && x.fim > new Date()) x.status = 'cancelada';
      auditar('revogar_acesso', u.id, {});
    }
    return { ok: true };
  }
  if (rota === '/admin/pedidos') {
    let l = pedidos.slice().sort((a, b) => b.criado_em - a.criado_em);
    if (q.status) l = l.filter((p) => p.status === q.status);
    const p = paginar(l, Number(q.pagina) || 1);
    return { pedidos: p.itens.map((x) => { const u = usuarios.find((y) => y.id === x.usuario_id); return { ...x, plano: x.plano_id, aluno_id: u.id, aluno: u.nome, email: u.email }; }), total: p.total, pagina: p.pagina, porPagina: 50 };
  }
  if ((m = rota.match(/^\/admin\/pedidos\/([^/]+)\/reembolsar$/))) {
    const p = pedidos.find((x) => x.id === m[1]);
    p.status = 'reembolsado'; p.atualizado_em = new Date();
    for (const x of matriculas) if (x.pedido_id === p.id) x.status = 'cancelada';
    auditar('reembolsar', p.id, { motivo: corpo.motivo });
    return { pedido: { id: p.id, status: p.status } };
  }
  if (rota === '/admin/cupons' && metodo === 'GET') {
    return { cupons: cupons.map((c) => ({ ...c, afiliado: afiliados.find((a) => a.id === c.afiliado_id)?.nome, receita: pedidos.filter((p) => p.cupom_id === c.id && p.status === 'aprovado').reduce((s, p) => s + p.valor_centavos, 0) })).sort((a, b) => b.criado_em - a.criado_em) };
  }
  if (rota === '/admin/cupons') {
    const codigo = String(corpo.codigo || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) erro('Código: 3 a 30 letras, números, hífen ou sublinhado.');
    if (cupons.some((c) => c.codigo === codigo)) erro('Já existe um cupom com este código.');
    cupons.push({ id: uuid(), codigo, tipo: corpo.tipo, valor: corpo.tipo === 'percentual' ? Number(corpo.valor) : Math.round(Number(corpo.valor) * 100), planos: corpo.planos?.length ? corpo.planos : null,
      valido_ate: corpo.validoAte ? new Date(corpo.validoAte) : null, limite_usos: corpo.limiteUsos ? Number(corpo.limiteUsos) : null, usos: 0, afiliado_id: corpo.afiliadoId || null, ativo: true, criado_em: new Date() });
    auditar('criar_cupom', codigo, { codigo, tipo: corpo.tipo, valor: corpo.valor });
    return { ok: true };
  }
  if ((m = rota.match(/^\/admin\/cupons\/([^/]+)\/ativo$/))) {
    const c = cupons.find((x) => x.id === m[1]); c.ativo = corpo.ativo;
    auditar(c.ativo ? 'ativar_cupom' : 'desativar_cupom', c.id, { codigo: c.codigo });
    return { cupom: c };
  }
  if (rota === '/admin/afiliados' && metodo === 'GET') return { afiliados: afiliadosLista() };
  if (rota === '/admin/afiliados') {
    const codigo = String(corpo.codigo || '').trim().toUpperCase();
    if (!corpo.nome || !/^[A-Z0-9_-]{3,30}$/.test(codigo)) erro('Informe nome e um código de 3 a 30 letras ou números.');
    afiliados.push({ id: uuid(), nome: corpo.nome, email: corpo.email, codigo, comissao_percentual: Number(corpo.comissaoPercentual || 20), chave_pix: corpo.chavePix || null, ativo: true, criado_em: new Date() });
    auditar('criar_afiliado', codigo, { codigo });
    return { ok: true };
  }
  if ((m = rota.match(/^\/admin\/afiliados\/([^/]+)\/pagar$/))) {
    let valor = 0;
    for (const p of pedidos) if (p.afiliado_id === m[1] && p.status === 'aprovado' && !p.comissao_paga_em && p.pago_em < agora - 7 * DIA) { p.comissao_paga_em = new Date(); valor += p.comissao_centavos; }
    auditar('pagar_comissao', m[1], { valor });
    return { valor };
  }
  if (rota === '/admin/auditoria') return { eventos: auditoria };
  erro('Rota não disponível na demonstração.');
}
