// Aba "Faculdades" do admin: mapa das escolas médicas do Brasil (INEP) e acompanhamento da prospecção de parcerias.
import { $, api, data, dataHora, esc } from './comum.js';

export const STATUS = {
  nao_contatado: { nome: 'Não contatada', cor: '#8FA3A8' },
  pesquisada: { nome: 'Pesquisada', cor: '#6aa8f0' },
  contato_feito: { nome: 'Contato feito', cor: '#2CC79F' },
  reuniao_agendada: { nome: 'Reunião agendada', cor: '#e0a52a' },
  visitada: { nome: 'Visitada', cor: '#8b7cf6' },
  proposta_enviada: { nome: 'Proposta enviada', cor: '#d95926' },
  parceria: { nome: 'Parceria fechada', cor: '#34d399' },
  sem_interesse: { nome: 'Sem interesse', cor: '#f87171' },
};
const PRIORIDADE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const TIPOS = { email: 'E-mail', ligacao: 'Ligação', whatsapp: 'WhatsApp', reuniao: 'Reunião', visita: 'Visita', proposta: 'Proposta', outro: 'Outro' };
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const milhar = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const status = (e) => e.crm?.status || 'nao_contatado';
const hoje = () => new Date().toISOString().slice(0, 10);
const titulo = (s) => s.toLowerCase().replace(/(^|[\s(/-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

let escolas = [];
let mapa = null;
let camada = null;

// Leaflet é servido pelo próprio servidor (sem CDN) e carregado só quando a aba abre.
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

function filtros() {
  try { return JSON.parse(sessionStorage.getItem('rx-fac') || '{}'); } catch { return {}; }
}
function filtrar(f) {
  const busca = (f.busca || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return escolas.filter((e) => (!f.uf || e.uf === f.uf) && (!f.rede || e.rede === f.rede) && (!f.status || status(e) === f.status)
    && (!f.prioridade || (e.crm?.prioridade || 'media') === f.prioridade)
    && (!busca || `${e.nome} ${e.sigla} ${e.municipio} ${e.mantenedora}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(busca)));
}

export async function faculdades(conteudo, abrirGaveta, fecharGaveta) {
  const r = await api('/admin/faculdades');
  escolas = r.escolas;
  const f = filtros();
  const porStatus = Object.fromEntries(Object.keys(STATUS).map((k) => [k, escolas.filter((e) => status(e) === k).length]));
  const atrasadas = escolas.filter((e) => e.crm?.proxima_data && e.crm.proxima_data.slice(0, 10) < hoje() && !['parceria', 'sem_interesse'].includes(status(e))).length;
  const emAndamento = escolas.length - porStatus.nao_contatado - porStatus.parceria - porStatus.sem_interesse;
  conteudo.innerHTML = `
    <div class="fac-cabecalho"><div><h1 style="font-family:var(--f-display);margin-bottom:4px">Escolas médicas do Brasil</h1>
      <p class="rx-mudo pequeno">${escolas.length} cursos de Medicina em atividade · ${esc(r.fonte || '')}</p></div>
      <div class="rx-linha"><button class="botao" id="fac-roteiro">Como abordar</button><a class="botao" href="/api/admin/faculdades?formato=csv">Exportar planilha</a></div></div>
    <section class="rx-cartao fac-guia rx-oculto" id="fac-guia">${GUIA}</section>
    <div class="rx-kpis">
      <div class="rx-kpi"><span>Escolas</span><strong>${escolas.length}</strong><small>${escolas.filter((e) => e.rede === 'Pública').length} públicas · ${escolas.filter((e) => e.rede === 'Privada').length} privadas</small></div>
      <div class="rx-kpi"><span>Alunos de Medicina</span><strong>${milhar(escolas.reduce((s, e) => s + e.matriculas, 0))}</strong><small>${milhar(escolas.reduce((s, e) => s + e.concluintes, 0))} formandos por ano</small></div>
      <div class="rx-kpi"><span>Em andamento</span><strong>${emAndamento}</strong><small>${porStatus.reuniao_agendada} reuniões · ${porStatus.visitada} visitadas</small></div>
      <div class="rx-kpi"><span>Parcerias</span><strong>${porStatus.parceria}</strong><small>${milhar(escolas.filter((e) => status(e) === 'parceria').reduce((s, e) => s + e.matriculas, 0))} alunos alcançados</small></div>
      <div class="rx-kpi"><span>Ações atrasadas</span><strong${atrasadas ? ' style="color:var(--aviso)"' : ''}>${atrasadas}</strong><small>próxima ação vencida</small></div>
    </div>
    <form class="rx-filtros" id="fac-filtro">
      <label class="rx-campo" style="min-width:220px"><span>Buscar</span><input name="busca" value="${esc(f.busca || '')}" placeholder="escola, cidade ou mantenedora"></label>
      <label class="rx-campo" style="min-width:110px"><span>UF</span><select name="uf"><option value="">Todas</option>${UFS.map((u) => `<option ${u === f.uf ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="rx-campo" style="min-width:130px"><span>Rede</span><select name="rede"><option value="">Todas</option>${['Pública', 'Privada'].map((u) => `<option ${u === f.rede ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="rx-campo"><span>Status</span><select name="status"><option value="">Todos</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${v.nome} (${porStatus[k]})</option>`).join('')}</select></label>
      <label class="rx-campo" style="min-width:130px"><span>Prioridade</span><select name="prioridade"><option value="">Todas</option>${Object.entries(PRIORIDADE).map(([k, v]) => `<option value="${k}" ${k === f.prioridade ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="botao" type="button" id="fac-limpar">Limpar</button>
    </form>
    <div class="fac-mapa-caixa rx-cartao"><div id="fac-mapa" role="region" aria-label="Mapa das escolas médicas"></div>
      <div class="fac-legenda">${Object.entries(STATUS).map(([, v]) => `<span><i style="background:${v.cor}"></i>${v.nome}</span>`).join('')}<span class="rx-mudo">Tamanho do ponto: número de alunos</span></div></div>
    <p class="rx-mudo pequeno" id="fac-contagem"></p>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Escola</th><th>Cidade</th><th>Rede</th><th>Alunos</th><th>Formandos/ano</th><th>Status</th><th>Próxima ação</th></tr></thead><tbody id="fac-lista"></tbody></table></div>`;

  $('#fac-roteiro').addEventListener('click', () => $('#fac-guia').classList.toggle('rx-oculto'));
  for (const b of conteudo.querySelectorAll('[data-copiar]')) b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(`#${b.dataset.copiar}`).innerText); b.textContent = 'Copiado'; setTimeout(() => { b.textContent = 'Copiar texto'; }, 1500); } catch { /* sem área de transferência */ }
  });
  const form = $('#fac-filtro');
  const aplicar = () => {
    const nf = Object.fromEntries(new FormData(form));
    sessionStorage.setItem('rx-fac', JSON.stringify(nf));
    desenhar(nf);
  };
  form.addEventListener('input', aplicar);
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#fac-limpar').addEventListener('click', () => { form.reset(); for (const el of form.elements) if (el.name) el.value = ''; aplicar(); });

  const abrirEscola = (curso) => detalhe(curso, abrirGaveta, fecharGaveta, () => faculdades(conteudo, abrirGaveta, fecharGaveta));
  function desenhar(fx) {
    const lista = filtrar(fx).sort((a, b) => b.matriculas - a.matriculas);
    $('#fac-contagem').textContent = `${lista.length} escolas no filtro · ${milhar(lista.reduce((s, e) => s + e.matriculas, 0))} alunos`;
    $('#fac-lista').innerHTML = lista.map((e) => `<tr class="clicavel" data-curso="${e.curso}">
      <td><strong>${esc(titulo(e.nome))}</strong>${e.sigla ? ` <span class="rx-mudo">${esc(e.sigla)}</span>` : ''}</td>
      <td>${esc(e.municipio)}/${e.uf}</td><td>${esc(e.categoria)}</td><td>${milhar(e.matriculas)}</td><td>${milhar(e.concluintes)}</td>
      <td><span class="fac-status" style="--c:${STATUS[status(e)].cor}">${STATUS[status(e)].nome}</span></td>
      <td>${e.crm?.proxima_acao ? `${esc(e.crm.proxima_acao)}${e.crm.proxima_data ? ` <span class="${e.crm.proxima_data.slice(0, 10) < hoje() ? 'fac-atrasada' : 'rx-mudo'}">${data(e.crm.proxima_data)}</span>` : ''}` : '<span class="rx-mudo">—</span>'}</td></tr>`).join('')
      || '<tr><td colspan="7" class="rx-mudo">Nenhuma escola no filtro.</td></tr>';
    for (const tr of conteudo.querySelectorAll('tr[data-curso]')) tr.addEventListener('click', () => abrirEscola(Number(tr.dataset.curso)));
    if (!camada) return;
    camada.clearLayers();
    // Escolas da mesma cidade ficam em círculo em volta do centro do município, para não se sobreporem.
    const porCidade = {};
    for (const e of lista) (porCidade[e.codMunicipio] ||= []).push(e);
    for (const grupo of Object.values(porCidade)) grupo.forEach((e, i) => {
      const n = grupo.length;
      const ang = (2 * Math.PI * i) / n;
      const raio = n > 1 ? 0.04 + 0.01 * Math.min(n, 12) : 0;
      const pos = [e.lat + raio * Math.sin(ang), e.lng + raio * Math.cos(ang)];
      const cor = STATUS[status(e)].cor;
      L.circleMarker(pos, { radius: 4 + Math.sqrt(e.matriculas) / 6, color: '#0A1D26', weight: 1, fillColor: cor, fillOpacity: 0.85 })
        .bindTooltip(`<strong>${esc(titulo(e.nome))}</strong><br>${esc(e.municipio)}/${e.uf} · ${milhar(e.matriculas)} alunos<br>${STATUS[status(e)].nome}`)
        .on('click', () => abrirEscola(e.curso)).addTo(camada);
    });
    if (lista.length && (fx.uf || fx.busca)) mapa.fitBounds(L.latLngBounds(lista.map((e) => [e.lat, e.lng])).pad(0.3), { maxZoom: 11 });
  }

  try {
    await carregarLeaflet();
    mapa = L.map('fac-mapa', { scrollWheelZoom: false }).setView([-14.5, -52], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mapa);
    camada = L.layerGroup().addTo(mapa);
  } catch (e) {
    $('#fac-mapa').innerHTML = `<p class="rx-erro" style="padding:16px">${esc(e.message)}</p>`;
  }
  desenhar(f);
}

function abordagemPara(e) {
  if (e.rede === 'Pública') {
    return ['Comece pela coordenação do curso e pelo centro acadêmico: em instituição pública, a compra exige processo de contratação, então a parceria mais rápida é sem custo para a escola.',
      'Proponha um acordo de cooperação sem ônus: simulado ENAMED diagnóstico gratuito para a turma e relatório por área para a coordenação, com desconto direto para os alunos que quiserem assinar.',
      'A atlética, as ligas acadêmicas e o centro acadêmico podem divulgar o cupom da turma.'];
  }
  return ['Procure a coordenação do curso e a direção acadêmica; em grupos educacionais, também a área de relacionamento ou de parcerias da mantenedora.',
    `Argumento central: o ENAMED avalia o curso. Uma turma bem preparada melhora o resultado da escola, e ${milhar(e.concluintes)} formandos por ano fazem a prova aqui.`,
    'Ofereça licença institucional por aluno com desconto por volume, ou desconto para os alunos com cupom da escola, e comece com um piloto de 30 dias em uma turma.'];
}

async function detalhe(curso, abrirGaveta, fecharGaveta, recarregar) {
  const { escola: e, crm, interacoes, campi } = await api(`/admin/faculdades/${curso}`);
  const c = crm || {};
  const iso = (d) => (d ? String(d).slice(0, 10) : '');
  const busca = encodeURIComponent(`${e.nome} ${e.municipio} ${e.uf}`);
  abrirGaveta(`<aside class="rx-gaveta" role="dialog" aria-label="Escola">
    <button class="botao" id="fechar" style="float:right">Fechar</button>
    <p class="rx-mudo pequeno" style="margin:0">${esc(e.categoria)} · curso INEP ${e.curso}</p>
    <h2>${esc(titulo(e.nome))}${e.sigla ? ` <small class="rx-mudo">${esc(e.sigla)}</small>` : ''}</h2>
    <p class="rx-mudo">${esc(e.municipio)}/${e.uf} · ${esc(e.regiao)}<br>${esc(e.endereco || '')}${e.bairro ? `, ${esc(e.bairro)}` : ''}${e.cep ? ` · CEP ${esc(e.cep)}` : ''}${e.municipioSede && e.municipioSede !== e.municipio ? `<br>Sede da instituição: ${esc(e.municipioSede)}` : ''}<br>Mantenedora: ${esc(titulo(e.mantenedora || '—'))}</p>
    <div class="rx-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="rx-kpi"><span>Alunos</span><strong>${milhar(e.matriculas)}</strong></div>
      <div class="rx-kpi"><span>Formandos/ano</span><strong>${milhar(e.concluintes)}</strong></div>
      <div class="rx-kpi"><span>Vagas/ano</span><strong>${milhar(e.vagas)}</strong></div></div>
    <p><a href="https://www.google.com/maps/search/?api=1&query=${busca}" target="_blank" rel="noopener">Abrir no mapa</a> · <a href="https://www.google.com/search?q=${encodeURIComponent(`coordenação curso de medicina ${e.nome} ${e.municipio}`)}" target="_blank" rel="noopener">Procurar a coordenação</a>${campi.length ? ` · Outros campi: ${campi.map((x) => `${esc(x.municipio)}/${x.uf}`).join(', ')}` : ''}</p>
    <h3>Como abordar esta escola</h3><ul class="fac-dicas">${abordagemPara(e).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <h3>Acompanhamento</h3>
    <form id="fac-crm" class="fac-form">
      <label class="rx-campo"><span>Status</span><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === (c.status || 'nao_contatado') ? 'selected' : ''}>${v.nome}</option>`).join('')}</select></label>
      <label class="rx-campo"><span>Prioridade</span><select name="prioridade">${Object.entries(PRIORIDADE).map(([k, v]) => `<option value="${k}" ${k === (c.prioridade || 'media') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="rx-campo"><span>Contato</span><input name="contato_nome" value="${esc(c.contato_nome || '')}" placeholder="Nome"></label>
      <label class="rx-campo"><span>Cargo</span><input name="contato_cargo" value="${esc(c.contato_cargo || '')}" placeholder="Coordenador(a) do curso"></label>
      <label class="rx-campo"><span>E-mail</span><input name="contato_email" type="email" value="${esc(c.contato_email || '')}"></label>
      <label class="rx-campo"><span>Telefone</span><input name="contato_telefone" value="${esc(c.contato_telefone || '')}"></label>
      <label class="rx-campo fac-largo"><span>Próxima ação</span><input name="proxima_acao" value="${esc(c.proxima_acao || '')}" placeholder="Ex.: ligar para a coordenação"></label>
      <label class="rx-campo"><span>Data da próxima ação</span><input name="proxima_data" type="date" value="${iso(c.proxima_data)}"></label>
      <label class="rx-campo"><span>Data da visita</span><input name="visita_data" type="date" value="${iso(c.visita_data)}"></label>
      <label class="rx-campo"><span>Cupom da escola</span><input name="cupom" value="${esc(c.cupom || '')}" placeholder="Ex.: UFMG10"></label>
      <label class="rx-campo fac-largo"><span>Notas</span><textarea name="notas" rows="4">${esc(c.notas || '')}</textarea></label>
      <p class="rx-erro rx-oculto fac-largo" id="fac-erro"></p>
      <button class="botao botao-primario fac-largo">Salvar acompanhamento</button>
    </form>
    ${c.atualizado_em ? `<p class="rx-mudo pequeno">Atualizado em ${dataHora(c.atualizado_em)}</p>` : ''}
    <h3>Histórico de contatos</h3>
    <form id="fac-interacao" class="rx-linha" style="align-items:end">
      <label class="rx-campo" style="max-width:140px"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="rx-campo" style="flex:1"><span>O que aconteceu</span><input name="texto" placeholder="Ex.: falei com a coordenadora, pediu proposta por e-mail"></label>
      <button class="botao">Registrar</button>
    </form>
    <ul class="fac-historico">${interacoes.map((i) => `<li><span class="rx-mudo pequeno">${dataHora(i.em)} · ${TIPOS[i.tipo]}${i.admin ? ` · ${esc(i.admin)}` : ''}</span><br>${esc(i.texto)}</li>`).join('') || '<li class="rx-mudo">Nenhum contato registrado.</li>'}</ul>
  </aside>`);
  $('#fechar').addEventListener('click', fecharGaveta);
  $('#fac-crm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/admin/faculdades/${curso}`, { metodo: 'PUT', corpo: Object.fromEntries(new FormData(ev.target)) });
      fecharGaveta(); recarregar();
    } catch (err) { const el = $('#fac-erro'); el.textContent = err.message; el.classList.remove('rx-oculto'); }
  });
  $('#fac-interacao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await api(`/admin/faculdades/${curso}/interacoes`, { metodo: 'POST', corpo: Object.fromEntries(new FormData(ev.target)) });
      detalhe(curso, abrirGaveta, fecharGaveta, recarregar);
    } catch (err) { alert(err.message); }
  });
}

const GUIA = `
  <h2 style="margin-top:0">Como abordar as escolas médicas</h2>
  <div class="fac-guia-grade">
    <div><h3>1. Escolha quem visitar primeiro</h3><ul>
      <li>Comece pelas escolas com mais formandos por ano perto de você: filtre por UF e ordene pela lista (já vem pelo número de alunos).</li>
      <li>Privadas com fins lucrativos e grupos educacionais decidem mais rápido e têm orçamento; marque como prioridade alta.</li>
      <li>Agrupe as visitas por cidade: no mapa, filtre a UF e planeje um dia por cidade.</li></ul></div>
    <div><h3>2. Quem procurar</h3><ul>
      <li>Coordenação do curso de Medicina e Núcleo Docente Estruturante (NDE): quem responde pelo resultado do ENAMED.</li>
      <li>Direção acadêmica e, nos grupos, a área de parcerias da mantenedora.</li>
      <li>Alunos: centro acadêmico, atlética e ligas acadêmicas. Abrem portas e divulgam para a turma.</li></ul></div>
    <div><h3>3. O argumento</h3><ul>
      <li>O ENAMED avalia a formação do curso e a nota do aluno conta para a residência (Enare). A escola quer a turma preparada.</li>
      <li>A Rx Med entrega questões oficiais comentadas, trilha diária, simulados no tempo da prova e relatório de desempenho por área.</li>
      <li>Custo baixo por aluno, sem montar estrutura própria de preparação.</li></ul></div>
    <div><h3>4. O que oferecer</h3><ul>
      <li><strong>Porta de entrada sem custo:</strong> simulado ENAMED diagnóstico para a turma do 5º ou 6º ano, com relatório por área para a coordenação.</li>
      <li><strong>Licença institucional:</strong> preço por aluno com desconto por volume, pago pela escola.</li>
      <li><strong>Desconto para os alunos:</strong> cupom da escola (aba Cupons), sem custo para a instituição; a atlética ou a liga pode ser afiliada e receber comissão.</li>
      <li><strong>Pública:</strong> acordo de cooperação sem ônus (a compra exige processo de contratação) com desconto direto ao aluno.</li></ul></div>
    <div><h3>5. A sequência</h3><ol>
      <li>Pesquise: coordenador, nota do curso, tamanho da turma. Marque "Pesquisada".</li>
      <li>Primeiro contato por e-mail ou LinkedIn (modelo abaixo).</li>
      <li>Retorno por telefone ou WhatsApp em 3 dias úteis.</li>
      <li>Reunião online de 20 minutos com demonstração.</li>
      <li>Visita presencial com a demonstração no celular e o relatório de exemplo.</li>
      <li>Proposta por escrito e piloto de 30 dias com uma turma.</li>
      <li>Parceria: cupom ou licença, e data do simulado institucional.</li></ol></div>
    <div><h3>6. Na visita</h3><ul>
      <li>Leve a plataforma aberta no celular e no notebook: painel, questão comentada e estação da 2ª etapa.</li>
      <li>Leve o mapa do Raio-X da última prova e um relatório de turma de exemplo.</li>
      <li>Saia com uma data marcada: simulado, palestra ou piloto.</li>
      <li>Registre a visita aqui no histórico no mesmo dia.</li></ul></div>
  </div>
  <h3>Modelo de primeiro e-mail</h3>
  <pre class="fac-modelo" id="fac-modelo-email">Assunto: Simulado ENAMED gratuito para a turma de Medicina

Olá, Prof(a). [nome],

Sou [seu nome], da Rx Med, plataforma de preparação para o ENAMED e o Revalida com as questões oficiais do Inep comentadas, trilha de estudo diária e simulados no tempo da prova.

Queremos oferecer à turma de [5º/6º ano] da [escola] um simulado ENAMED diagnóstico, sem custo, com um relatório de desempenho por grande área para a coordenação.

Posso apresentar a plataforma em 20 minutos, online ou presencialmente, na data que for melhor para a senhora/o senhor?

Atenciosamente,
[seu nome] · [telefone] · Rx Med</pre>
  <button class="botao" type="button" data-copiar="fac-modelo-email">Copiar texto</button>`;
