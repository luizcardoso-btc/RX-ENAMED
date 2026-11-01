import { $, api, reais, data, dataHora, esc } from './comum.js';

const NOMES = { mensal: 'Mensal', ciclo: 'Ciclo de prova', 'segunda-etapa': '2ª etapa', anual: 'Anual completo' };
const SIT = { ativo: 'Ativo', vencendo: 'Vencendo', expirado: 'Inativo', gratuito: 'Gratuito' };
const STATUS = { aprovado: 'Aprovado', pendente: 'Pendente', recusado: 'Recusado', reembolsado: 'Reembolsado', expirado: 'Expirado', cancelado: 'Cancelado', contestado: 'Contestado' };
const metodo = (m, n) => (m === 'cartao' ? `Cartão${n > 1 ? ` ${n}×` : ''}` : m.toUpperCase());
const conteudo = $('#conteudo');
const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')}%`;

const { usuario } = await api('/eu');
if (!usuario) location.href = '/entrar?voltar=/admin';
else if (usuario.papel !== 'admin') conteudo.innerHTML = '<p>Esta conta não é de administrador.</p>';
$('#sair').addEventListener('click', async () => { await api('/sair', { metodo: 'POST', corpo: {} }); location.href = '/'; });
for (const b of document.querySelectorAll('[data-aba]')) b.addEventListener('click', () => { location.hash = b.dataset.aba; });
window.addEventListener('hashchange', abrir);
if (usuario?.papel === 'admin') abrir();

function abrir() {
  const aba = location.hash.slice(1) || 'painel';
  for (const b of document.querySelectorAll('[data-aba]')) b.style.color = b.dataset.aba === aba ? 'var(--tinta)' : '';
  fecharGaveta();
  ({ painel, alunos, pedidos, cupons, afiliados, auditoria }[aba] || painel)();
}

async function painel() {
  const dias = Number(sessionStorage.getItem('rx-dias')) || 30;
  const r = await api(`/admin/resumo?dias=${dias}`);
  const max = Math.max(1, ...r.serie.map((d) => d.receita));
  conteudo.innerHTML = `
    <div class="rx-filtros" style="justify-content:space-between">
      <h1 style="font-family:var(--f-display);margin:0">Painel de vendas</h1>
      <label class="rx-campo"><span>Período</span><select id="dias">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${d === dias ? 'selected' : ''}>Últimos ${d} dias</option>`).join('')}</select></label>
    </div>
    <div class="rx-kpis">
      <div class="rx-kpi"><span>Receita hoje</span><strong>${reais(r.receita.hoje)}</strong></div>
      <div class="rx-kpi"><span>Receita do mês</span><strong>${reais(r.receita.mes)}</strong></div>
      <div class="rx-kpi"><span>Receita no período</span><strong>${reais(r.receita.periodo)}</strong><small>${r.receita.vendas_periodo} vendas</small></div>
      <div class="rx-kpi"><span>Ticket médio</span><strong>${reais(r.ticketMedio)}</strong></div>
      <div class="rx-kpi"><span>Conversão dos pedidos</span><strong>${pct(r.conversao)}</strong><small>aprovados ÷ iniciados</small></div>
      <div class="rx-kpi"><span>Reembolsos no período</span><strong>${reais(r.reembolsos.valor)}</strong><small>${r.reembolsos.n} pedidos</small></div>
    </div>
    <div class="rx-kpis">
      <div class="rx-kpi"><span>Alunos ativos</span><strong>${r.alunos.ativos}</strong></div>
      <div class="rx-kpi"><span>Vencendo em 7 dias</span><strong>${r.alunos.vencendo}</strong></div>
      <div class="rx-kpi"><span>Inativos (já pagaram)</span><strong>${r.alunos.expirados}</strong></div>
      <div class="rx-kpi"><span>Só gratuito</span><strong>${r.alunos.gratuitos}</strong></div>
      <div class="rx-kpi"><span>Cadastros no período</span><strong>${r.alunos.novos}</strong><small>${r.alunos.total} no total</small></div>
      <div class="rx-kpi"><span>Receita total</span><strong>${reais(r.receita.total)}</strong></div>
    </div>
    <section class="rx-cartao">
      <h2 style="margin-top:0">Receita por dia</h2>
      <div class="rx-grafico">${r.serie.map((d) => `<i style="height:${(d.receita / max) * 100}%" title="${data(d.dia + 'T12:00:00')}: ${reais(d.receita)} · ${d.cadastros} cadastros"></i>`).join('')}</div>
    </section>
    <div class="rx-duas">
      <section class="rx-cartao"><h2 style="margin-top:0">Vendas por plano</h2>
        <table class="rx-tabela"><thead><tr><th>Plano</th><th>Vendas</th><th>Receita</th></tr></thead><tbody>
        ${r.porPlano.map((p) => `<tr><td>${esc(NOMES[p.plano] || p.plano)}</td><td>${p.vendas}</td><td>${reais(p.receita)}</td></tr>`).join('') || '<tr><td colspan="3" class="rx-mudo">Sem vendas no período.</td></tr>'}</tbody></table></section>
      <section class="rx-cartao"><h2 style="margin-top:0">Formas de pagamento</h2>
        <table class="rx-tabela"><thead><tr><th>Forma</th><th>Aprovados</th><th>Tentativas</th><th>Aprovação</th></tr></thead><tbody>
        ${r.porMetodo.map((m) => `<tr><td>${metodo(m.metodo)}</td><td>${m.aprovados}</td><td>${m.tentativas}</td><td>${pct(m.aprovados / m.tentativas)}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Sem pedidos no período.</td></tr>'}</tbody></table></section>
      <section class="rx-cartao"><h2 style="margin-top:0">Vendas por afiliado</h2>
        <table class="rx-tabela"><thead><tr><th>Afiliado</th><th>Vendas</th><th>Receita</th><th>Comissão</th></tr></thead><tbody>
        ${r.porAfiliado.map((a) => `<tr><td>${esc(a.nome)} <span class="rx-mudo">${esc(a.codigo)}</span></td><td>${a.vendas}</td><td>${reais(a.receita)}</td><td>${reais(a.comissao)}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Sem vendas de afiliados no período.</td></tr>'}</tbody></table></section>
      <section class="rx-cartao"><h2 style="margin-top:0">Cupons usados</h2>
        <table class="rx-tabela"><thead><tr><th>Cupom</th><th>Vendas</th><th>Desconto dado</th><th>Receita</th></tr></thead><tbody>
        ${r.porCupom.map((c) => `<tr><td>${esc(c.codigo)}</td><td>${c.vendas}</td><td>${reais(c.desconto)}</td><td>${reais(c.receita)}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Nenhum cupom usado no período.</td></tr>'}</tbody></table></section>
    </div>`;
  $('#dias').addEventListener('change', (e) => { sessionStorage.setItem('rx-dias', e.target.value); painel(); });
}

async function alunos(pagina = 1) {
  const busca = sessionStorage.getItem('rx-busca') || '';
  const situacao = sessionStorage.getItem('rx-sit') || '';
  const q = new URLSearchParams({ pagina, ...(busca ? { busca } : {}), ...(situacao ? { situacao } : {}) });
  const r = await api(`/admin/alunos?${q}`);
  conteudo.innerHTML = `
    <h1 style="font-family:var(--f-display)">Alunos <small class="rx-mudo">${r.total}</small></h1>
    <form class="rx-filtros" id="filtro">
      <label class="rx-campo"><span>Buscar</span><input name="busca" value="${esc(busca)}" placeholder="nome, e-mail ou CPF"></label>
      <label class="rx-campo"><span>Situação</span><select name="situacao"><option value="">Todas</option>${Object.entries(SIT).map(([k, v]) => `<option value="${k}" ${k === situacao ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="botao">Filtrar</button>
      <a class="botao" href="/api/admin/alunos?${new URLSearchParams({ formato: 'csv', ...(busca ? { busca } : {}), ...(situacao ? { situacao } : {}) })}">Exportar planilha</a>
    </form>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Aluno</th><th>Situação</th><th>Plano</th><th>Acesso até</th><th>Total pago</th><th>Cadastro</th><th>Último acesso</th></tr></thead><tbody>
      ${r.alunos.map((a) => `<tr class="clicavel" data-id="${a.id}"><td><strong>${esc(a.nome)}</strong><br><span class="rx-mudo">${esc(a.email)}</span></td>
        <td><span class="rx-etq ${a.situacao}">${SIT[a.situacao]}</span></td><td>${esc(NOMES[a.plano] || '—')}</td><td>${data(a.acesso_ate)}</td>
        <td>${reais(a.total_pago)}</td><td>${data(a.criado_em)}</td><td>${data(a.ultimo_acesso)}</td></tr>`).join('') || '<tr><td colspan="7" class="rx-mudo">Nenhum aluno encontrado.</td></tr>'}
    </tbody></table></div>
    ${paginacao(r, 'alunos')}`;
  $('#filtro').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    sessionStorage.setItem('rx-busca', f.get('busca'));
    sessionStorage.setItem('rx-sit', f.get('situacao'));
    alunos();
  });
  for (const tr of conteudo.querySelectorAll('tr[data-id]')) tr.addEventListener('click', () => detalheAluno(tr.dataset.id));
  ligarPaginacao(alunos);
}

async function detalheAluno(id) {
  const { aluno, matriculas, pedidos: lista, emails = [], progresso } = await api(`/admin/alunos/${id}`);
  const config = await api('/checkout/config');
  const g = $('#gaveta');
  g.innerHTML = `<aside class="rx-gaveta" role="dialog" aria-label="Aluno">
    <button class="botao" id="fechar" style="float:right">Fechar</button>
    <h2>${esc(aluno.nome)}</h2>
    <p class="rx-mudo">${esc(aluno.email)} · CPF ${esc(aluno.cpf || '—')}<br>Cadastro ${dataHora(aluno.criado_em)} · último acesso ${dataHora(aluno.ultimo_acesso)}<br>
      ${progresso ? `Progresso salvo na conta: ${progresso.questoes} questões respondidas, atualizado em ${dataHora(progresso.atualizado_em)}` : 'Ainda não salvou progresso na conta.'}</p>
    <h3>Liberar acesso manualmente</h3>
    <form class="rx-linha" id="conceder">
      <label class="rx-campo"><span>Plano</span><select name="plano">${config.planos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="rx-campo" style="max-width:110px"><span>Meses</span><input name="meses" type="number" min="1" max="36" value="1"></label>
      <label class="rx-campo" style="flex:1"><span>Motivo</span><input name="observacao" placeholder="bolsa, cortesia, correção…"></label>
      <button class="botao botao-primario">Liberar</button>
    </form>
    <button class="botao" id="revogar">Revogar acesso atual</button>
    <h3>Matrículas</h3>
    <table class="rx-tabela"><thead><tr><th>Plano</th><th>Período</th><th>Origem</th><th>Situação</th></tr></thead><tbody>
      ${matriculas.map((m) => `<tr><td>${esc(NOMES[m.plano_id] || m.plano_id)}</td><td>${data(m.inicio)} a ${data(m.fim)}</td><td>${m.origem === 'manual' ? `Manual${m.observacao ? `: ${esc(m.observacao)}` : ''}` : 'Pagamento'}</td>
        <td>${m.status === 'cancelada' ? '<span class="rx-etq cancelado">Cancelada</span>' : new Date(m.fim) > new Date() ? '<span class="rx-etq ativo">Vigente</span>' : '<span class="rx-etq">Encerrada</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Nenhuma.</td></tr>'}
    </tbody></table>
    <h3>Pedidos</h3>
    <table class="rx-tabela"><thead><tr><th>Data</th><th>Plano</th><th>Valor</th><th>Forma</th><th>Situação</th></tr></thead><tbody>
      ${lista.map((p) => `<tr><td>${dataHora(p.criado_em)}</td><td>${esc(NOMES[p.plano_id] || p.plano_id)}</td><td>${reais(p.valor_centavos)}${p.desconto_centavos ? ` <span class="rx-mudo">(−${reais(p.desconto_centavos)})</span>` : ''}</td><td>${metodo(p.metodo, p.parcelas)}</td><td><span class="rx-etq ${p.status}">${STATUS[p.status]}</span></td></tr>`).join('') || '<tr><td colspan="5" class="rx-mudo">Nenhum.</td></tr>'}
    </tbody></table>
    <h3>E-mails enviados</h3>
    <table class="rx-tabela"><thead><tr><th>Data</th><th>Assunto</th><th>Envio</th></tr></thead><tbody>
      ${emails.map((e) => `<tr><td>${dataHora(e.criado_em)}</td><td>${esc(e.assunto)}</td><td>${e.status === 'enviado' ? 'Enviado' : e.status === 'simulado' ? '<span class="rx-mudo">Simulado</span>' : '<span class="rx-etq recusado">Falhou</span>'}</td></tr>`).join('') || '<tr><td colspan="3" class="rx-mudo">Nenhum.</td></tr>'}
    </tbody></table></aside>`;
  $('#fechar').addEventListener('click', fecharGaveta);
  $('#conceder [name=plano]').addEventListener('change', (e) => { $('#conceder [name=meses]').value = config.planos.find((p) => p.id === e.target.value).duracaoMeses; });
  $('#conceder [name=meses]').value = config.planos[0].duracaoMeses;
  $('#conceder').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api(`/admin/alunos/${id}/acesso`, { metodo: 'POST', corpo: { acao: 'conceder', ...f, meses: Number(f.meses) } }); detalheAluno(id); } catch (err) { alert(err.message); }
  });
  $('#revogar').addEventListener('click', async () => {
    if (!confirm(`Revogar o acesso de ${aluno.nome}? O aluno volta ao plano gratuito.`)) return;
    await api(`/admin/alunos/${id}/acesso`, { metodo: 'POST', corpo: { acao: 'revogar' } });
    detalheAluno(id);
  });
}
function fecharGaveta() { $('#gaveta').innerHTML = ''; }

async function pedidos(pagina = 1) {
  const status = sessionStorage.getItem('rx-status') || '';
  const r = await api(`/admin/pedidos?${new URLSearchParams({ pagina, ...(status ? { status } : {}) })}`);
  conteudo.innerHTML = `
    <h1 style="font-family:var(--f-display)">Pedidos <small class="rx-mudo">${r.total}</small></h1>
    <div class="rx-filtros"><label class="rx-campo"><span>Situação</span><select id="status"><option value="">Todas</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === status ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Data</th><th>Aluno</th><th>Plano</th><th>Valor</th><th>Forma</th><th>Situação</th><th>Mercado Pago</th><th></th></tr></thead><tbody>
      ${r.pedidos.map((p) => `<tr><td>${dataHora(p.criado_em)}</td><td><a href="#" data-aluno="${p.aluno_id}">${esc(p.aluno)}</a><br><span class="rx-mudo">${esc(p.email)}</span></td>
        <td>${esc(NOMES[p.plano] || p.plano)}</td><td>${reais(p.valor_centavos)}</td><td>${metodo(p.metodo, p.parcelas)}</td>
        <td><span class="rx-etq ${p.status}">${STATUS[p.status]}</span>${p.status_detalhe ? `<br><span class="rx-mudo">${esc(p.status_detalhe)}</span>` : ''}</td>
        <td class="rx-mudo">${esc(p.mp_pagamento_id || '—')}</td>
        <td>${p.status === 'aprovado' ? `<button class="botao" data-reembolso="${p.id}">Reembolsar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="rx-mudo">Nenhum pedido.</td></tr>'}
    </tbody></table></div>${paginacao(r, 'pedidos')}`;
  $('#status').addEventListener('change', (e) => { sessionStorage.setItem('rx-status', e.target.value); pedidos(); });
  for (const a of conteudo.querySelectorAll('[data-aluno]')) a.addEventListener('click', (e) => { e.preventDefault(); detalheAluno(a.dataset.aluno); });
  for (const b of conteudo.querySelectorAll('[data-reembolso]')) b.addEventListener('click', async () => {
    const motivo = prompt('Motivo do reembolso (fica na auditoria):', 'Arrependimento em 7 dias');
    if (motivo === null) return;
    try { await api(`/admin/pedidos/${b.dataset.reembolso}/reembolsar`, { metodo: 'POST', corpo: { motivo } }); pedidos(pagina); } catch (err) { alert(err.message); }
  });
  ligarPaginacao(pedidos);
}

async function cupons() {
  const [{ cupons: lista }, { afiliados: afs }, config] = await Promise.all([api('/admin/cupons'), api('/admin/afiliados'), api('/checkout/config')]);
  conteudo.innerHTML = `<h1 style="font-family:var(--f-display)">Cupons</h1>
    <form class="rx-cartao rx-filtros" id="novo">
      <label class="rx-campo"><span>Código</span><input name="codigo" required placeholder="ENAMED20" style="text-transform:uppercase"></label>
      <label class="rx-campo"><span>Tipo</span><select name="tipo"><option value="percentual">Percentual (%)</option><option value="fixo">Valor fixo (R$)</option></select></label>
      <label class="rx-campo" style="min-width:110px"><span>Valor</span><input name="valor" type="number" min="1" step="0.01" required></label>
      <label class="rx-campo"><span>Vale para</span><select name="planos" multiple size="2">${config.planos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></label>
      <label class="rx-campo"><span>Válido até</span><input name="validoAte" type="date"></label>
      <label class="rx-campo" style="min-width:110px"><span>Limite de usos</span><input name="limiteUsos" type="number" min="1"></label>
      <label class="rx-campo"><span>Afiliado</span><select name="afiliadoId"><option value="">Nenhum</option>${afs.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select></label>
      <button class="botao botao-primario">Criar cupom</button>
      <p class="rx-mudo" style="flex-basis:100%;margin:0">Sem planos marcados, o cupom vale para todos. Nenhum desconto deixa o pedido abaixo de R$ 5. Link pronto: /checkout?plano=ciclo&amp;cupom=CODIGO</p>
    </form>
    <div class="rx-cartao rx-rolagem" style="margin-top:16px"><table class="rx-tabela"><thead><tr><th>Código</th><th>Desconto</th><th>Planos</th><th>Usos</th><th>Validade</th><th>Afiliado</th><th>Receita</th><th></th></tr></thead><tbody>
    ${lista.map((c) => `<tr><td><strong>${esc(c.codigo)}</strong>${c.ativo ? '' : ' <span class="rx-etq cancelado">inativo</span>'}</td>
      <td>${c.tipo === 'percentual' ? `${c.valor}%` : reais(c.valor)}</td><td>${c.planos?.length ? c.planos.map((x) => esc(NOMES[x] || x)).join(', ') : 'Todos'}</td>
      <td>${c.usos}${c.limite_usos ? ` / ${c.limite_usos}` : ''}</td><td>${c.valido_ate ? data(c.valido_ate) : '—'}</td><td>${esc(c.afiliado || '—')}</td><td>${reais(c.receita)}</td>
      <td><button class="botao" data-cupom="${c.id}" data-ativo="${!c.ativo}">${c.ativo ? 'Desativar' : 'Reativar'}</button></td></tr>`).join('') || '<tr><td colspan="8" class="rx-mudo">Nenhum cupom ainda.</td></tr>'}
    </tbody></table></div>`;
  $('#novo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const corpo = Object.fromEntries(f);
    corpo.planos = f.getAll('planos');
    if (corpo.validoAte) corpo.validoAte = `${corpo.validoAte}T23:59:59-03:00`;
    try { await api('/admin/cupons', { metodo: 'POST', corpo }); cupons(); } catch (err) { alert(err.message); }
  });
  for (const b of conteudo.querySelectorAll('[data-cupom]')) b.addEventListener('click', async () => {
    await api(`/admin/cupons/${b.dataset.cupom}/ativo`, { metodo: 'POST', corpo: { ativo: b.dataset.ativo === 'true' } });
    cupons();
  });
}

async function afiliados() {
  const { afiliados: lista } = await api('/admin/afiliados');
  conteudo.innerHTML = `<h1 style="font-family:var(--f-display)">Afiliados</h1>
    <form class="rx-cartao rx-filtros" id="novo">
      <label class="rx-campo"><span>Nome</span><input name="nome" required></label>
      <label class="rx-campo"><span>E-mail</span><input name="email" type="email"></label>
      <label class="rx-campo"><span>Código do link</span><input name="codigo" required placeholder="DRAPAULA" style="text-transform:uppercase"></label>
      <label class="rx-campo" style="min-width:110px"><span>Comissão (%)</span><input name="comissaoPercentual" type="number" min="0" max="90" value="20"></label>
      <label class="rx-campo"><span>Chave PIX</span><input name="chavePix"></label>
      <button class="botao botao-primario">Cadastrar afiliado</button>
      <p class="rx-mudo" style="flex-basis:100%;margin:0">O afiliado divulga o link /checkout?plano=ciclo&amp;ref=CODIGO (vale 30 dias no navegador de quem clicou) ou um cupom vinculado a ele. A comissão só libera para pagamento depois dos 7 dias de garantia.</p>
    </form>
    <div class="rx-cartao rx-rolagem" style="margin-top:16px"><table class="rx-tabela"><thead><tr><th>Afiliado</th><th>Código</th><th>Comissão</th><th>Vendas</th><th>Receita</th><th>Em garantia</th><th>A pagar</th><th>Já pago</th><th></th></tr></thead><tbody>
    ${lista.map((a) => `<tr><td><strong>${esc(a.nome)}</strong><br><span class="rx-mudo">${esc(a.email || '')}${a.chave_pix ? ` · PIX ${esc(a.chave_pix)}` : ''}</span></td>
      <td>${esc(a.codigo)}</td><td>${Number(a.comissao_percentual)}%</td><td>${a.vendas}</td><td>${reais(a.receita)}</td>
      <td>${reais(a.comissao_em_garantia)}</td><td><strong>${reais(a.comissao_liberada)}</strong></td><td>${reais(a.comissao_paga)}</td>
      <td>${a.comissao_liberada > 0 ? `<button class="botao" data-pagar="${a.id}" data-nome="${esc(a.nome)}" data-valor="${a.comissao_liberada}">Marcar como pago</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="rx-mudo">Nenhum afiliado ainda.</td></tr>'}
    </tbody></table></div>`;
  $('#novo').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/admin/afiliados', { metodo: 'POST', corpo: Object.fromEntries(new FormData(e.target)) }); afiliados(); } catch (err) { alert(err.message); }
  });
  for (const b of conteudo.querySelectorAll('[data-pagar]')) b.addEventListener('click', async () => {
    if (!confirm(`Confirmar que você pagou ${reais(Number(b.dataset.valor))} a ${b.dataset.nome}?`)) return;
    await api(`/admin/afiliados/${b.dataset.pagar}/pagar`, { metodo: 'POST', corpo: {} });
    afiliados();
  });
}

async function auditoria() {
  const { eventos } = await api('/admin/auditoria');
  const ACOES = { conceder_acesso: 'Liberou acesso', revogar_acesso: 'Revogou acesso', reembolsar: 'Reembolsou pedido', criar_cupom: 'Criou cupom', ativar_cupom: 'Reativou cupom', desativar_cupom: 'Desativou cupom', criar_afiliado: 'Cadastrou afiliado', pagar_comissao: 'Pagou comissão' };
  conteudo.innerHTML = `<h1 style="font-family:var(--f-display)">Auditoria</h1>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Quando</th><th>Admin</th><th>Ação</th><th>Detalhes</th></tr></thead><tbody>
    ${eventos.map((e) => `<tr><td>${dataHora(e.em)}</td><td>${esc(e.admin || '—')}</td><td>${ACOES[e.acao] || esc(e.acao)}</td><td class="rx-mudo">${esc(JSON.stringify(e.detalhes))}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Nenhuma ação registrada.</td></tr>'}
    </tbody></table></div>`;
}

function paginacao(r, nome) {
  const paginas = Math.ceil(r.total / r.porPagina);
  if (paginas <= 1) return '';
  return `<div class="rx-linha" style="margin-top:12px" data-paginacao="${nome}">
    <button class="botao" data-pagina="${r.pagina - 1}" ${r.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="rx-mudo">Página ${r.pagina} de ${paginas}</span>
    <button class="botao" data-pagina="${r.pagina + 1}" ${r.pagina >= paginas ? 'disabled' : ''}>Próxima</button></div>`;
}
function ligarPaginacao(fn) { for (const b of conteudo.querySelectorAll('[data-pagina]')) b.addEventListener('click', () => fn(Number(b.dataset.pagina))); }
