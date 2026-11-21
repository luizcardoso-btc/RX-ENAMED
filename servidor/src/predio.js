// Prédio da Rx Med: o time de marketing do curso. Agentes por regras, sem IA paga e sem custo extra
// (mesmo modelo do Prédio do Automazap). Cada agente tem nome, papel e uma sala no Admin › Prédio.
//   Helena   Gerente geral        resumo do dia, números e a lista do que o CEO precisa fazer/aprovar
//   Rafael   CTO · marketing      pauta da semana (pilares, áreas em rodízio, sem repetir questão)
//   Davi     Copy de vídeo        roteiros de Reels com gancho, demonstração e uma chamada; aprende com as métricas
//   Nina     Copy de imagem       textos dos carrosséis e stories, legenda e hashtags
//   Lia      Designer             transforma os slides em PNG 1080×1350 / 1080×1920 (no navegador, sala dela)
//   Renan    Social media         calendário, horários, "postado" com link e métricas de cada post
//   Sofia    Atendente            respostas prontas para DM e WhatsApp, com preços e regras reais
//   Otávio   CFO                  receita, ticket, planos e reembolsos
//   Jade     Parcerias            próximos contatos com faculdades (aba Faculdades)
// Regras de publicidade: nada de "aprovação garantida", depoimento inventado ou número sem fonte. Questões oficiais
// sempre com a fonte (Inep, prova, edição e número); comentários são da equipe Rx Med.
import { existsSync, readFileSync } from 'node:fs';
import { bancoQuestoes } from './faculdades.js';

export const EQUIPE = [
  { id: 'recepcao', nome: 'Clara', papel: 'Recepção', emoji: '🛎️', andar: 0 },
  { id: 'gerente', nome: 'Helena', papel: 'Gerente geral', emoji: '👩‍💼', andar: 1 },
  { id: 'financeiro', nome: 'Otávio', papel: 'CFO', emoji: '📊', andar: 1 },
  { id: 'cto', nome: 'Rafael', papel: 'CTO · Gestor de marketing', emoji: '🧭', andar: 2 },
  { id: 'copy_video', nome: 'Davi', papel: 'Copywriter de vídeo', emoji: '🎬', andar: 3 },
  { id: 'copy_imagem', nome: 'Nina', papel: 'Copywriter de imagem', emoji: '✍️', andar: 3 },
  { id: 'imagem', nome: 'Lia', papel: 'Designer de imagem', emoji: '🎨', andar: 4 },
  { id: 'social', nome: 'Renan', papel: 'Social media', emoji: '📱', andar: 4 },
  { id: 'atendente', nome: 'Sofia', papel: 'Atendente (DM e WhatsApp)', emoji: '💬', andar: 5 },
  { id: 'comercial', nome: 'Jade', papel: 'Parcerias com faculdades', emoji: '🏛️', andar: 5 },
];

export const AJUSTES_PADRAO = {
  nomes: {},
  instagram: '@rxmed',
  site: '',
  palavraChave: 'ENAMED',
  provas: [],                        // [{ nome: 'ENAMED 2027', data: 'AAAA-MM-DD' }]
  horarios: { feed: ['12:00', '19:00'], stories: ['09:00', '18:00'] },
};

const DIA = 86400e3;
const FUSO = 3 * 3600e3;
export const hojeBR = (t = Date.now()) => new Date(t - FUSO).toISOString().slice(0, 10);
export function segundaDaSemana(diaIso) {
  const d = new Date(`${diaIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasAte = (iso, de) => Math.round((new Date(`${iso}T12:00:00Z`) - new Date(`${de}T12:00:00Z`)) / DIA);

const AREAS = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia e Obstetrícia', 'Medicina de Família e Comunidade / Saúde Coletiva'];
const CURTO = { 'Clínica Médica': 'Clínica Médica', Cirurgia: 'Cirurgia', Pediatria: 'Pediatria', 'Ginecologia e Obstetrícia': 'GO', 'Medicina de Família e Comunidade / Saúde Coletiva': 'Saúde Coletiva' };
const TAG_AREA = { 'Clínica Médica': '#clinicamedica', Cirurgia: '#cirurgia', Pediatria: '#pediatria', 'Ginecologia e Obstetrícia': '#ginecologiaeobstetricia', 'Medicina de Família e Comunidade / Saúde Coletiva': '#saudecoletiva' };

// Sorteio estável: a mesma semana gera a mesma escolha (dá para refazer a pauta sem embaralhar tudo).
function semente(texto) { let h = 2166136261; for (const c of texto) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function escolher(lista, chave) { return lista.length ? lista[semente(chave) % lista.length] : null; }

// ---------------------------------------------------------------- dados
let comentarios = null;
function comentariosOficiais(config) {
  if (comentarios) return comentarios;
  const raiz = new URL('../../', import.meta.url).pathname;
  const arq = [`${config.pastaSite}/plataforma/data/comentarios.json`, `${raiz}app/dist/data/comentarios.json`].find((c) => existsSync(c));
  comentarios = arq ? JSON.parse(readFileSync(arq, 'utf8')) : {};
  return comentarios;
}
const resumoDe = (config, id) => comentariosOficiais(config)[id]?.pt?.resumo || '';
const oficiais = (config) => bancoQuestoes(config).lista.filter((q) => (!q.fonte || q.fonte === 'inep') && !q.anulada && q.gabarito);
const prova = (q) => `${q.exame} ${q.edicao}`;

/** Questão boa para post: oficial, alta incidência, sem figura, com comentário, enunciado que cabe em 2 slides. */
function questaoParaPost(config, { area, tipo, usadas, chave }) {
  const ok = oficiais(config).filter((q) => q.incidencia === 'alta' && !(q.figuras || []).length && q.enunciado.length <= 900
    && q.alternativas.every((a) => a.length <= 220) && resumoDe(config, q.id) && !usadas.has(q.id)
    && (!area || q.area === area) && (!tipo || new RegExp(tipo, 'i').test(q.tipo || '')));
  return escolher(ok, chave);
}

/** Temas que o Inep repete em várias provas (o "Inep adora cobrar"). */
function temasRecorrentes(config, area) {
  const por = new Map();
  for (const q of oficiais(config)) {
    if (!q.tema || (area && q.area !== area)) continue;
    const t = por.get(q.tema) || { tema: q.tema, area: q.area, especialidade: q.especialidade, provas: new Set(), questoes: [] };
    t.provas.add(prova(q)); t.questoes.push(q); por.set(q.tema, t);
  }
  return [...por.values()].filter((t) => t.provas.size >= 3).sort((a, b) => b.provas.size - a.provas.size || a.tema.localeCompare(b.tema));
}

function raioXArea(config, area) {
  const lista = oficiais(config);
  const daArea = lista.filter((q) => q.area === area);
  const cont = {};
  for (const q of daArea) cont[q.especialidade] = (cont[q.especialidade] || 0) + 1;
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nome, n]) => ({ nome, n, pct: Math.round((100 * n) / daArea.length) }));
  const provas = new Set(lista.map(prova)).size;
  return { area, total: daArea.length, pctProva: Math.round((100 * daArea.length) / lista.length), provas, top };
}

// ---------------------------------------------------------------- Nina: textos de carrossel e stories
function partir(texto, max) {
  const frases = String(texto).replace(/\s+/g, ' ').trim().split(/(?<=[.!?:;])\s+/);
  const partes = []; let atual = '';
  for (const f of frases) {
    if (atual && (atual + ' ' + f).length > max) { partes.push(atual); atual = f; } else atual = atual ? `${atual} ${f}` : f;
  }
  if (atual) partes.push(atual);
  return partes.flatMap((p) => (p.length <= max * 1.25 ? [p] : p.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')).map((s) => s.trim())));
}
const corta = (t, n) => (t.length <= n ? t : `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const hashtags = (area, extras = []) => [...new Set(['#enamed', '#revalida', TAG_AREA[area], '#medicina', ...extras].filter(Boolean))].slice(0, 5).join(' ');

function carrosselQuestao(config, q, aj) {
  const resumo = resumoDe(config, q.id);
  const enun = partir(q.enunciado, 430);
  const resp = partir(resumo, 430).slice(0, 2);
  const slides = [
    { tipo: 'capa', sobre: `${CURTO[q.area]} · ${q.especialidade}`, titulo: 'Você acertaria essa questão do Inep?', texto: `${prova(q)} · questão ${q.numero}` },
    ...enun.map((t, i) => ({ tipo: 'texto', sobre: enun.length > 1 ? `Caso clínico (${i + 1}/${enun.length})` : 'Caso clínico', texto: t })),
    { tipo: 'alternativas', sobre: 'Qual é a resposta?', itens: q.alternativas.map((a, i) => `${'ABCDE'[i]}) ${corta(a, 150)}`), texto: 'Pense antes de passar →' },
    ...resp.map((t, i) => ({ tipo: 'resposta', sobre: i === 0 ? `Gabarito oficial: ${q.gabarito}` : 'Por quê', titulo: i === 0 ? `Resposta: ${q.gabarito}` : '', texto: t })),
    { tipo: 'cta', titulo: 'Salve para revisar antes da prova', texto: `Mais ${oficiais(config).length.toLocaleString('pt-BR')} questões oficiais comentadas, simulados e Raio-X da prova na Rx Med.`, rodape: aj.site || aj.instagram },
  ];
  const legenda = [
    `Você acertaria essa de ${q.especialidade}? 👀`,
    '',
    `Questão ${q.numero} do ${prova(q)} (Inep). Tema que aparece com frequência na prova. Responda nos comentários antes de ver o gabarito.`,
    '',
    `💾 Salve para revisar e mande para quem vai fazer o ENAMED ou o Revalida.`,
    `Comente ${aj.palavraChave} que a gente te manda como treinar grátis.`,
    '',
    `Fonte: Inep, ${prova(q)}, questão ${q.numero}. Comentário: equipe Rx Med.`,
    hashtags(q.area, ['#questoescomentadas']),
  ].join('\n');
  return { slides, legenda, questaoId: q.id };
}

function carrosselRaioX(config, area, aj) {
  const r = raioXArea(config, area);
  const slides = [
    { tipo: 'capa', sobre: 'Raio-X da prova', titulo: `O que mais cai de ${CURTO[area]} no Inep`, texto: `${r.total} questões em ${r.provas} provas oficiais analisadas` },
    { tipo: 'dado', sobre: CURTO[area], titulo: `${r.pctProva}% da prova`, texto: `${CURTO[area]} responde por cerca de ${r.pctProva}% das questões objetivas do Revalida e do ENAMED desde 2011.` },
    { tipo: 'lista', sobre: 'As 5 especialidades que mais caem', itens: r.top.map((t, i) => `${i + 1}. ${t.nome}: ${t.n} questões (${t.pct}% da área)`) },
    { tipo: 'texto', sobre: 'Como usar isso', texto: `Comece por ${r.top[0]?.nome} e ${r.top[1]?.nome}: é onde cada hora de estudo rende mais pontos. Depois, treine as questões oficiais desses temas.` },
    { tipo: 'cta', titulo: 'Veja o Raio-X completo', texto: 'Na Rx Med, o Raio-X mostra o peso de cada tema, edição por edição, e monta sua trilha pelo que mais cai.', rodape: aj.site || aj.instagram },
  ];
  const legenda = [
    `Onde estudar ${CURTO[area]} primeiro? Os números das provas respondem. 📊`,
    '',
    r.top.slice(0, 3).map((t) => `• ${t.nome}: ${t.n} questões`).join('\n'),
    '',
    `Levantamento da equipe Rx Med com as ${r.provas} provas objetivas oficiais do Inep (Revalida e ENAMED).`,
    `Comente ${aj.palavraChave} para receber o Raio-X da sua área.`,
    hashtags(area, ['#estudarmedicina']),
  ].join('\n');
  return { slides, legenda };
}

const PRODUTO = [
  { titulo: 'Simulado nacional gratuito', slides: [
    ['capa', 'Simulado nacional', 'Faça o simulado e veja sua posição no Brasil e na sua faculdade'],
    ['texto', 'Como funciona', 'Caderno com questões oficiais, tempo de prova, nota na hora e ranking geral e por faculdade.'],
    ['texto', 'Quanto custa', 'É gratuito. Basta criar a conta.'],
  ] },
  { titulo: 'Paciente simulado por voz', slides: [
    ['capa', '2ª etapa', 'Treine a estação conversando com o paciente por voz'],
    ['texto', 'Como funciona', 'Você pergunta, o paciente responde, pede exames e recebe os impressos. No fim, a correção pelo checklist (PEP), item por item.'],
    ['texto', 'Para quem', 'Para a prova de habilidades do Revalida: estações oficiais do Inep e casos autorais da equipe.'],
  ] },
  { titulo: 'Trilha pelo que mais cai', slides: [
    ['capa', 'Estudo guiado', 'Uma trilha que começa pelo que mais cai na sua prova'],
    ['texto', 'Como funciona', 'O Raio-X das provas define a ordem dos temas; seus erros ajustam o que vem depois.'],
    ['texto', 'O que tem', 'Aulas, questões oficiais comentadas, flashcards com revisão espaçada e simulados.'],
  ] },
];
function carrosselProduto(idx, aj, planos) {
  const p = PRODUTO[idx % PRODUTO.length];
  const menor = planos?.planos?.length ? planos.planos.reduce((a, b) => (a.valorCentavos / a.duracaoMeses < b.valorCentavos / b.duracaoMeses ? a : b)) : null;
  const slides = p.slides.map(([tipo, sobre, texto]) => (tipo === 'capa' ? { tipo, sobre, titulo: texto } : { tipo, sobre, texto }));
  slides.push({ tipo: 'cta', titulo: 'Comece grátis', texto: menor ? `Plano gratuito para testar. Planos completos a partir de ${(menor.valorCentavos / 100 / menor.duracaoMeses).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por mês (${menor.nome}).` : 'Crie sua conta e teste grátis.', rodape: aj.site || aj.instagram });
  const legenda = [`${p.titulo} na Rx Med. ✅`, '', slides.filter((s) => s.tipo === 'texto').map((s) => `• ${s.texto}`).join('\n'), '', `Comente ${aj.palavraChave} que a gente te manda o link.`, hashtags('', ['#estudarmedicina', '#residenciamedica'])].join('\n');
  return { slides, legenda };
}

function storyEnquete(q) {
  return { slides: [{ tipo: 'story', sobre: `${prova(q)} · ${q.especialidade}`, titulo: 'Qual é a conduta?', texto: corta(q.enunciado, 330), rodape: 'Responda na enquete ↓ · resposta no post de hoje' }],
    legenda: 'Story com enquete (adicione o adesivo de enquete A/B/C/D no Instagram).', questaoId: q.id };
}
function storyContagem(aj, dia) {
  const p = (aj.provas || []).filter((x) => x.data && x.data >= dia).sort((a, b) => a.data.localeCompare(b.data))[0];
  if (!p) return { slides: [{ tipo: 'story', sobre: 'Rx Med', titulo: 'Quantas questões você fez hoje?', texto: 'Constância vence maratona: 20 questões por dia somam 600 por mês.', rodape: 'Responda na caixinha ↓' }], legenda: 'Story com caixinha de perguntas.' };
  const n = diasAte(p.data, dia);
  return { slides: [{ tipo: 'story', sobre: p.nome, titulo: `Faltam ${n} dias`, texto: `${p.nome}: ${new Date(`${p.data}T12:00:00Z`).toLocaleDateString('pt-BR')}. Qual tema você vai revisar hoje?`, rodape: 'Adicione o adesivo de contagem regressiva ↓' }], legenda: 'Story com contagem regressiva.' };
}

// ---------------------------------------------------------------- Davi: roteiros de Reels
export const GANCHOS = {
  numero: (t) => `O Inep cobrou ${t.tema} em ${t.provas.size} provas diferentes.`,
  pergunta: (t) => `Você sabe o detalhe de ${t.tema} que mais derruba candidato?`,
  erro: (t) => `O erro mais comum em ${t.tema} na prova (e como não cair nele).`,
  verdade: (t) => `Se você não domina ${t.tema}, está deixando ponto na mesa.`,
};
const TIPOS_GANCHO = Object.keys(GANCHOS);

function roteiroPegadinha(config, t, tipoGancho, aj) {
  const q = escolher(t.questoes.filter((x) => resumoDe(config, x.id) && !(x.figuras || []).length), t.tema) || t.questoes[0];
  const resumo = resumoDe(config, q.id);
  const caso = corta(q.enunciado.split(/(?<=\.)\s/)[0] || q.enunciado, 160);
  const chave = corta(resumo.split(/(?<=\.)\s/)[0] || resumo, 200);
  return {
    gancho: GANCHOS[tipoGancho](t), tipoGancho,
    roteiro: [
      { tempo: '0–3s', fala: GANCHOS[tipoGancho](t), tela: 'Texto grande na tela + seu rosto' },
      { tempo: '3–12s', fala: `Olha esse caso do ${prova(q)}: ${caso}`, tela: 'Grave a tela da questão na plataforma' },
      { tempo: '12–30s', fala: chave, tela: 'Destaque a alternativa certa' },
      { tempo: '30–40s', fala: `Na prova, lembre: ${corta(resumo.split(/(?<=\.)\s/)[1] || chave, 150)}`, tela: 'Resumo em 1 frase na tela' },
      { tempo: '40–45s', fala: `Salva esse vídeo e comenta ${aj.palavraChave} para treinar as outras questões desse tema.`, tela: 'Chamada na tela' },
    ],
    legenda: [`${t.tema}: o Inep adora cobrar. 🎯`, '', `Caiu em ${[...t.provas].slice(0, 4).join(', ')}${t.provas.size > 4 ? ' e outras' : ''}.`, '', `Comente ${aj.palavraChave} para treinar as questões desse tema.`, `Fonte: Inep, ${prova(q)}, questão ${q.numero}.`, hashtags(t.area, ['#dicasdeprova'])].join('\n'),
    questaoId: q.id,
  };
}

function roteiroConduta(config, q, aj) {
  const resumo = resumoDe(config, q.id);
  const frases = resumo.split(/(?<=\.)\s/);
  return {
    gancho: `Conduta em 30 segundos: ${q.tema || q.especialidade}.`, tipoGancho: 'conduta',
    roteiro: [
      { tempo: '0–3s', fala: `Conduta em 30 segundos: ${q.tema || q.especialidade}.`, tela: 'Título na tela' },
      { tempo: '3–12s', fala: corta(q.enunciado, 200), tela: 'Caso resumido em tópicos' },
      { tempo: '12–25s', fala: `A resposta é ${q.gabarito}: ${corta(q.alternativas['ABCDE'.indexOf(q.gabarito)], 140)}`, tela: 'Alternativa certa em destaque' },
      { tempo: '25–35s', fala: corta(frases[0] || resumo, 200), tela: 'Por quê, em 1 frase' },
      { tempo: '35–40s', fala: `Comenta ${aj.palavraChave} que eu te mando mais questões assim.`, tela: 'Chamada' },
    ],
    legenda: [`Conduta que o Inep cobra: ${q.tema || q.especialidade}. ⏱️`, '', `Questão ${q.numero} do ${prova(q)}.`, `Comente ${aj.palavraChave} para receber mais.`, `Fonte: Inep, ${prova(q)}.`, hashtags(q.area, ['#condutamedica'])].join('\n'),
    questaoId: q.id,
  };
}

/** Davi aprende: engajamento médio (salvos + comentários + compartilhamentos por alcance) de cada tipo de gancho. */
export function aprendizadoDavi(pecas) {
  const por = {};
  for (const p of pecas) {
    const m = p.metricas || {}; const tipo = p.conteudo?.tipoGancho;
    if (!tipo || !m.alcance) continue;
    const e = ((m.salvos || 0) + (m.comentarios || 0) + (m.compartilhamentos || 0)) / m.alcance;
    (por[tipo] ||= { tipo, posts: 0, soma: 0 }).posts += 1; por[tipo].soma += e;
  }
  return Object.values(por).map((x) => ({ tipo: x.tipo, posts: x.posts, engajamento: Math.round((x.soma / x.posts) * 1000) / 10 })).sort((a, b) => b.engajamento - a.engajamento);
}

// ---------------------------------------------------------------- Rafael: a pauta da semana
/**
 * Monta as peças da semana (segunda a sexta). Áreas em rodízio pela semana; questões nunca repetem (usadas).
 * Devolve [{ dia, slot, formato, pilar, titulo, agente, conteudo }].
 */
export function pautaDaSemana(config, { segunda, usadas = new Set(), ajustes = AJUSTES_PADRAO, planos = null, aprendizado = [] }) {
  const aj = { ...AJUSTES_PADRAO, ...ajustes };
  const n = Math.floor(new Date(`${segunda}T12:00:00Z`).getTime() / (7 * DIA));
  const area = (k) => AREAS[(n + k) % AREAS.length];
  const ganchoBom = aprendizado.filter((a) => a.posts >= 3)[0]?.tipo;
  const gancho = (k) => (ganchoBom && k % 2 === 0 ? ganchoBom : TIPOS_GANCHO[(n + k) % TIPOS_GANCHO.length]);
  const usar = (q) => { if (q) usadas.add(q.id); return q; };
  const pecas = [];
  const dias = [0, 1, 2, 3, 4].map((i) => somaDias(segunda, i));

  // Segunda: questão comentada (carrossel) + enquete com outra questão
  const q1 = usar(questaoParaPost(config, { area: area(0), usadas, chave: `${segunda}-q1` }));
  if (q1) pecas.push({ dia: dias[0], slot: 'feed1', formato: 'carrossel', pilar: 'Questão comentada', titulo: `Questão comentada · ${q1.especialidade}`, agente: 'copy_imagem', conteudo: carrosselQuestao(config, q1, aj) });
  const qs1 = usar(questaoParaPost(config, { area: area(0), tipo: 'conduta', usadas, chave: `${segunda}-s1` }));
  if (qs1) pecas.push({ dia: dias[0], slot: 'story1', formato: 'story', pilar: 'Enquete', titulo: `Enquete · ${qs1.especialidade}`, agente: 'copy_imagem', conteudo: storyEnquete(qs1) });

  // Terça: Reels "o Inep adora cobrar"
  const temas = temasRecorrentes(config, area(1)).filter((t) => t.questoes.some((q) => !usadas.has(q.id)));
  const t2 = escolher(temas.slice(0, 12), `${segunda}-t2`);
  if (t2) { const r = roteiroPegadinha(config, t2, gancho(1), aj); usadas.add(r.questaoId); pecas.push({ dia: dias[1], slot: 'feed1', formato: 'reels', pilar: 'O Inep adora cobrar', titulo: `Reels · ${t2.tema}`, agente: 'copy_video', conteudo: r }); }
  pecas.push({ dia: dias[1], slot: 'story1', formato: 'story', pilar: 'Rotina', titulo: 'Contagem / caixinha', agente: 'copy_imagem', conteudo: storyContagem(aj, dias[1]) });

  // Quarta: Raio-X da área
  pecas.push({ dia: dias[2], slot: 'feed1', formato: 'carrossel', pilar: 'Raio-X da prova', titulo: `Raio-X · ${CURTO[area(2)]}`, agente: 'copy_imagem', conteudo: carrosselRaioX(config, area(2), aj) });

  // Quinta: Reels conduta em 30 segundos
  const q4 = usar(questaoParaPost(config, { area: area(3), tipo: 'conduta', usadas, chave: `${segunda}-q4` }));
  if (q4) pecas.push({ dia: dias[3], slot: 'feed1', formato: 'reels', pilar: 'Conduta em 30 segundos', titulo: `Reels · conduta em ${q4.especialidade}`, agente: 'copy_video', conteudo: roteiroConduta(config, q4, aj) });
  const qs4 = usar(questaoParaPost(config, { area: area(3), usadas, chave: `${segunda}-s4` }));
  if (qs4) pecas.push({ dia: dias[3], slot: 'story1', formato: 'story', pilar: 'Enquete', titulo: `Enquete · ${qs4.especialidade}`, agente: 'copy_imagem', conteudo: storyEnquete(qs4) });

  // Sexta: produto (sem promessa de aprovação) + contagem
  pecas.push({ dia: dias[4], slot: 'feed1', formato: 'carrossel', pilar: 'Produto', titulo: PRODUTO[n % PRODUTO.length].titulo, agente: 'copy_imagem', conteudo: carrosselProduto(n, aj, planos) });
  pecas.push({ dia: dias[4], slot: 'story1', formato: 'story', pilar: 'Rotina', titulo: 'Contagem / caixinha', agente: 'copy_imagem', conteudo: storyContagem(aj, dias[4]) });

  const hor = aj.horarios || AJUSTES_PADRAO.horarios;
  return pecas.map((p) => ({ ...p, horario: p.formato === 'story' ? hor.stories[0] : hor.feed[p.formato === 'reels' ? 1 : 0] || hor.feed[0] }));
}

// ---------------------------------------------------------------- Sofia: respostas prontas
// Primeira letra minúscula só quando a palavra não é sigla (ENAMED, SUS).
const minuscula = (t) => (/^[A-ZÀ-Ú][a-zà-ú]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

export function respostasSofia(planos, aj = AJUSTES_PADRAO) {
  const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const lista = planos?.planos || [];
  const lim = planos?.limitesGratis || {};
  const site = aj.site || 'o link da bio';
  const linhaPlano = (p) => `• ${p.nome}: ${brl(p.valorCentavos)}${p.parcelasMax > 1 ? ` (até ${p.parcelasMax}x no cartão)` : ''}${p.para ? `, ${minuscula(p.para.replace(/\.$/, ''))}` : ''}`;
  const por = (id) => lista.find((p) => p.id === id);
  return [
    { chave: 'preço, valor, quanto custa', pergunta: 'Quanto custa?', resposta: `Oi! Temos um plano gratuito para você testar e estes planos completos:\n${lista.map(linhaPlano).join('\n')}\n\nPagamento por Pix, cartão ou boleto. Quer que eu te indique o melhor para a sua prova?` },
    { chave: 'grátis, gratuito, testar', pergunta: 'Tem teste grátis?', resposta: `Tem sim! No plano gratuito você faz ${lim.questoesDia || 25} questões oficiais por dia, ${lim.simuladosMes || 1} simulado por mês, a primeira aula de cada módulo e uma estação da 2ª etapa por área, além do simulado nacional. É só criar a conta em ${site}.` },
    { chave: 'enamed, 4º ano, quarto ano', pergunta: 'Estou no 4º ano, serve para mim?', resposta: por('enamed-4ano') ? `Serve! O ${por('enamed-4ano').nome} (${brl(por('enamed-4ano').valorCentavos)}) foi feito para quem vai fazer o ENAMED no 4º ano: trilha pelo que mais cai, questões oficiais comentadas e simulados.` : 'Serve! A trilha começa pelo que mais cai no ENAMED.' },
    { chave: 'revalida, 2ª etapa, estações, habilidades', pergunta: 'Tem preparação para a 2ª etapa do Revalida?', resposta: `Tem! São estações oficiais do Inep e casos autorais, com paciente simulado (inclusive por voz), impressos e correção pelo checklist (PEP). Também dá para treinar em dupla com um colega.${por('segunda-etapa') ? ` O plano ${por('segunda-etapa').nome} sai por ${brl(por('segunda-etapa').valorCentavos)}.` : ''}` },
    { chave: 'diferença, qual plano, melhor plano', pergunta: 'Qual a diferença entre os planos?', resposta: `Resumindo:\n${lista.map((p) => `• ${p.nome}: ${(p.itens || []).slice(0, 2).join('; ')}`).join('\n')}\n\nMe conta qual prova e quando você faz que eu te indico o ideal.` },
    { chave: 'simulado nacional, ranking', pergunta: 'Como funciona o simulado nacional?', resposta: 'É gratuito: você faz o caderno com tempo de prova dentro do período da edição, recebe a nota na hora e vê sua posição no ranking geral e no da sua faculdade.' },
    { chave: 'cancelar, reembolso, devolução', pergunta: 'Posso cancelar?', resposta: 'Pode. Você tem até 7 dias depois da confirmação do pagamento para desistir e receber o valor integral de volta (direito de arrependimento, art. 49 do Código de Defesa do Consumidor). É só pedir pela sua conta ou por aqui.' },
    { chave: 'pagamento, pix, cartão, boleto, parcela', pergunta: 'Quais as formas de pagamento?', resposta: `Pix (liberação na hora), cartão de crédito${lista.some((p) => p.parcelasMax > 1) ? ` em até ${Math.max(...lista.map((p) => p.parcelasMax))}x` : ''} e boleto.` },
    { chave: 'aprovação, garantia, passar', pergunta: 'Vocês garantem a aprovação?', resposta: 'Ninguém pode garantir aprovação, e desconfie de quem promete. O que a gente garante é método: estudar pelo que mais cai, treinar com questões oficiais comentadas e medir sua evolução nos simulados.' },
    { chave: 'espanhol, paraguai, bolívia, argentina, exterior', pergunta: 'Sou formado no exterior, tem em espanhol?', resposta: 'Tem! A interface, as aulas e os flashcards têm versão em espanhol. As questões ficam em português, como na prova do Inep, e os comentários ajudam a fixar os termos.' },
  ];
}
