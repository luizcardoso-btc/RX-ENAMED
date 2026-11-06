// Aba "Eventos" do admin: congressos e feiras para estande, apresentações, e a prospecção das faculdades de Medicina do Paraguai.
import { $, api, data, dataHora, esc, reais } from './comum.js';
import { STATUS as STATUS_FAC } from './faculdades.js';

const STATUS = {
  ideia: { nome: 'Ideia', cor: '#8FA3A8' },
  pesquisado: { nome: 'Pesquisado', cor: '#6aa8f0' },
  pedido_proposta: { nome: 'Pedi proposta', cor: '#e0a52a' },
  proposta_recebida: { nome: 'Proposta recebida', cor: '#d95926' },
  fechado: { nome: 'Estande fechado', cor: '#34d399' },
  realizado: { nome: 'Realizado', cor: '#8b7cf6' },
  descartado: { nome: 'Descartado', cor: '#f87171' },
};
const TIPOS = { congresso: 'Congresso', feira: 'Feira', academico: 'Evento acadêmico', apresentacao: 'Apresentação', outro: 'Outro' };
const PUBLICOS = { ambos: 'ENAMED e Revalida', enamed: 'ENAMED', revalida: 'Revalida', faculdades: 'Faculdades (parcerias)' };
const PRIORIDADE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const CONTATOS = { email: 'E-mail', ligacao: 'Ligação', whatsapp: 'WhatsApp', reuniao: 'Reunião', visita: 'Visita', proposta: 'Proposta', outro: 'Outro' };
const COR_PY = '#f5b942';
const hoje = () => new Date().toISOString().slice(0, 10);
const iso = (d) => (d ? String(d).slice(0, 10) : '');
const statusUni = (u) => u.crm?.status || 'nao_contatado';
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const quando = (e) => (e.inicio ? `${data(e.inicio)}${e.fim && iso(e.fim) !== iso(e.inicio) ? ` a ${data(e.fim)}` : ''}` : esc(e.data_texto || 'a definir'));

let dados = null;
let mapa = null;
let camadaEventos = null;
let camadaPy = null;

function carregarLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((ok, falha) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/_rx/leaflet/leaflet.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = '/_rx/leaflet/leaflet.js'; s.onload = ok; s.onerror = () => falha(new Error('Não foi possível carregar o mapa.'));
    document.head.append(s);
  });
}

export async function eventos(conteudo, abrirGaveta, fecharGaveta) {
  dados = await api('/admin/eventos');
  const recarregar = () => eventos(conteudo, abrirGaveta, fecharGaveta);
  const { eventos: lista, paraguai } = dados;
  const ativos = lista.filter((e) => e.status !== 'descartado');
  const proximos = ativos.filter((e) => !e.inicio || iso(e.fim || e.inicio) >= hoje()).filter((e) => e.status !== 'realizado');
  const fechados = lista.filter((e) => e.status === 'fechado');
  const custo = lista.filter((e) => ['fechado', 'realizado'].includes(e.status)).reduce((s, e) => s + (e.custo_centavos || 0), 0);
  const unis = paraguai.universidades;
  const unisAndamento = unis.filter((u) => !['nao_contatado', 'sem_interesse'].includes(statusUni(u))).length;
  const atrasadas = [...lista.filter((e) => !['realizado', 'descartado'].includes(e.status)), ...unis.map((u) => u.crm || {}).filter((c) => !['parceria', 'sem_interesse'].includes(c.status))]
    .filter((x) => x.proxima_data && iso(x.proxima_data) < hoje()).length;

  conteudo.innerHTML = `
    <div class="fac-cabecalho"><div><h1 style="font-family:var(--f-display);margin-bottom:4px">Eventos e Paraguai</h1>
      <p class="rx-mudo pequeno">Congressos e feiras para estande, apresentações nas faculdades e a prospecção do Rx Med Revalida no Paraguai.</p></div>
      <div class="rx-linha"><button class="botao" id="ev-plano">Plano Paraguai</button><button class="botao botao-primario" id="ev-novo">Novo evento</button></div></div>
    <section class="rx-cartao fac-guia rx-oculto" id="ev-guia">${GUIA_PARAGUAI}</section>
    <div class="rx-kpis">
      <div class="rx-kpi"><span>Próximos eventos</span><strong>${proximos.length}</strong><small>${proximos.filter((e) => e.prioridade === 'alta').length} com prioridade alta</small></div>
      <div class="rx-kpi"><span>Estandes fechados</span><strong>${fechados.length}</strong><small>${reais(custo)} comprometidos</small></div>
      <div class="rx-kpi"><span>Faculdades no Paraguai</span><strong>${unis.length}</strong><small>${unisAndamento} em andamento · ${unis.filter((u) => statusUni(u) === 'parceria').length} parcerias</small></div>
      <div class="rx-kpi"><span>Brasileiros no Paraguai</span><strong>35–45 mil</strong><small>estudando Medicina (estimativa)</small></div>
      <div class="rx-kpi"><span>Ações atrasadas</span><strong${atrasadas ? ' style="color:var(--aviso)"' : ''}>${atrasadas}</strong><small>próxima ação vencida</small></div>
    </div>
    <div class="fac-mapa-caixa rx-cartao"><div id="ev-mapa" role="region" aria-label="Mapa de eventos e faculdades do Paraguai"></div>
      <div class="fac-legenda">
        <label><input type="checkbox" id="ev-ver-eventos" checked> Eventos</label>
        <label><input type="checkbox" id="ev-ver-py" checked> Faculdades do Paraguai</label>
        <button class="botao botao-pequeno" type="button" id="ev-zoom-py">Ver Paraguai</button>
        <button class="botao botao-pequeno" type="button" id="ev-zoom-br">Ver Brasil</button>
        ${Object.values(STATUS).map((v) => `<span><i style="background:${v.cor}"></i>${v.nome}</span>`).join('')}
        <span><i style="background:${COR_PY};border-radius:2px"></i>Faculdade no Paraguai</span><span><i style="background:#fff;box-shadow:0 0 0 2px ${COR_PY}"></i>UMS · porta de entrada</span>
      </div></div>

    <h2 style="margin-top:28px">Eventos</h2>
    <form class="rx-filtros" id="ev-filtro">
      <label class="rx-campo" style="min-width:220px"><span>Buscar</span><input name="busca" placeholder="evento, cidade ou local"></label>
      <label class="rx-campo"><span>Status</span><select name="status"><option value="">Todos (menos descartados)</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v.nome} (${lista.filter((e) => e.status === k).length})</option>`).join('')}</select></label>
      <label class="rx-campo"><span>Público</span><select name="publico"><option value="">Todos</option>${Object.entries(PUBLICOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="rx-campo"><span>País</span><select name="pais"><option value="">Todos</option>${[...new Set(lista.map((e) => e.pais))].map((p) => `<option>${esc(p)}</option>`).join('')}</select></label>
    </form>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Quando</th><th>Evento</th><th>Onde</th><th>Público</th><th>Status</th><th>Custo</th><th>Próxima ação</th></tr></thead><tbody id="ev-lista"></tbody></table></div>

    <h2 style="margin-top:28px">Paraguai</h2>
    <p class="rx-mudo pequeno">Lista montada com reportagens e páginas das universidades (atualizada em ${data(paraguai.atualizado)}). Itens marcados com "confirmar" precisam ser checados. Para corrigir ou incluir faculdades, edite <code>conteudo/paraguai/paraguai.json</code>.</p>
    <div class="ev-numeros">${paraguai.estatisticas.map((s) => `<div class="rx-cartao"><span class="rx-mudo pequeno">${esc(s.titulo)}</span><strong>${esc(s.valor)}</strong><small class="rx-mudo">${esc(s.detalhe)}</small>${s.fonte ? `<a class="pequeno" href="${esc(s.fonte)}" target="_blank" rel="noopener">fonte</a>` : ''}</div>`).join('')}</div>
    <div class="rx-cartao rx-rolagem" style="margin-top:12px"><table class="rx-tabela"><thead><tr><th>Universidade</th><th>Cidades com Medicina</th><th>Gestão</th><th>Aprovados no Revalida</th><th>Brasileiros</th><th>Status</th><th>Próxima ação</th></tr></thead><tbody id="py-lista"></tbody></table></div>`;

  $('#ev-plano').addEventListener('click', () => $('#ev-guia').classList.toggle('rx-oculto'));
  for (const b of conteudo.querySelectorAll('[data-copiar]')) b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(`#${b.dataset.copiar}`).innerText); b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar texto'; }, 1500); } catch { /* sem área de transferência */ }
  });
  const abrirEvento = (id) => formularioEvento(id, abrirGaveta, fecharGaveta, recarregar);
  const abrirUni = (id) => detalheUniversidade(id, abrirGaveta, fecharGaveta, recarregar);
  $('#ev-novo').addEventListener('click', () => abrirEvento(null));

  // Tabela de eventos com filtros.
  const form = $('#ev-filtro');
  const desenharEventos = () => {
    const f = Object.fromEntries(new FormData(form));
    const b = norm(f.busca);
    const vis = lista.filter((e) => (f.status ? e.status === f.status : e.status !== 'descartado') && (!f.publico || e.publico === f.publico) && (!f.pais || e.pais === f.pais)
      && (!b || norm(`${e.nome} ${e.cidade} ${e.local}`).includes(b)));
    $('#ev-lista').innerHTML = vis.map((e) => `<tr class="clicavel" data-evento="${e.id}">
      <td style="white-space:nowrap">${quando(e)}</td>
      <td><strong>${esc(e.nome)}</strong><br><span class="rx-mudo pequeno">${TIPOS[e.tipo]}${e.prioridade === 'alta' ? ' · prioridade alta' : ''}</span></td>
      <td>${esc(e.cidade || '—')}${e.pais && e.pais !== 'Brasil' ? ` · ${esc(e.pais)}` : ''}${e.local ? `<br><span class="rx-mudo pequeno">${esc(e.local)}</span>` : ''}</td>
      <td>${PUBLICOS[e.publico]}</td>
      <td><span class="fac-status" style="--c:${STATUS[e.status].cor}">${STATUS[e.status].nome}</span></td>
      <td>${e.custo_centavos != null ? reais(e.custo_centavos) : '<span class="rx-mudo">—</span>'}</td>
      <td>${e.proxima_acao ? `${esc(e.proxima_acao)}${e.proxima_data ? ` <span class="${iso(e.proxima_data) < hoje() ? 'fac-atrasada' : 'rx-mudo'}">${data(e.proxima_data)}</span>` : ''}` : '<span class="rx-mudo">—</span>'}</td></tr>`).join('')
      || '<tr><td colspan="7" class="rx-mudo">Nenhum evento no filtro.</td></tr>';
    for (const tr of conteudo.querySelectorAll('tr[data-evento]')) tr.addEventListener('click', () => abrirEvento(tr.dataset.evento));
    desenharMapa(vis);
  };
  form.addEventListener('input', desenharEventos);
  form.addEventListener('submit', (e) => e.preventDefault());

  // Tabela do Paraguai: porta de entrada primeiro, depois prioridade e aprovados no Revalida.
  const peso = { alta: 0, media: 1, baixa: 2 };
  const ordenadas = [...unis].sort((a, b) => (b.portaDeEntrada ? 1 : 0) - (a.portaDeEntrada ? 1 : 0) || peso[a.crm?.prioridade || 'media'] - peso[b.crm?.prioridade || 'media'] || (b.revalida?.aprovados || 0) - (a.revalida?.aprovados || 0));
  $('#py-lista').innerHTML = ordenadas.map((u) => `<tr class="clicavel${u.portaDeEntrada ? ' ev-porta' : ''}" data-uni="${u.id}">
    <td><strong>${esc(u.sigla)}</strong> <span class="rx-mudo">${esc(u.nome)}</span>${u.portaDeEntrada ? ' <span class="ev-selo">porta de entrada</span>' : ''}${u.confirmar ? ' <span class="ev-confirmar">confirmar</span>' : ''}</td>
    <td>${u.sedes.map(esc).join(', ')}</td><td>${esc(u.gestao)}</td>
    <td>${u.revalida ? `${u.revalida.aprovados.toLocaleString('pt-BR')} <span class="rx-mudo pequeno">(${esc(u.revalida.edicao)})</span>` : '<span class="rx-mudo">—</span>'}</td>
    <td>${u.crm?.alunos_brasileiros != null ? u.crm.alunos_brasileiros.toLocaleString('pt-BR') : '<span class="rx-mudo">—</span>'}</td>
    <td><span class="fac-status" style="--c:${STATUS_FAC[statusUni(u)].cor}">${STATUS_FAC[statusUni(u)].nome}</span></td>
    <td>${u.crm?.proxima_acao ? `${esc(u.crm.proxima_acao)}${u.crm.proxima_data ? ` <span class="${iso(u.crm.proxima_data) < hoje() ? 'fac-atrasada' : 'rx-mudo'}">${data(u.crm.proxima_data)}</span>` : ''}` : '<span class="rx-mudo">—</span>'}</td></tr>`).join('');
  for (const tr of conteudo.querySelectorAll('tr[data-uni]')) tr.addEventListener('click', () => abrirUni(tr.dataset.uni));

  function desenharMapa(vis) {
    if (!camadaEventos) return;
    camadaEventos.clearLayers();
    camadaPy.clearLayers();
    for (const e of vis.filter((x) => x.lat != null)) {
      L.circleMarker([e.lat, e.lng], { radius: e.prioridade === 'alta' ? 10 : 7, color: '#0A1D26', weight: 1.5, fillColor: STATUS[e.status].cor, fillOpacity: 0.9 })
        .bindTooltip(`<strong>${esc(e.nome)}</strong><br>${quando(e)} · ${esc(e.cidade || '')}<br>${STATUS[e.status].nome}`)
        .on('click', () => abrirEvento(e.id)).addTo(camadaEventos);
    }
    // Faculdades do Paraguai: um ponto por sede, em círculo em volta do centro da cidade.
    const porCidade = {};
    for (const u of unis) for (const c of u.sedes) (porCidade[c] ||= []).push(u);
    for (const [cidade, grupo] of Object.entries(porCidade)) {
      const centro = paraguai.cidades[cidade];
      if (!centro) continue;
      grupo.forEach((u, i) => {
        const n = grupo.length;
        const ang = (2 * Math.PI * i) / n;
        const raio = n > 1 ? 0.05 + 0.008 * n : 0;
        const pos = [centro.lat + raio * Math.sin(ang), centro.lng + raio * Math.cos(ang)];
        const st = STATUS_FAC[statusUni(u)];
        const m = L.circleMarker(pos, u.portaDeEntrada
          ? { radius: 11, color: COR_PY, weight: 4, fillColor: '#ffffff', fillOpacity: 1 }
          : { radius: 7, color: COR_PY, weight: 2.5, fillColor: st.cor, fillOpacity: 0.9 })
          .bindTooltip(`<strong>${esc(u.sigla)}</strong> · ${esc(u.nome)}<br>${esc(cidade)} (${esc(centro.departamento)})${u.revalida ? `<br>${u.revalida.aprovados} aprovados no Revalida ${esc(u.revalida.edicao)}` : ''}<br>${st.nome}`, u.portaDeEntrada && cidade === u.sedes[0] ? { permanent: true, direction: 'top', offset: [0, -10] } : {})
          .on('click', () => abrirUni(u.id));
        m.addTo(camadaPy);
      });
    }
    if (!$('#ev-ver-eventos').checked) mapa.removeLayer(camadaEventos); else camadaEventos.addTo(mapa);
    if (!$('#ev-ver-py').checked) mapa.removeLayer(camadaPy); else camadaPy.addTo(mapa);
  }

  try {
    await carregarLeaflet();
    mapa = L.map('ev-mapa', { scrollWheelZoom: false }).setView([-20, -52], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mapa);
    camadaEventos = L.layerGroup().addTo(mapa);
    camadaPy = L.layerGroup().addTo(mapa);
    $('#ev-ver-eventos').addEventListener('change', desenharEventos);
    $('#ev-ver-py').addEventListener('change', desenharEventos);
    $('#ev-zoom-py').addEventListener('click', () => mapa.fitBounds([[-27.6, -62.6], [-19.3, -54.2]]));
    $('#ev-zoom-br').addEventListener('click', () => mapa.setView([-20, -52], 4));
  } catch (e) {
    $('#ev-mapa').innerHTML = `<p class="rx-erro" style="padding:16px">${esc(e.message)}</p>`;
  }
  desenharEventos();
}

const historico = (interacoes) => `<ul class="fac-historico">${interacoes.map((i) => `<li><span class="rx-mudo pequeno">${dataHora(i.em)} · ${CONTATOS[i.tipo]}${i.admin ? ` · ${esc(i.admin)}` : ''}</span><br>${esc(i.texto)}</li>`).join('') || '<li class="rx-mudo">Nenhum contato registrado.</li>'}</ul>`;
const formInteracao = `<form id="ev-interacao" class="rx-linha" style="align-items:end">
  <label class="rx-campo" style="max-width:140px"><span>Tipo</span><select name="tipo">${Object.entries(CONTATOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  <label class="rx-campo" style="flex:1"><span>O que aconteceu</span><input name="texto" placeholder="Ex.: pedi o kit de patrocínio ao comercial"></label>
  <button class="botao">Registrar</button></form>`;
const opcoes = (mapaOpcoes, atual) => Object.entries(mapaOpcoes).map(([k, v]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${typeof v === 'string' ? v : v.nome}</option>`).join('');

async function formularioEvento(id, abrirGaveta, fecharGaveta, recarregar) {
  const { evento: e, interacoes } = id ? await api(`/admin/eventos/${id}`) : { evento: {}, interacoes: [] };
  const campo = (nome, rotulo, extra = '', largo = false) => `<label class="rx-campo${largo ? ' fac-largo' : ''}"><span>${rotulo}</span><input name="${nome}" value="${esc(e[nome] ?? '')}" ${extra}></label>`;
  abrirGaveta(`<aside class="rx-gaveta" role="dialog" aria-label="Evento">
    <button class="botao" id="fechar" style="float:right">Fechar</button>
    <p class="rx-mudo pequeno" style="margin:0">${id ? `${TIPOS[e.tipo]} · ${PUBLICOS[e.publico]}` : 'Novo evento'}</p>
    <h2>${id ? esc(e.nome) : 'Cadastrar evento'}</h2>
    ${id ? `<p class="rx-mudo">${quando(e)} · ${esc(e.cidade || '')}${e.local ? ` · ${esc(e.local)}` : ''}</p>
      <p>${e.site ? `<a href="${esc(e.site)}" target="_blank" rel="noopener">Site do evento</a> · ` : ''}<a href="https://www.google.com/search?q=${encodeURIComponent(`${e.nome} patrocínio estande expositor`)}" target="_blank" rel="noopener">Procurar o comercial</a>${e.fonte ? ` · <a href="${esc(e.fonte)}" target="_blank" rel="noopener">fonte da data</a>` : ''}</p>` : ''}
    <form id="ev-form" class="fac-form">
      ${campo('nome', 'Nome do evento', 'required minlength="3"', true)}
      <label class="rx-campo"><span>Tipo</span><select name="tipo">${opcoes(TIPOS, e.tipo || 'congresso')}</select></label>
      <label class="rx-campo"><span>Público</span><select name="publico">${opcoes(PUBLICOS, e.publico || 'ambos')}</select></label>
      <label class="rx-campo"><span>Início</span><input type="date" name="inicio" value="${iso(e.inicio)}"></label>
      <label class="rx-campo"><span>Fim</span><input type="date" name="fim" value="${iso(e.fim)}"></label>
      ${campo('data_texto', 'Data em texto (se ainda não confirmada)', 'placeholder="Ex.: setembro, a confirmar"', true)}
      ${campo('cidade', 'Cidade')}${campo('pais', 'País', 'placeholder="Brasil"')}
      ${campo('local', 'Local', 'placeholder="Centro de convenções"', true)}
      ${campo('lat', 'Latitude', 'placeholder="-25.2637"')}${campo('lng', 'Longitude', 'placeholder="-57.5759"')}
      <p class="rx-mudo pequeno fac-largo" style="margin:-4px 0 8px">Para o mapa: no Google Maps, clique com o botão direito no local e copie as coordenadas.</p>
      ${campo('site', 'Site', 'placeholder="https://"', true)}
      <label class="rx-campo"><span>Status</span><select name="status">${opcoes(STATUS, e.status || 'ideia')}</select></label>
      <label class="rx-campo"><span>Prioridade</span><select name="prioridade">${opcoes(PRIORIDADE, e.prioridade || 'media')}</select></label>
      <label class="rx-campo"><span>Custo do estande (R$)</span><input name="custo" inputmode="decimal" value="${e.custo_centavos != null ? (e.custo_centavos / 100).toLocaleString('pt-BR') : ''}" placeholder="Ex.: 8.500"></label>
      ${campo('publico_estimado', 'Público estimado', 'inputmode="numeric"')}
      ${campo('contato_nome', 'Contato comercial')}${campo('contato_telefone', 'Telefone')}
      ${campo('contato_email', 'E-mail', 'type="email"', true)}
      ${campo('proxima_acao', 'Próxima ação', 'placeholder="Ex.: pedir o kit de patrocínio"', true)}
      <label class="rx-campo"><span>Data da próxima ação</span><input type="date" name="proxima_data" value="${iso(e.proxima_data)}"></label>
      ${campo('fonte', 'Fonte da informação')}
      <label class="rx-campo fac-largo"><span>Notas</span><textarea name="notas" rows="4">${esc(e.notas || '')}</textarea></label>
      <p class="rx-erro rx-oculto fac-largo" id="ev-erro"></p>
      <button class="botao botao-primario fac-largo">${id ? 'Salvar evento' : 'Cadastrar evento'}</button>
    </form>
    ${id ? `${e.atualizado_em ? `<p class="rx-mudo pequeno">Atualizado em ${dataHora(e.atualizado_em)}</p>` : ''}
      <h3>Histórico de contatos</h3>${formInteracao}${historico(interacoes)}
      <p style="margin-top:24px"><button class="botao" id="ev-remover" type="button">Remover evento</button></p>` : ''}
  </aside>`);
  $('#fechar').addEventListener('click', fecharGaveta);
  $('#ev-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const corpo = Object.fromEntries(new FormData(ev.target));
    // Custo digitado em reais ("8.500" ou "8500,50") vira centavos.
    const custo = String(corpo.custo || '').trim();
    delete corpo.custo;
    corpo.custo_centavos = custo ? Math.round(Number(custo.replace(/\./g, '').replace(',', '.')) * 100) : '';
    if (custo && !Number.isFinite(corpo.custo_centavos)) corpo.custo_centavos = 'x';
    try {
      await api(id ? `/admin/eventos/${id}` : '/admin/eventos', { metodo: id ? 'PUT' : 'POST', corpo });
      fecharGaveta(); recarregar();
    } catch (err) { const el = $('#ev-erro'); el.textContent = err.message; el.classList.remove('rx-oculto'); }
  });
  if (!id) return;
  $('#ev-interacao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api(`/admin/eventos/${id}/interacoes`, { metodo: 'POST', corpo: Object.fromEntries(new FormData(ev.target)) }); formularioEvento(id, abrirGaveta, fecharGaveta, recarregar); } catch (err) { alert(err.message); }
  });
  $('#ev-remover').addEventListener('click', async () => {
    if (!confirm(`Remover "${e.nome}" e o histórico de contatos?`)) return;
    try { await api(`/admin/eventos/${id}`, { metodo: 'DELETE', corpo: {} }); fecharGaveta(); recarregar(); } catch (err) { alert(err.message); }
  });
}

function abordagemUniversidade(u) {
  const base = [
    'Fale com a coordenação da carreira de Medicina e com o centro de estudantes (muitos têm diretoria de alunos brasileiros).',
    'Ofereça uma palestra gratuita sobre o Revalida (1ª e 2ª etapa) para os últimos semestres, com uma estação da 2ª etapa ao vivo.',
    'Proponha um simulado diagnóstico da 1ª etapa sem custo e um relatório por área para a coordenação.',
    'Crie um cupom da faculdade (aba Cupons); a associação de estudantes pode ser afiliada e receber comissão.',
    'Argumento: a plataforma tem interface, aulas e flashcards em espanhol, e as questões e estações em português, como na prova.',
  ];
  if (u.portaDeEntrada) base.unshift('Você é ex-aluno: comece pelos professores e pela coordenação que conhece e peça uma data para apresentar aos alunos do internato.');
  if (u.gestao === 'Pública') base.push('Pública: acordo de cooperação sem custo para a universidade, com desconto direto ao aluno.');
  if (u.revalida?.aprovados) base.push(`Muitos egressos fazem o Revalida (${u.revalida.aprovados} aprovados em ${u.revalida.edicao}): mostre como a Rx Med ajuda a aumentar esse número.`);
  return base;
}

async function detalheUniversidade(id, abrirGaveta, fecharGaveta, recarregar) {
  const { universidade: u, crm, interacoes } = await api(`/admin/paraguai/${id}`);
  const c = crm || {};
  abrirGaveta(`<aside class="rx-gaveta" role="dialog" aria-label="Universidade">
    <button class="botao" id="fechar" style="float:right">Fechar</button>
    <p class="rx-mudo pequeno" style="margin:0">${esc(u.gestao)} · Paraguai${u.portaDeEntrada ? ' · <span class="ev-selo">porta de entrada</span>' : ''}${u.confirmar ? ' · <span class="ev-confirmar">confirmar dados</span>' : ''}</p>
    <h2>${esc(u.nome)} <small class="rx-mudo">${esc(u.sigla)}</small></h2>
    <p class="rx-mudo">Medicina em: ${u.sedes.map(esc).join(', ')}</p>
    ${u.revalida ? `<div class="rx-kpis" style="grid-template-columns:1fr 1fr"><div class="rx-kpi"><span>Aprovados no Revalida ${esc(u.revalida.edicao)}</span><strong>${u.revalida.aprovados.toLocaleString('pt-BR')}</strong><small>${esc(u.revalida.fonte)}</small></div>
      <div class="rx-kpi"><span>Brasileiros (sua estimativa)</span><strong>${c.alunos_brasileiros != null ? c.alunos_brasileiros.toLocaleString('pt-BR') : '—'}</strong></div></div>` : ''}
    ${u.nota ? `<p class="ev-nota">${esc(u.nota)}</p>` : ''}
    <p>${u.sedes.map((s) => `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${u.nome} ${s} Paraguay`)}" target="_blank" rel="noopener">Mapa · ${esc(s)}</a>`).join(' · ')} · <a href="https://www.google.com/search?q=${encodeURIComponent(`${u.nome} carrera de medicina coordinación contacto`)}" target="_blank" rel="noopener">Procurar a coordenação</a></p>
    ${u.fontes?.length ? `<p class="rx-mudo pequeno">Fontes: ${u.fontes.map((f, i) => `<a href="${esc(f)}" target="_blank" rel="noopener">${i + 1}</a>`).join(' · ')}</p>` : ''}
    <h3>Como abordar</h3><ul class="fac-dicas">${abordagemUniversidade(u).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <h3>Acompanhamento</h3>
    <form id="py-crm" class="fac-form">
      <label class="rx-campo"><span>Status</span><select name="status">${opcoes(STATUS_FAC, c.status || 'nao_contatado')}</select></label>
      <label class="rx-campo"><span>Prioridade</span><select name="prioridade">${opcoes(PRIORIDADE, c.prioridade || 'media')}</select></label>
      <label class="rx-campo"><span>Alunos brasileiros (estimativa)</span><input name="alunos_brasileiros" inputmode="numeric" value="${c.alunos_brasileiros ?? ''}"></label>
      <label class="rx-campo"><span>Cupom da faculdade</span><input name="cupom" value="${esc(c.cupom || '')}" placeholder="Ex.: UMS10"></label>
      <label class="rx-campo"><span>Contato</span><input name="contato_nome" value="${esc(c.contato_nome || '')}" placeholder="Nome"></label>
      <label class="rx-campo"><span>Cargo</span><input name="contato_cargo" value="${esc(c.contato_cargo || '')}" placeholder="Coordinador(a) de Medicina"></label>
      <label class="rx-campo"><span>E-mail</span><input name="contato_email" type="email" value="${esc(c.contato_email || '')}"></label>
      <label class="rx-campo"><span>Telefone / WhatsApp</span><input name="contato_telefone" value="${esc(c.contato_telefone || '')}" placeholder="+595"></label>
      <label class="rx-campo fac-largo"><span>Próxima ação</span><input name="proxima_acao" value="${esc(c.proxima_acao || '')}"></label>
      <label class="rx-campo"><span>Data da próxima ação</span><input name="proxima_data" type="date" value="${iso(c.proxima_data)}"></label>
      <label class="rx-campo"><span>Data da visita</span><input name="visita_data" type="date" value="${iso(c.visita_data)}"></label>
      <label class="rx-campo fac-largo"><span>Notas</span><textarea name="notas" rows="4">${esc(c.notas || '')}</textarea></label>
      <p class="rx-erro rx-oculto fac-largo" id="py-erro"></p>
      <button class="botao botao-primario fac-largo">Salvar acompanhamento</button>
    </form>
    ${c.atualizado_em ? `<p class="rx-mudo pequeno">Atualizado em ${dataHora(c.atualizado_em)}</p>` : ''}
    <h3>Histórico de contatos</h3>${formInteracao}${historico(interacoes)}
  </aside>`);
  $('#fechar').addEventListener('click', fecharGaveta);
  $('#py-crm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api(`/admin/paraguai/${id}`, { metodo: 'PUT', corpo: Object.fromEntries(new FormData(ev.target)) }); fecharGaveta(); recarregar(); } catch (err) { const el = $('#py-erro'); el.textContent = err.message; el.classList.remove('rx-oculto'); }
  });
  $('#ev-interacao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api(`/admin/paraguai/${id}/interacoes`, { metodo: 'POST', corpo: Object.fromEntries(new FormData(ev.target)) }); detalheUniversidade(id, abrirGaveta, fecharGaveta, recarregar); } catch (err) { alert(err.message); }
  });
}

const GUIA_PARAGUAI = `
  <h2 style="margin-top:0">Plano Paraguai: Rx Med Revalida</h2>
  <div class="fac-guia-grade">
    <div><h3>1. Começar pela UMS</h3><ul>
      <li>Você é egresso: a primeira apresentação é onde já te conhecem. Peça à coordenação uma data com os alunos dos últimos semestres e do internato.</li>
      <li>Antes, confirme a situação atual da carreira (houve clausura em 2022 e intervenção noticiada em 2026) para não associar a marca a um problema.</li>
      <li>Saia da UMS com um depoimento e fotos: eles abrem as portas nas outras faculdades.</li></ul></div>
    <div><h3>2. Onde estão os alunos</h3><ul>
      <li>Pedro Juan Caballero: cerca de 10 programas de Medicina, quase só brasileiros. Dá para visitar várias faculdades no mesmo dia (fronteira com Ponta Porã/MS).</li>
      <li>Ciudad del Este: cerca de 8 faculdades, na fronteira com Foz do Iguaçu/PR. UNINTER e UPE estão entre as que mais aprovam no Revalida.</li>
      <li>Asunción: UMS, UCP, UNIDA, Universidad del Pacífico.</li>
      <li>Salto del Guairá: UNISUD, na fronteira com Guaíra/PR.</li></ul></div>
    <div><h3>3. O que levar</h3><ul>
      <li>A plataforma aberta em espanhol no celular: questão comentada, treino de ECG e uma estação da 2ª etapa com paciente simulado.</li>
      <li>O plano gratuito para todos os presentes e um cupom da faculdade com prazo curto (ex.: 7 dias).</li>
      <li>Um QR Code para a página do Revalida.</li></ul></div>
    <div><h3>4. A oferta</h3><ul>
      <li>Palestra gratuita "Como é o Revalida: 1ª e 2ª etapa" para os últimos semestres.</li>
      <li>Simulado diagnóstico da 1ª etapa sem custo e relatório por área para a coordenação.</li>
      <li>Cupom da faculdade e comissão para a associação de estudantes (afiliado).</li></ul></div>
    <div><h3>5. A sequência</h3><ol>
      <li>Marque "Pesquisada" e anote o contato da coordenação e do centro de estudantes.</li>
      <li>Mensagem pelo WhatsApp ou e-mail (modelo abaixo).</li>
      <li>Retorno em 3 dias úteis.</li>
      <li>Apresentação presencial: agrupe as faculdades da mesma cidade numa só viagem.</li>
      <li>Registre a visita no histórico no mesmo dia e acompanhe as assinaturas pelo cupom.</li></ol></div>
    <div><h3>6. Atenção</h3><ul>
      <li>Universidade Interamericana já anunciou parceria com o MedCof: concorrente direto em Pedro Juan Caballero.</li>
      <li>Não use o nome ou a marca da faculdade no site sem autorização por escrito.</li>
      <li>Os números desta aba vêm de reportagens; confirme antes de usar em material público.</li></ul></div>
  </div>
  <h3>Modelo de mensagem</h3>
  <pre class="fac-modelo" id="ev-modelo">Hola, Prof(a). [nombre]:

Soy [su nombre], médico egresado de [universidad], y hoy dirijo Rx Med, una plataforma de preparación para el Revalida (1.ª y 2.ª etapa) con las preguntas oficiales del Inep comentadas, estaciones con paciente simulado y la interfaz en español.

Nos gustaría ofrecer a los alumnos de los últimos semestres una charla gratuita sobre cómo es el Revalida y un simulacro diagnóstico de la 1.ª etapa, con un informe por área para la coordinación.

¿Podríamos coordinar una fecha?

Saludos cordiales,
[su nombre] · [teléfono] · Rx Med</pre>
  <button class="botao" type="button" data-copiar="ev-modelo">Copiar texto</button>`;
