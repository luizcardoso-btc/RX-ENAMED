// Aba "Prédio" do admin: o time de marketing da Rx Med. Cada andar tem salas; cada sala é um agente com o seu trabalho.
// Os agentes trabalham por regras no servidor (sem IA paga). A Lia desenha as artes aqui no navegador (canvas → PNG).
import { $, api, data, esc, reais } from './comum.js';

let estado = { sala: null, segunda: null, dados: null, semana: null, selecionada: null };
let raiz = null;
const STATUS = { rascunho: 'Rascunho', aprovada: 'Aprovada', postada: 'Postada', descartada: 'Descartada' };
const COR_STATUS = { rascunho: '#e0a52a', aprovada: '#2CC79F', postada: '#6aa8f0', descartada: '#8FA3A8' };
const FORMATO = { carrossel: 'Carrossel', reels: 'Reels', story: 'Story' };
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const diaBR = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return `${DIAS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const chip = (st) => `<span class="rx-etq" style="color:${COR_STATUS[st]};border-color:${COR_STATUS[st]}">${STATUS[st]}</span>`;
const erro = (e) => `<p class="rx-erro">${esc(e.message || e)}</p>`;
const copiar = async (texto, botao) => { try { await navigator.clipboard.writeText(texto); const t = botao.textContent; botao.textContent = 'Copiado ✓'; setTimeout(() => { botao.textContent = t; }, 1500); } catch { alert('Não foi possível copiar.'); } };

export async function predio(conteudo) {
  raiz = conteudo;
  estado = { sala: null, segunda: null, dados: null, semana: null, selecionada: null };
  await carregar();
}

async function carregar() {
  try { estado.dados = await api('/admin/predio'); } catch (e) { raiz.innerHTML = erro(e); return; }
  if (!estado.segunda) estado.segunda = segundaDe(estado.dados.resumo.hoje);
  desenhar();
}
function segundaDe(iso) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
async function carregarSemana() { estado.semana = await api(`/admin/predio/semana?segunda=${estado.segunda}`); }
const agente = (id) => estado.dados.equipe.find((a) => a.id === id);

function desenhar() {
  if (!estado.sala) return desenharPredio();
  const a = agente(estado.sala);
  raiz.innerHTML = `<button class="botao" id="voltar" style="margin-bottom:12px">← Voltar para o prédio</button>
    <header class="pd-cab"><span class="pd-av">${a.emoji}</span><div><h1 style="font-family:var(--f-display);margin:0">${esc(a.nome)}</h1><p class="rx-mudo" style="margin:2px 0 0">${esc(a.papel)} · ${esc(a.status)}</p></div></header>
    <div id="sala"><p class="rx-mudo">Carregando…</p></div>`;
  $('#voltar').addEventListener('click', () => { estado.sala = null; carregar(); });
  const salas = { gerente: salaGerente, cto: salaRafael, copy_video: salaDavi, copy_imagem: salaNina, imagem: salaLia, social: salaRenan, atendente: salaSofia, financeiro: salaOtavio, comercial: salaJade, recepcao: salaClara };
  salas[estado.sala]($('#sala')).catch((e) => { $('#sala').innerHTML = erro(e); });
}

function abrirSala(id) { estado.sala = id; desenhar(); window.scrollTo(0, 0); }

// ---------------------------------------------------------------- o prédio
function desenharPredio() {
  const { equipe, resumo } = estado.dados;
  const andares = [...new Set(equipe.map((a) => a.andar))].sort((a, b) => b - a);
  const nomeAndar = { 0: 'Térreo · Recepção', 1: '1º andar · Diretoria', 2: '2º andar · Estratégia', 3: '3º andar · Redação', 4: '4º andar · Estúdio', 5: '5º andar · Atendimento e parcerias' };
  const n = resumo.numeros;
  raiz.innerHTML = `
    <h1 style="font-family:var(--f-display)">Prédio Rx Med</h1>
    <p class="rx-mudo">O time de marketing do curso. Os agentes trabalham por regras, com os dados reais da plataforma, sem custo de IA.
      Você aprova; nada é publicado sozinho.</p>
    <div class="pd-kpis">
      <div class="rx-kpi"><span>Cadastros hoje</span><strong>${n.cadastrosHoje}</strong></div>
      <div class="rx-kpi"><span>Cadastros 7 dias</span><strong>${n.cadastros7d}</strong></div>
      <div class="rx-kpi"><span>Vendas 7 dias</span><strong>${n.vendas7d}</strong></div>
      <div class="rx-kpi"><span>Receita 7 dias</span><strong>${reais(n.receita7d)}</strong></div>
      <div class="rx-kpi"><span>Alunos ativos</span><strong>${n.alunosAtivos}</strong></div>
    </div>
    <div class="pd-predio">
      <div class="pd-telhado"><span>Rx</span> Med</div>
      ${andares.map((k) => `<section class="pd-andar"><span class="pd-andar-nome">${nomeAndar[k] || `${k}º andar`}</span><div class="pd-salas">
        ${equipe.filter((a) => a.andar === k).map((a) => `<button class="pd-sala" data-sala="${a.id}">
          <span class="pd-av">${a.emoji}</span><span class="pd-nome"><strong>${esc(a.nome)}</strong><small>${esc(a.papel)}</small></span>
          <span class="pd-bal">${esc(a.status)}</span></button>`).join('')}
      </div></section>`).join('')}
    </div>`;
  for (const b of raiz.querySelectorAll('[data-sala]')) b.addEventListener('click', () => abrirSala(b.dataset.sala));
}

// ---------------------------------------------------------------- Helena
async function salaGerente(el) {
  const { resumo } = estado.dados = await api('/admin/predio');
  const n = resumo.numeros;
  el.innerHTML = `
    <div class="pd-kpis">
      <div class="rx-kpi"><span>Vendas 24 h</span><strong>${n.vendas24h}</strong><small class="rx-mudo">${reais(n.receita24h)}</small></div>
      <div class="rx-kpi"><span>Vendas 7 dias</span><strong>${n.vendas7d}</strong><small class="rx-mudo">${reais(n.receita7d)}</small></div>
      <div class="rx-kpi"><span>Cadastros 7 dias</span><strong>${n.cadastros7d}</strong><small class="rx-mudo">conversão ${n.cadastros7d ? Math.round((100 * n.vendas7d) / n.cadastros7d) : 0}%</small></div>
      <div class="rx-kpi"><span>Alunos ativos</span><strong>${n.alunosAtivos}</strong></div>
    </div>
    ${resumo.nacional ? `<p class="rx-cartao">📝 Simulado nacional aberto: <strong>${esc(resumo.nacional.nome)}</strong> até ${data(resumo.nacional.fim)}. Bom momento para divulgar nos stories.</p>` : ''}
    <h2>Sua lista de hoje</h2>
    ${resumo.tarefas.length ? `<ul class="pd-lista">${resumo.tarefas.map((t) => `<li><span>${t.tipo === 'aprovar' ? '✅ Aprovar' : '▶ Fazer'} · ${esc(t.titulo)}</span>
      <button class="botao" data-ir="${t.sala}">Abrir</button></li>`).join('')}</ul>` : '<p class="rx-mudo">Tudo em dia. 🎉</p>'}`;
  for (const b of el.querySelectorAll('[data-ir]')) b.addEventListener('click', () => irPara(b.dataset.ir));
}
function irPara(destino) {
  if (destino === 'questoes' || destino === 'eventos') { location.hash = destino; return; }
  if (destino === 'ajustes') return abrirSala('recepcao');
  abrirSala(destino);
}

// ---------------------------------------------------------------- semana (usado por Rafael, Davi, Nina, Lia e Renan)
function navegadorSemana(onMudar) {
  const fim = somaDias(estado.segunda, 4);
  const html = `<div class="rx-filtros"><button class="botao" id="sem-ant">‹</button><strong>Semana de ${diaBR(estado.segunda)} a ${diaBR(fim)}</strong><button class="botao" id="sem-prox">›</button></div>`;
  return { html, ligar: () => {
    $('#sem-ant').addEventListener('click', () => { estado.segunda = somaDias(estado.segunda, -7); onMudar(); });
    $('#sem-prox').addEventListener('click', () => { estado.segunda = somaDias(estado.segunda, 7); onMudar(); });
  } };
}
async function salvarPeca(id, corpo) {
  const { peca } = await api(`/admin/predio/pecas/${id}`, { metodo: 'PATCH', corpo });
  const i = estado.semana.pecas.findIndex((p) => p.id === id);
  if (i >= 0) estado.semana.pecas[i] = peca;
  return peca;
}

function previa(p) {
  const c = p.conteudo;
  if (p.formato === 'reels') {
    return `<p><strong>Gancho:</strong> ${esc(c.gancho)}</p><table class="rx-tabela"><thead><tr><th>Tempo</th><th>Fala</th><th>Na tela</th></tr></thead><tbody>
      ${c.roteiro.map((r) => `<tr><td>${esc(r.tempo)}</td><td>${esc(r.fala)}</td><td class="rx-mudo">${esc(r.tela)}</td></tr>`).join('')}</tbody></table>`;
  }
  return `<ol class="pd-slides">${c.slides.map((s) => `<li>${s.sobre ? `<small class="rx-mudo">${esc(s.sobre)}</small><br>` : ''}${s.titulo ? `<strong>${esc(s.titulo)}</strong><br>` : ''}${esc(s.texto || '')}${s.itens ? `<ul>${s.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>`;
}

// ---------------------------------------------------------------- Rafael
async function salaRafael(el) {
  await carregarSemana();
  const nav = navegadorSemana(() => salaRafael(el));
  const pecas = estado.semana.pecas;
  const rasc = pecas.filter((p) => p.status === 'rascunho').length;
  el.innerHTML = `${nav.html}
    <p class="rx-mudo">Pauta de segunda a sexta: questão comentada, "o Inep adora cobrar", Raio-X da área, conduta em 30 segundos e produto,
      com stories de enquete e contagem. As áreas mudam a cada semana e nenhuma questão se repete. Aprovadas e postadas não mudam ao refazer.</p>
    <div class="rx-filtros"><button class="botao botao-primario" id="montar">${pecas.length ? 'Refazer os rascunhos' : 'Montar a pauta da semana'}</button>
      ${rasc ? `<button class="botao" id="aprovar-todas">Aprovar todas (${rasc})</button>` : ''}</div>
    ${pecas.length ? pecas.map((p) => `<details class="rx-cartao pd-peca"><summary><span>${diaBR(p.dia)} · ${p.horario || ''} · ${FORMATO[p.formato]} · <strong>${esc(p.titulo)}</strong> <small class="rx-mudo">(${esc(p.pilar)} · ${esc(agente(p.agente)?.nome || '')})</small></span> ${chip(p.status)}</summary>
        ${previa(p)}
        <label class="rx-campo"><span>Legenda</span><textarea rows="7" data-legenda="${p.id}">${esc(p.conteudo.legenda || '')}</textarea></label>
        <div class="rx-filtros"><button class="botao" data-salvar="${p.id}">Salvar legenda</button>
          ${p.status !== 'aprovada' && p.status !== 'postada' ? `<button class="botao botao-primario" data-st="${p.id}" data-v="aprovada">Aprovar</button>` : ''}
          ${p.status !== 'descartada' && p.status !== 'postada' ? `<button class="botao" data-st="${p.id}" data-v="descartada">Descartar</button>` : ''}
          ${p.status === 'aprovada' ? `<button class="botao" data-st="${p.id}" data-v="rascunho">Voltar para rascunho</button>` : ''}</div>
      </details>`).join('') : '<p class="rx-mudo">Nenhuma peça nesta semana ainda.</p>'}`;
  nav.ligar();
  $('#montar').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { estado.semana = await api('/admin/predio/semana', { metodo: 'POST', corpo: { segunda: estado.segunda } }); salaRafael(el); } catch (err) { alert(err.message); e.target.disabled = false; }
  });
  $('#aprovar-todas')?.addEventListener('click', async () => {
    for (const p of pecas.filter((x) => x.status === 'rascunho')) await salvarPeca(p.id, { status: 'aprovada' });
    salaRafael(el);
  });
  for (const b of el.querySelectorAll('[data-salvar]')) b.addEventListener('click', async () => {
    try { await salvarPeca(b.dataset.salvar, { legenda: el.querySelector(`[data-legenda="${b.dataset.salvar}"]`).value }); b.textContent = 'Salvo ✓'; } catch (err) { alert(err.message); }
  });
  for (const b of el.querySelectorAll('[data-st]')) b.addEventListener('click', async () => {
    try { await salvarPeca(b.dataset.st, { status: b.dataset.v }); salaRafael(el); } catch (err) { alert(err.message); }
  });
}

// ---------------------------------------------------------------- Davi
async function salaDavi(el) {
  await carregarSemana();
  const nav = navegadorSemana(() => salaDavi(el));
  const { aprendizado } = await api('/admin/predio/davi');
  const reels = estado.semana.pecas.filter((p) => p.formato === 'reels');
  const TIPO = { numero: 'Número', pergunta: 'Pergunta', erro: 'Erro comum', verdade: 'Verdade incômoda', conduta: 'Conduta em 30s' };
  el.innerHTML = `${nav.html}
    <section class="rx-cartao"><h3 style="margin-top:0">Como eu escrevo</h3><ul class="rx-mudo">
      <li>Gancho de até 12 palavras nos 3 primeiros segundos, falado e escrito na tela.</li>
      <li>Uma ideia por vídeo, com um caso real de prova (Inep) e a fonte na legenda.</li>
      <li>Mostrar a questão na tela vale mais que prometer. Uma única chamada: comentar a palavra-chave.</li>
      <li>Nunca: "aprovação garantida", depoimento inventado ou número sem fonte.</li></ul></section>
    <section class="rx-cartao"><h3 style="margin-top:0">O que está funcionando</h3>
      ${aprendizado.length ? `<table class="rx-tabela"><thead><tr><th>Tipo de gancho</th><th>Posts</th><th>Engajamento (salvos + comentários + compart. / alcance)</th></tr></thead><tbody>
        ${aprendizado.map((a) => `<tr><td>${esc(TIPO[a.tipo] || a.tipo)}</td><td>${a.posts}</td><td>${a.engajamento}%</td></tr>`).join('')}</tbody></table>
        <p class="rx-mudo pequeno">Com 3 posts ou mais de um tipo, o que rende mais passa a ser usado com prioridade na pauta.</p>`
      : `<p class="rx-mudo">Ainda sem métricas. Quando o ${esc(agente('social').nome)} anotar o alcance e os salvamentos dos posts, eu aprendo quais ganchos rendem mais.</p>`}</section>
    <h2>Roteiros da semana</h2>
    ${reels.length ? reels.map((p) => `<section class="rx-cartao"><p class="rx-mudo">${diaBR(p.dia)} · ${esc(p.pilar)} · gancho: ${esc(TIPO[p.conteudo.tipoGancho] || '')} ${chip(p.status)}</p>
      <h3>${esc(p.titulo)}</h3>${previa(p)}
      <button class="botao" data-copiar="${p.id}">Copiar roteiro</button></section>`).join('') : `<p class="rx-mudo">Sem roteiros: peça a pauta ao ${esc(agente('cto').nome)}.</p>`}`;
  nav.ligar();
  for (const b of el.querySelectorAll('[data-copiar]')) b.addEventListener('click', () => {
    const p = reels.find((x) => x.id === b.dataset.copiar);
    copiar(`${p.titulo}\n\nGANCHO: ${p.conteudo.gancho}\n\n${p.conteudo.roteiro.map((r) => `[${r.tempo}] ${r.fala}\n   (tela: ${r.tela})`).join('\n')}\n\nLEGENDA:\n${p.conteudo.legenda}`, b);
  });
}

// ---------------------------------------------------------------- Nina
async function salaNina(el) {
  await carregarSemana();
  const nav = navegadorSemana(() => salaNina(el));
  const pecas = estado.semana.pecas.filter((p) => p.formato !== 'reels');
  el.innerHTML = `${nav.html}
    <p class="rx-mudo">Textos dos carrosséis e stories. Edite à vontade: a ${esc(agente('imagem').nome)} desenha a arte com o que estiver salvo aqui.</p>
    ${pecas.length ? pecas.map((p) => `<details class="rx-cartao pd-peca"><summary><span>${diaBR(p.dia)} · ${FORMATO[p.formato]} · <strong>${esc(p.titulo)}</strong></span> ${chip(p.status)}</summary>
      <form data-id="${p.id}">
        ${p.conteudo.slides.map((s, i) => `<fieldset class="pd-slide-ed"><legend>Slide ${i + 1} · ${esc(s.tipo)}</legend>
          <label class="rx-campo"><span>Título</span><input name="titulo-${i}" value="${esc(s.titulo || '')}" maxlength="140"></label>
          <label class="rx-campo"><span>Texto</span><textarea name="texto-${i}" rows="3" maxlength="700">${esc(s.texto || '')}</textarea></label>
          ${s.itens ? `<label class="rx-campo"><span>Itens (um por linha)</span><textarea name="itens-${i}" rows="${s.itens.length}">${esc(s.itens.join('\n'))}</textarea></label>` : ''}
        </fieldset>`).join('')}
        <label class="rx-campo"><span>Legenda</span><textarea name="legenda" rows="7">${esc(p.conteudo.legenda || '')}</textarea></label>
        <div class="rx-filtros"><button class="botao botao-primario">Salvar textos</button><button type="button" class="botao" data-copiar="${p.id}">Copiar legenda</button></div>
      </form></details>`).join('') : `<p class="rx-mudo">Sem peças: peça a pauta ao ${esc(agente('cto').nome)}.</p>`}`;
  nav.ligar();
  for (const f of el.querySelectorAll('form[data-id]')) f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = pecas.find((x) => x.id === f.dataset.id);
    const d = Object.fromEntries(new FormData(f));
    const slides = p.conteudo.slides.map((s, i) => ({ ...s, titulo: d[`titulo-${i}`], texto: d[`texto-${i}`], ...(s.itens ? { itens: d[`itens-${i}`].split('\n').map((x) => x.trim()).filter(Boolean) } : {}) }));
    try { await salvarPeca(p.id, { slides, legenda: d.legenda }); e.submitter.textContent = 'Salvo ✓'; } catch (err) { alert(err.message); }
  });
  for (const b of el.querySelectorAll('[data-copiar]')) b.addEventListener('click', () => copiar(el.querySelector(`form[data-id="${b.dataset.copiar}"] [name=legenda]`).value, b));
}

// ---------------------------------------------------------------- Lia (artes em canvas)
const PAL = { fundo1: '#0A1D26', fundo2: '#123F3D', tinta: '#F4F8F7', tinta2: '#B9C7C7', acento: '#2CC79F', linha: '#24495A' };
const FONTE = (peso, px) => `${peso} ${px}px Sora, Manrope, "Segoe UI", system-ui, sans-serif`;
function linhas(ctx, texto, larg) {
  const out = [];
  for (const par of String(texto || '').split('\n')) {
    let atual = '';
    for (const p of par.split(/\s+/).filter(Boolean)) {
      const t = atual ? `${atual} ${p}` : p;
      if (ctx.measureText(t).width > larg && atual) { out.push(atual); atual = p; } else atual = t;
    }
    out.push(atual);
  }
  return out;
}
function bloco(ctx, texto, { x, y, larg, px, peso = 500, cor = PAL.tinta, alt = 1.35, maxY }) {
  let tam = px;
  let ls;
  for (;;) { ctx.font = FONTE(peso, tam); ls = linhas(ctx, texto, larg); if (!maxY || y + ls.length * tam * alt <= maxY || tam <= 26) break; tam -= 2; }
  ctx.fillStyle = cor;
  ls.forEach((l, i) => ctx.fillText(l, x, y + (i + 1) * tam * alt - tam * (alt - 1)));
  return y + ls.length * tam * alt;
}
function desenharSlide(canvas, s, i, total, aj) {
  const story = s.tipo === 'story';
  const W = 1080; const H = story ? 1920 : 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, PAL.fundo1); g.addColorStop(1, PAL.fundo2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PAL.linha; ctx.lineWidth = 2; ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.textBaseline = 'alphabetic';
  ctx.font = FONTE(800, 44); ctx.fillStyle = PAL.acento; ctx.fillText('Rx', 90, 140);
  const wrx = ctx.measureText('Rx ').width; ctx.fillStyle = PAL.tinta; ctx.fillText('Med', 90 + wrx, 140);
  if (total > 1) { ctx.font = FONTE(600, 32); ctx.fillStyle = PAL.tinta2; const t = `${i + 1}/${total}`; ctx.fillText(t, W - 90 - ctx.measureText(t).width, 140); }
  const X = 90; const L = W - 180; const fimUtil = H - (story ? 260 : 190);
  let y = story ? 380 : 250;
  if (s.sobre) { ctx.font = FONTE(700, 34); ctx.fillStyle = PAL.acento; y = bloco(ctx, s.sobre.toUpperCase(), { x: X, y, larg: L, px: 34, peso: 700, cor: PAL.acento }) + 30; }
  if (s.tipo === 'resposta') { ctx.fillStyle = PAL.acento; ctx.fillRect(X - 30, y, 10, Math.min(fimUtil - y, 700)); }
  if (s.titulo) y = bloco(ctx, s.titulo, { x: X, y, larg: L, px: s.tipo === 'dado' ? 120 : s.tipo === 'capa' || s.tipo === 'cta' || story ? 76 : 60, peso: 800, cor: s.tipo === 'dado' ? PAL.acento : PAL.tinta, alt: 1.15, maxY: fimUtil - 200 }) + 40;
  if (s.itens) for (const it of s.itens) y = bloco(ctx, it, { x: X, y, larg: L, px: s.itens.length > 4 ? 38 : 42, peso: 500, maxY: fimUtil }) + 22;
  if (s.texto) bloco(ctx, s.texto, { x: X, y: s.itens ? y + 10 : y, larg: L, px: s.tipo === 'capa' ? 40 : 44, peso: s.tipo === 'capa' ? 600 : 500, cor: s.tipo === 'capa' || s.itens ? PAL.tinta2 : PAL.tinta, maxY: fimUtil });
  if (s.rodape) { ctx.font = FONTE(700, 34); const w = ctx.measureText(s.rodape).width + 60; ctx.fillStyle = PAL.acento; ctx.beginPath(); ctx.roundRect(X, H - (story ? 330 : 260), w, 70, 35); ctx.fill(); ctx.fillStyle = PAL.fundo1; ctx.fillText(s.rodape, X + 30, H - (story ? 330 : 260) + 47); }
  ctx.font = FONTE(600, 30); ctx.fillStyle = PAL.tinta2; ctx.fillText(aj.instagram || '', X, H - 90);
  if (i < total - 1) { const t = 'arraste →'; ctx.fillText(t, W - 90 - ctx.measureText(t).width, H - 90); }
}
async function salaLia(el) {
  await carregarSemana();
  const nav = navegadorSemana(() => salaLia(el));
  const pecas = estado.semana.pecas.filter((p) => p.formato !== 'reels' && p.status !== 'descartada');
  if (!pecas.some((p) => p.id === estado.selecionada)) estado.selecionada = pecas[0]?.id || null;
  const p = pecas.find((x) => x.id === estado.selecionada);
  el.innerHTML = `${nav.html}
    <p class="rx-mudo">Artes no padrão da marca: carrossel 1080×1350 e story 1080×1920, prontas para o Instagram. O texto vem da ${esc(agente('copy_imagem').nome)}.</p>
    ${pecas.length ? `<label class="rx-campo" style="max-width:560px"><span>Peça</span><select id="peca">${pecas.map((x) => `<option value="${x.id}" ${x.id === estado.selecionada ? 'selected' : ''}>${diaBR(x.dia)} · ${FORMATO[x.formato]} · ${esc(x.titulo)} (${STATUS[x.status]})</option>`).join('')}</select></label>
      <div class="rx-filtros"><button class="botao botao-primario" id="baixar-todas">Baixar todas as artes (PNG)</button></div>
      <div class="pd-artes" id="artes"></div>` : `<p class="rx-mudo">Sem peças para desenhar nesta semana.</p>`}`;
  nav.ligar();
  if (!p) return;
  $('#peca').addEventListener('change', (e) => { estado.selecionada = e.target.value; salaLia(el); });
  if (document.fonts?.ready) await document.fonts.ready;
  const box = $('#artes');
  const canvases = p.conteudo.slides.map((s, i) => {
    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    desenharSlide(c, s, i, p.conteudo.slides.length, estado.dados.ajustes);
    const b = document.createElement('button'); b.className = 'botao'; b.textContent = `Baixar ${i + 1}`;
    b.addEventListener('click', () => baixar(c, `${p.dia}-${p.slot}-${i + 1}.png`));
    fig.append(c, b); box.append(fig);
    return c;
  });
  $('#baixar-todas').addEventListener('click', async () => {
    for (const [i, c] of canvases.entries()) { baixar(c, `${p.dia}-${p.slot}-${i + 1}.png`); await new Promise((r) => setTimeout(r, 400)); }
  });
}
function baixar(canvas, nome) {
  canvas.toBlob((blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
}

// ---------------------------------------------------------------- Renan
async function salaRenan(el) {
  await carregarSemana();
  const nav = navegadorSemana(() => salaRenan(el));
  const pecas = estado.semana.pecas.filter((p) => p.status !== 'descartada');
  const M = [['alcance', 'Alcance'], ['curtidas', 'Curtidas'], ['comentarios', 'Comentários'], ['salvos', 'Salvos'], ['compartilhamentos', 'Compart.'], ['visitas_perfil', 'Visitas ao perfil']];
  el.innerHTML = `${nav.html}
    <p class="rx-mudo">Calendário de publicação. Publique as aprovadas no horário, cole o link do post e, 2 dias depois, anote as métricas
      (o ${esc(agente('copy_video').nome)} aprende com elas). Horários em Ajustes, na Recepção.</p>
    ${pecas.length ? pecas.map((p) => `<section class="rx-cartao pd-peca"><div class="pd-linha"><span>${diaBR(p.dia)} · <input class="pd-hora" data-hora="${p.id}" value="${esc(p.horario || '')}" size="5"> · ${FORMATO[p.formato]} · <strong>${esc(p.titulo)}</strong></span> ${chip(p.status)}</div>
      <div class="rx-filtros"><button class="botao" data-leg="${p.id}">Copiar legenda</button>
        ${p.formato !== 'reels' ? `<button class="botao" data-artes="${p.id}">Artes da ${esc(agente('imagem').nome)}</button>` : ''}
        ${p.status === 'rascunho' ? '<span class="rx-mudo">aguardando aprovação</span>' : ''}</div>
      ${p.status === 'aprovada' || p.status === 'postada' ? `<form class="rx-filtros" data-id="${p.id}">
        <label class="rx-campo" style="flex:1;min-width:220px"><span>Link do post</span><input name="link" value="${esc(p.link || '')}" placeholder="https://www.instagram.com/p/..."></label>
        ${p.status === 'postada' ? M.map(([k, r]) => `<label class="rx-campo" style="max-width:120px"><span>${r}</span><input name="${k}" type="number" min="0" value="${p.metricas?.[k] ?? ''}"></label>`).join('') : ''}
        <button class="botao botao-primario">${p.status === 'postada' ? 'Salvar métricas' : 'Marcar como postada'}</button></form>` : ''}
    </section>`).join('') : '<p class="rx-mudo">Nada no calendário desta semana.</p>'}`;
  nav.ligar();
  for (const b of el.querySelectorAll('[data-leg]')) b.addEventListener('click', () => copiar(pecas.find((x) => x.id === b.dataset.leg).conteudo.legenda || '', b));
  for (const b of el.querySelectorAll('[data-artes]')) b.addEventListener('click', () => { estado.selecionada = b.dataset.artes; abrirSala('imagem'); });
  for (const i of el.querySelectorAll('[data-hora]')) i.addEventListener('change', async () => { try { await salvarPeca(i.dataset.hora, { horario: i.value }); } catch (err) { alert(err.message); } });
  for (const f of el.querySelectorAll('form[data-id]')) f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = pecas.find((x) => x.id === f.dataset.id);
    const d = Object.fromEntries(new FormData(f));
    const corpo = p.status === 'postada' ? { link: d.link, metricas: Object.fromEntries(M.map(([k]) => [k, d[k]])) } : { link: d.link, status: 'postada' };
    try { await salvarPeca(p.id, corpo); salaRenan(el); } catch (err) { alert(err.message); }
  });
}

// ---------------------------------------------------------------- Sofia
async function salaSofia(el) {
  const { respostas } = await api('/admin/predio/sofia');
  el.innerHTML = `<p class="rx-mudo">Respostas prontas para o direct e o WhatsApp, com os preços e as regras reais da plataforma (atualizam sozinhas quando os planos mudam).
    Copie, ajuste o tom se quiser e envie.</p>
    ${respostas.map((r, i) => `<section class="rx-cartao"><h3 style="margin-top:0">${esc(r.pergunta)}</h3><p class="rx-mudo pequeno">Quando a pessoa fala: ${esc(r.chave)}</p>
      <p style="white-space:pre-line">${esc(r.resposta)}</p><button class="botao" data-i="${i}">Copiar resposta</button></section>`).join('')}`;
  for (const b of el.querySelectorAll('[data-i]')) b.addEventListener('click', () => copiar(respostas[b.dataset.i].resposta, b));
}

// ---------------------------------------------------------------- Otávio
async function salaOtavio(el) {
  const f = await api('/admin/predio/financeiro');
  const varia = f.anterior.receita ? Math.round((100 * (f.mes.receita - f.anterior.receita)) / f.anterior.receita) : null;
  el.innerHTML = `<div class="pd-kpis">
      <div class="rx-kpi"><span>Receita do mês</span><strong>${reais(f.mes.receita)}</strong><small class="rx-mudo">${varia == null ? '' : `${varia >= 0 ? '+' : ''}${varia}% vs. mês passado`}</small></div>
      <div class="rx-kpi"><span>Vendas do mês</span><strong>${f.mes.vendas}</strong></div>
      <div class="rx-kpi"><span>Ticket médio</span><strong>${reais(f.mes.ticket)}</strong></div>
      <div class="rx-kpi"><span>Reembolsos 30 dias</span><strong>${f.reembolsos30d.n}</strong><small class="rx-mudo">${reais(f.reembolsos30d.valor)}</small></div></div>
    <h2>Planos que mais vendem (90 dias)</h2>
    <table class="rx-tabela"><thead><tr><th>Plano</th><th>Vendas</th><th>Receita</th></tr></thead><tbody>
      ${f.porPlano.map((p) => `<tr><td>${esc(p.plano)}</td><td>${p.vendas}</td><td>${reais(p.receita)}</td></tr>`).join('') || '<tr><td colspan="3" class="rx-mudo">Sem vendas no período.</td></tr>'}</tbody></table>
    <p class="rx-mudo">Detalhes por dia e por forma de pagamento estão no Painel.</p>`;
}

// ---------------------------------------------------------------- Jade
async function salaJade(el) {
  const j = await api('/admin/predio/jade');
  const ST = { nao_contatado: 'Não contatadas', pesquisada: 'Pesquisadas', contato_feito: 'Contato feito', reuniao_agendada: 'Reunião agendada', visitada: 'Visitadas', proposta_enviada: 'Proposta enviada', parceria: 'Parcerias', sem_interesse: 'Sem interesse' };
  el.innerHTML = `<p class="rx-mudo">Parcerias com coordenações de Medicina (relatório da turma, simulado nacional, cupom da faculdade). A ficha completa de cada escola fica na aba Faculdades.</p>
    <div class="pd-kpis">${Object.entries(j.porStatus).map(([k, v]) => `<div class="rx-kpi"><span>${ST[k] || k}</span><strong>${v}</strong></div>`).join('') || '<p class="rx-mudo">Nenhuma escola acompanhada ainda.</p>'}</div>
    <h2>Próximos contatos</h2>
    <table class="rx-tabela"><thead><tr><th>Data</th><th>Escola (código)</th><th>Contato</th><th>Próxima ação</th></tr></thead><tbody>
      ${j.proximos.map((x) => `<tr><td>${data(x.proxima_data)}</td><td>${x.curso_id}</td><td>${esc(x.contato_nome || '—')}</td><td>${esc(x.proxima_acao || '—')}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Sem contatos agendados.</td></tr>'}</tbody></table>
    <a class="botao" href="#faculdades">Abrir Faculdades</a>`;
}

// ---------------------------------------------------------------- Clara (ajustes)
async function salaClara(el) {
  const aj = estado.dados.ajustes;
  const eq = estado.dados.equipe;
  const provas = [...(aj.provas || []), { nome: '', data: '' }, { nome: '', data: '' }].slice(0, Math.max(2, (aj.provas || []).length + 1));
  el.innerHTML = `<p class="rx-mudo">Seja bem-vindo! Aqui ficam os ajustes do Prédio: nomes do time, perfil, chamada e as datas das provas (usadas na contagem regressiva).</p>
    <form id="aj">
      <h3>Marca</h3><div class="rx-filtros">
        <label class="rx-campo"><span>Instagram</span><input name="instagram" value="${esc(aj.instagram || '')}" placeholder="@rxmed"></label>
        <label class="rx-campo"><span>Site (aparece nas artes)</span><input name="site" value="${esc(aj.site || '')}" placeholder="rxmed.com.br"></label>
        <label class="rx-campo"><span>Palavra-chave da chamada</span><input name="palavraChave" value="${esc(aj.palavraChave || '')}" maxlength="20"></label></div>
      <h3>Provas</h3>${provas.map((p, i) => `<div class="rx-filtros"><label class="rx-campo"><span>Prova</span><input name="pnome-${i}" value="${esc(p.nome)}" placeholder="ENAMED 2027"></label>
        <label class="rx-campo"><span>Data</span><input type="date" name="pdata-${i}" value="${esc(p.data)}"></label></div>`).join('')}
      <h3>Horários (Brasília)</h3><div class="rx-filtros">
        <label class="rx-campo"><span>Feed (separados por vírgula)</span><input name="feed" value="${esc((aj.horarios?.feed || []).join(', '))}"></label>
        <label class="rx-campo"><span>Stories</span><input name="stories" value="${esc((aj.horarios?.stories || []).join(', '))}"></label></div>
      <h3>Nomes do time</h3><div class="rx-filtros">${eq.map((a) => `<label class="rx-campo" style="max-width:180px"><span>${esc(a.papel)}</span><input name="nome-${a.id}" value="${esc(a.nome)}" maxlength="20"></label>`).join('')}</div>
      <button class="botao botao-primario">Salvar ajustes</button>
    </form>`;
  $('#aj').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const lista = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
    const corpo = { instagram: d.instagram, site: d.site, palavraChave: d.palavraChave,
      provas: provas.map((_, i) => ({ nome: d[`pnome-${i}`], data: d[`pdata-${i}`] })).filter((p) => p.nome && p.data),
      horarios: { feed: lista(d.feed), stories: lista(d.stories) },
      nomes: Object.fromEntries(eq.map((a) => [a.id, d[`nome-${a.id}`]])) };
    try { await api('/admin/predio/ajustes', { metodo: 'PUT', corpo }); await carregar(); } catch (err) { alert(err.message); }
  });
}
