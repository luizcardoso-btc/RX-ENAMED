import { $, api, reais, data, dataHora, esc } from './comum.js';
import { faculdades } from './faculdades.js';

const ETAPAS = { 1: '1º ano', 2: '2º ano', 3: '3º ano', 4: '4º ano', 5: '5º ano (internato)', 6: '6º ano (internato)', formado: 'Formado no Brasil', exterior: 'Formado no exterior' };
const SEXO = { masculino: 'Masculino', feminino: 'Feminino' };

const NOMES = { mensal: 'Mensal', ciclo: 'Ciclo de prova', 'anual-enamed': 'Ciclo anual completo (ENAMED)', 'segunda-etapa': '2ª etapa', anual: 'Anual completo' };
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
if (usuario?.papel === 'admin') portaria();

// Duas etapas: o painel só abre com o código do aplicativo autenticador (obrigatório para admin em produção).
async function portaria() {
  if (usuario.precisa2fa) return telaVerificar();
  try { await api('/admin/resumo?dias=7'); abrir(); } catch (e) {
    if (e.corpo?.codigo === '2fa_obrigatorio') return telaAtivar();
    if (e.corpo?.codigo === '2fa_verificar') return telaVerificar();
    conteudo.innerHTML = `<p class="rx-erro">${esc(e.message)}</p>`;
  }
}
function telaVerificar() {
  conteudo.innerHTML = `<section class="rx-cartao" style="max-width:440px"><h1 style="margin-top:0">Verificação em duas etapas</h1>
    <p>Digite o código de 6 dígitos do aplicativo autenticador, ou um código de recuperação.</p>
    <form id="f2"><label class="rx-campo"><span>Código</span><input name="codigo" inputmode="numeric" autocomplete="one-time-code" required autofocus></label>
    <p class="rx-erro rx-oculto" id="e2"></p><button class="botao botao-primario rx-botao-largo">Entrar no painel</button></form></section>`;
  $('#f2').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api('/2fa/verificar', { metodo: 'POST', corpo: Object.fromEntries(new FormData(ev.target)) }); abrir(); }
    catch (err) { const el = $('#e2'); el.textContent = err.message; el.classList.remove('rx-oculto'); }
  });
}
async function telaAtivar() {
  const { segredo, uri } = await api('/2fa/iniciar', { metodo: 'POST', corpo: {} });
  conteudo.innerHTML = `<section class="rx-cartao" style="max-width:560px"><h1 style="margin-top:0">Proteja o painel com duas etapas</h1>
    <p>Para abrir o painel, ative a verificação em duas etapas. Assim, mesmo que alguém descubra sua senha, não entra sem o seu celular.</p>
    <ol><li>Instale um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy ou 1Password).</li>
    <li>No aplicativo, escolha "adicionar conta" e "digitar chave" e informe a chave abaixo (ou toque no link pelo celular).</li>
    <li>Digite o código de 6 dígitos que aparecer.</li></ol>
    <p class="rx-codigos" style="grid-template-columns:1fr;word-break:break-all">${esc(segredo)}</p>
    <p><a href="${esc(uri)}">Abrir no aplicativo autenticador (pelo celular)</a></p>
    <form id="f3"><label class="rx-campo"><span>Código de 6 dígitos</span><input name="codigo" inputmode="numeric" autocomplete="one-time-code" required></label>
    <p class="rx-erro rx-oculto" id="e3"></p><button class="botao botao-primario rx-botao-largo">Ativar</button></form></section>`;
  $('#f3').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const r = await api('/2fa/ativar', { metodo: 'POST', corpo: Object.fromEntries(new FormData(ev.target)) });
      conteudo.innerHTML = `<section class="rx-cartao" style="max-width:560px"><h1 style="margin-top:0">Duas etapas ativada</h1>
        <p><strong>Guarde estes códigos de recuperação</strong> num lugar seguro (fora do celular). Cada um vale uma vez, se você perder o celular.</p>
        <div class="rx-codigos">${r.codigosRecuperacao.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        <p><button class="botao botao-primario" id="seguir">Já guardei, abrir o painel</button></p></section>`;
      $('#seguir').addEventListener('click', abrir);
    } catch (err) { const el = $('#e3'); el.textContent = err.message; el.classList.remove('rx-oculto'); }
  });
}

function abrir() {
  const aba = location.hash.slice(1) || 'metas';
  for (const b of document.querySelectorAll('[data-aba]')) b.style.color = b.dataset.aba === aba ? 'var(--tinta)' : '';
  fecharGaveta();
  if (aba === 'faculdades') return faculdades(conteudo, (html) => { $('#gaveta').innerHTML = html; }, fecharGaveta).catch((e) => { conteudo.innerHTML = `<p class="rx-erro">${esc(e.message)}</p>`; });
  ({ metas, painel, alunos, pedidos, cupons, afiliados, estacoes, auditoria }[aba] || metas)();
}

// ---- Metas: progresso até as metas do negócio, ritmo, previsão, funil e indicações.
const milhar = (n) => Math.round(n).toLocaleString('pt-BR');
const reaisCurto = (c) => (c >= 100000000 ? `R$ ${(c / 100000000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : c >= 100000 ? `R$ ${(c / 100000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : reais(c));
function barraMeta(titulo, atual, meta, formato, detalhe) {
  const f = Math.min(1, meta ? atual / meta : 0);
  return `<section class="rx-cartao meta-grande">
    <div class="meta-topo"><span class="rx-mudo">${titulo}</span><strong>${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: f < 0.1 ? 2 : 1 })}%</strong></div>
    <div class="meta-numeros"><strong>${formato(atual)}</strong><span class="rx-mudo"> de ${formato(meta)}</span></div>
    <div class="meta-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f * 100)}"><span style="width:${Math.max(f * 100, f > 0 ? 1 : 0)}%"></span></div>
    <p class="rx-mudo pequeno">${detalhe}</p></section>`;
}
function graficoAcumulado(serie, campo, meta, formato) {
  const L = 640, A = 200, e = 78, d = 12, c = 14, b = 26;
  const max = Math.max(meta * 0.05, ...serie.map((s) => s[campo]), 1) * 1.15;
  const x = (i) => e + (i * (L - e - d)) / (serie.length - 1);
  const y = (v) => c + (1 - v / max) * (A - c - b);
  const linha = serie.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[campo]).toFixed(1)}`).join(' ');
  const area = `${linha} L${x(serie.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const metaVisivel = meta <= max;
  return `<svg viewBox="0 0 ${L} ${A}" class="grafico-meta" role="img" aria-label="Evolução acumulada nos últimos 60 dias">
    ${[0, 0.5, 1].map((f) => `<line x1="${e}" x2="${L - d}" y1="${y(max * f)}" y2="${y(max * f)}" class="g-grade"/><text x="${e - 6}" y="${y(max * f) + 4}" text-anchor="end" class="g-eixo">${formato(max * f)}</text>`).join('')}
    ${metaVisivel ? `<line x1="${e}" x2="${L - d}" y1="${y(meta)}" y2="${y(meta)}" class="g-meta"/><text x="${L - d}" y="${y(meta) - 5}" text-anchor="end" class="g-rotulo">meta ${formato(meta)}</text>` : ''}
    <path d="${area}" class="g-area"/><path d="${linha}" class="g-linha"/>
    ${[0, 29, 59].map((i) => `<text x="${x(i)}" y="${A - 8}" text-anchor="${i === 0 ? 'start' : i === 59 ? 'end' : 'middle'}" class="g-eixo">${data(serie[i].dia + 'T12:00:00').slice(0, 5)}</text>`).join('')}
    ${serie.map((s, i) => `<rect x="${x(i) - 5}" y="${c}" width="10" height="${A - c - b}" class="g-alvo"><title>${data(s.dia + 'T12:00:00')}: ${formato(s[campo])}</title></rect>`).join('')}
  </svg>${metaVisivel ? '' : `<p class="rx-mudo pequeno">A meta (${formato(meta)}) está acima da escala do gráfico.</p>`}`;
}
async function metas() {
  const m = await api('/admin/metas');
  const dataPrev = (iso) => (iso ? data(iso) : 'sem ritmo ainda');
  const f = m.funil;
  const etapas = [['Visitantes únicos', f.visitantes], ['Cadastros', f.cadastros], ['Iniciaram checkout', f.checkout], ['Pagantes', f.pagantes]];
  const maxF = Math.max(1, ...etapas.map((x) => x[1]));
  conteudo.innerHTML = `
    <div class="rx-filtros" style="justify-content:space-between"><h1 style="font-family:var(--f-display);margin:0">Metas</h1>
      <button class="botao" id="editar-metas">Editar metas</button></div>
    <form id="form-metas" class="rx-cartao rx-filtros rx-oculto">
      <label class="rx-campo"><span>Meta de usuários</span><input name="usuarios" type="number" min="1" value="${m.metas.usuarios}"></label>
      <label class="rx-campo"><span>Meta de receita (R$)</span><input name="receitaReais" type="number" min="1" step="1" value="${m.metas.receitaCentavos / 100}"></label>
      <label class="rx-campo"><span>Prazo</span><input name="prazo" type="date" value="${m.metas.prazo || ''}"></label>
      <button class="botao botao-primario">Salvar</button>
    </form>
    <div class="metas-duas">
      ${barraMeta('Usuários cadastrados', m.atual.usuarios, m.metas.usuarios, milhar,
        m.falta.usuarios ? `Faltam ${milhar(m.falta.usuarios)}. Ritmo: ${m.ritmo.usuariosDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia${m.necessario ? `; necessário: ${m.necessario.usuariosDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia` : ''}. Previsão: ${dataPrev(m.previsao.usuarios)}.` : 'Meta atingida!')}
      ${barraMeta('Receita', m.atual.receita, m.metas.receitaCentavos, reaisCurto,
        m.falta.receita ? `Faltam ${reaisCurto(m.falta.receita)}, cerca de ${milhar(m.vendasParaMeta)} vendas no ticket médio de ${reais(m.atual.ticket)}. Ritmo: ${reaisCurto(m.ritmo.receitaDia)}/dia${m.necessario ? `; necessário: ${reaisCurto(m.necessario.receitaDia)}/dia (${m.necessario.vendasDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vendas/dia)` : ''}. Previsão: ${dataPrev(m.previsao.receita)}.` : 'Meta atingida!')}
    </div>
    <div class="rx-kpis">
      <div class="rx-kpi"><span>Pagantes</span><strong>${milhar(m.atual.pagantes)}</strong><small>${m.atual.usuarios ? ((m.atual.pagantes / m.atual.usuarios) * 100).toFixed(1).replace('.', ',') : 0}% dos cadastros</small></div>
      <div class="rx-kpi"><span>Cadastros (7 / 30 dias)</span><strong>${milhar(m.ultimos.usuarios7)} / ${milhar(m.ultimos.usuarios30)}</strong></div>
      <div class="rx-kpi"><span>Receita (7 / 30 dias)</span><strong>${reaisCurto(m.ultimos.receita7)}</strong><small>${reaisCurto(m.ultimos.receita30)} em 30 dias</small></div>
      <div class="rx-kpi"><span>Ticket médio</span><strong>${reais(m.atual.ticket)}</strong><small>${m.atual.vendas ? `${milhar(m.atual.vendas)} vendas` : 'estimado até a 1ª venda'}</small></div>
      <div class="rx-kpi"><span>Prazo</span><strong>${m.diasRestantes === null ? '—' : `${milhar(m.diasRestantes)} dias`}</strong><small>${m.metas.prazo ? `até ${data(m.metas.prazo + 'T12:00:00')}` : 'defina em "Editar metas"'}</small></div>
    </div>
    <div class="rx-duas">
      <section class="rx-cartao"><h2 style="margin-top:0">Usuários acumulados (60 dias)</h2>${graficoAcumulado(m.serie, 'usuarios', m.metas.usuarios, milhar)}</section>
      <section class="rx-cartao"><h2 style="margin-top:0">Receita acumulada (60 dias)</h2>${graficoAcumulado(m.serie, 'receita', m.metas.receitaCentavos, reaisCurto)}</section>
    </div>
    <div class="rx-duas">
      <section class="rx-cartao"><h2 style="margin-top:0">Funil dos últimos 30 dias</h2>
        <div class="funil">${etapas.map(([nome, v], i) => `<div class="funil-etapa"><span>${nome}</span><div class="funil-barra"><i style="width:${(v / maxF) * 100}%"></i></div><strong>${milhar(v)}</strong>
          <small class="rx-mudo">${i ? (etapas[i - 1][1] ? `${((v / etapas[i - 1][1]) * 100).toFixed(1).replace('.', ',')}% da etapa anterior` : '—') : 'sem cookies, anônimo'}</small></div>`).join('')}</div></section>
      <section class="rx-cartao"><h2 style="margin-top:0">De onde vêm os cadastros</h2>
        <table class="rx-tabela"><tbody>${m.origens.map((o) => `<tr><td>${esc(o.origem === 'indicacao' ? 'Indicação de aluno' : o.origem)}</td><td>${milhar(o.n)}</td></tr>`).join('') || '<tr><td class="rx-mudo">Sem cadastros ainda.</td></tr>'}</tbody></table>
        <p class="rx-mudo pequeno">Para medir campanhas, use links com ?utm_source=instagram (ou whatsapp, tiktok…) apontando para /entrar.</p></section>
    </div>
    <section class="rx-cartao" style="margin-top:16px"><h2 style="margin-top:0">Programa de indicação</h2>
      <div class="rx-kpis">
        <div class="rx-kpi"><span>Cadastros indicados</span><strong>${milhar(m.indicacao.cadastros)}</strong></div>
        <div class="rx-kpi"><span>Indicados que compraram</span><strong>${milhar(m.indicacao.compraram)}</strong></div>
        <div class="rx-kpi"><span>Receita de indicados</span><strong>${reaisCurto(m.indicacao.receita)}</strong></div>
        <div class="rx-kpi"><span>Dias de acesso dados</span><strong>${milhar(m.indicacao.dias)}</strong></div>
      </div>
      <table class="rx-tabela"><thead><tr><th>Quem mais indica</th><th>Código</th><th>Cadastros</th><th>Compraram</th></tr></thead><tbody>
        ${m.topIndicadores.map((i) => `<tr class="clicavel" data-aluno="${i.id}"><td><strong>${esc(i.nome)}</strong><br><span class="rx-mudo">${esc(i.email)}</span></td><td>${esc(i.codigo || '')}</td><td>${i.cadastros}</td><td>${i.compraram}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Nenhuma indicação ainda.</td></tr>'}
      </tbody></table></section>`;
  $('#editar-metas').addEventListener('click', () => $('#form-metas').classList.toggle('rx-oculto'));
  $('#form-metas').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/admin/metas', { metodo: 'PUT', corpo: Object.fromEntries(new FormData(e.target)) }); metas(); } catch (err) { alert(err.message); }
  });
  for (const tr of conteudo.querySelectorAll('tr[data-aluno]')) tr.addEventListener('click', () => detalheAluno(tr.dataset.aluno));
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
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Aluno</th><th>Etapa</th><th>Situação</th><th>Plano</th><th>Acesso até</th><th>Total pago</th><th>Cadastro</th><th>Último acesso</th></tr></thead><tbody>
      ${r.alunos.map((a) => `<tr class="clicavel" data-id="${a.id}"><td><strong>${esc(a.nome)}</strong><br><span class="rx-mudo">${esc(a.email)}</span></td><td>${esc(ETAPAS[a.etapa] || '—')}</td>
        <td><span class="rx-etq ${a.situacao}">${SIT[a.situacao]}</span></td><td>${esc(NOMES[a.plano] || '—')}</td><td>${data(a.acesso_ate)}</td>
        <td>${reais(a.total_pago)}</td><td>${data(a.criado_em)}</td><td>${data(a.ultimo_acesso)}</td></tr>`).join('') || '<tr><td colspan="8" class="rx-mudo">Nenhum aluno encontrado.</td></tr>'}
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
    <p class="rx-mudo">${esc(aluno.email)} · CPF ${esc(aluno.cpf || '—')}<br>Celular ${esc(aluno.telefone || '—')} · ${esc(SEXO[aluno.sexo] || 'Sexo não informado')} · ${esc(ETAPAS[aluno.etapa] || 'Etapa não informada')}<br>Cadastro ${dataHora(aluno.criado_em)} · último acesso ${dataHora(aluno.ultimo_acesso)}<br>
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

// Acervo da 2ª etapa: estações autorais e oficiais do Inep, com status, origem, validação do PEP e pendências.
// O cadastro é feito em arquivos versionados (conteudo/estacoes e conteudo/estacoes-inep), validados no build.
const ORIGEM = { oficial: 'Oficial Inep', adaptado: 'Adaptado', autoral: 'Autoral RX MED' };
const STATUS_EST = { publicada: 'Publicada', revisao: 'Em revisão', rascunho: 'Rascunho' };
let filtroEst = { status: '', origem: '', area: '', busca: '' };
async function estacoes() {
  const { estacoes: todas } = await api('/admin/estacoes');
  const areas = [...new Set(todas.map((e) => e.area))].sort();
  const lista = todas.filter((e) => (!filtroEst.status || e.status === filtroEst.status) && (!filtroEst.origem || e.origem === filtroEst.origem)
    && (!filtroEst.area || e.area === filtroEst.area) && (!filtroEst.busca || `${e.titulo} ${e.id} ${e.edicao || ''}`.toLowerCase().includes(filtroEst.busca.toLowerCase())));
  const n = (f) => todas.filter(f).length;
  const opc = (v, r, atual) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${esc(r)}</option>`;
  conteudo.innerHTML = `<h1 style="font-family:var(--f-display)">Estações da 2ª etapa</h1>
    <div class="rx-grade-numeros">
      <div class="rx-cartao"><span class="rx-mudo">Publicadas</span><strong class="rx-preco">${n((e) => e.status === 'publicada')}</strong></div>
      <div class="rx-cartao"><span class="rx-mudo">Em revisão</span><strong class="rx-preco">${n((e) => e.status === 'revisao')}</strong></div>
      <div class="rx-cartao"><span class="rx-mudo">Oficiais do Inep</span><strong class="rx-preco">${n((e) => e.origem === 'oficial')}</strong></div>
      <div class="rx-cartao"><span class="rx-mudo">Autorais RX MED</span><strong class="rx-preco">${n((e) => e.origem === 'autoral')}</strong></div>
    </div>
    <p class="rx-mudo">Só estações publicadas aparecem para os alunos. Para cadastrar ou corrigir, edite o arquivo da estação (conteudo/estacoes ou conteudo/estacoes-inep): o build recusa PEP que não some 10 pontos. As oficiais são reimportadas com ferramentas/importar_pep_inep.py.</p>
    <div class="rx-linha" style="margin:12px 0;flex-wrap:wrap;gap:8px">
      <select id="f-status">${opc('', 'Todos os status', filtroEst.status)}${Object.entries(STATUS_EST).map(([v, r]) => opc(v, r, filtroEst.status)).join('')}</select>
      <select id="f-origem">${opc('', 'Todas as origens', filtroEst.origem)}${Object.entries(ORIGEM).map(([v, r]) => opc(v, r, filtroEst.origem)).join('')}</select>
      <select id="f-area">${opc('', 'Todas as áreas', filtroEst.area)}${areas.map((a) => opc(a, a, filtroEst.area)).join('')}</select>
      <input id="f-busca" placeholder="Buscar título, id ou edição" value="${esc(filtroEst.busca)}">
    </div>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Estação</th><th>Área</th><th>Origem</th><th>Status</th><th>PEP</th><th>Modos</th><th>Pendências</th></tr></thead><tbody>
    ${lista.map((e) => `<tr data-estacao="${esc(e.id)}" style="cursor:pointer">
      <td><strong>${esc(e.titulo)}</strong><br><span class="rx-mudo">${esc(e.id)}${e.edicao ? ` · ${esc(e.edicao)}` : ''}</span></td>
      <td>${esc(e.area)}</td><td>${ORIGEM[e.origem] || esc(e.origem)}</td><td>${STATUS_EST[e.status] || esc(e.status)}</td>
      <td>${e.criterios} critérios · ${String(e.somaPep).replace('.', ',')} pts${e.somaPep === 10 ? '' : ' ⚠'}</td>
      <td class="rx-mudo">${[e.modos.gratuito && 'gratuito', e.modos.roteiro && 'roteiro', 'dupla'].filter(Boolean).join(', ')}</td>
      <td class="rx-mudo">${esc([...e.pendencias, ...e.problemas].join('; ') || '—')}</td></tr>`).join('') || '<tr><td colspan="7" class="rx-mudo">Nenhuma estação com esse filtro.</td></tr>'}
    </tbody></table></div>`;
  for (const [id, campo] of [['#f-status', 'status'], ['#f-origem', 'origem'], ['#f-area', 'area']]) $(id).addEventListener('change', (ev) => { filtroEst[campo] = ev.target.value; estacoes(); });
  $('#f-busca').addEventListener('change', (ev) => { filtroEst.busca = ev.target.value; estacoes(); });
  for (const tr of conteudo.querySelectorAll('[data-estacao]')) tr.addEventListener('click', () => detalheEstacao(tr.dataset.estacao));
}

async function detalheEstacao(id) {
  const { estacao: e, problemas } = await api(`/admin/estacoes/${encodeURIComponent(id)}`);
  const lista = (itens) => `<ul>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  $('#gaveta').innerHTML = `<div class="rx-gaveta"><div class="rx-cartao">
    <button class="botao" id="fechar-gaveta" style="float:right">Fechar</button>
    <h2 style="font-family:var(--f-display)">${esc(e.titulo)}</h2>
    <p class="rx-mudo">${esc(e.id)} · ${esc(e.area)} · ${ORIGEM[e.origem]} · ${STATUS_EST[e.status]}${e.fonte?.url ? ` · <a href="${esc(e.fonte.url)}" target="_blank" rel="noopener">PEP original</a>` : ''}</p>
    ${[...e.pendencias, ...problemas].length ? `<p class="rx-aviso">${esc([...e.pendencias, ...problemas].join('; '))}</p>` : ''}
    <h3>Candidato (impresso da porta)</h3><p>${esc(e.cenario)}</p>${lista(e.instrucoes)}${lista(e.tarefas)}
    <h3>Roteiro do paciente (${e.paciente?.roteiro?.length || 0} itens)</h3>${lista((e.paciente?.roteiro || []).map((r) => `${r.topico}: ${r.resposta}`))}
    <h3>Impressos</h3>${lista([...e.exameFisico.map((x) => `${x.item}${x.imagem ? ' (imagem)' : ''}`), ...e.exames.map((x) => `${x.item}${x.imagem ? ' (imagem)' : ''}`)])}
    <h3>PEP</h3><table class="rx-tabela"><thead><tr><th>Critério</th><th>Peso</th><th>Parcial</th><th>Origem</th></tr></thead><tbody>
    ${e.pep.map((c) => `<tr><td>${esc(c.descricao)}<br><span class="rx-mudo">Adequado: ${esc(c.integral)}</span></td><td>${c.peso}</td><td>${c.pontos.parcial ?? '—'}</td><td>${ORIGEM[c.origem]}${c.critico ? ' · crítico' : ''}</td></tr>`).join('')}
    </tbody></table>
    <h3>Referências</h3>${lista(e.referencias)}
  </div></div>`;
  $('#fechar-gaveta').addEventListener('click', fecharGaveta);
}

async function auditoria() {
  const { eventos } = await api('/admin/auditoria');
  const ACOES = { conceder_acesso: 'Liberou acesso', revogar_acesso: 'Revogou acesso', reembolsar: 'Reembolsou pedido', criar_cupom: 'Criou cupom', ativar_cupom: 'Reativou cupom', desativar_cupom: 'Desativou cupom', criar_afiliado: 'Cadastrou afiliado', pagar_comissao: 'Pagou comissão', alterar_metas: 'Alterou as metas', faculdade_status: 'Mudou status de escola' };
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
