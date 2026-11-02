// Teste de ponta a ponta do app em dist/, num Chromium local.
// Imita o visualizador: a página é envolvida no esqueleto padrão; cdnjs e Google Fonts são servidos de cópias locais.
// Uso: node teste/rodar.mjs [saida-das-capturas]
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const app = new URL('..', import.meta.url).pathname;
const saida = process.argv[2] || `${app}teste/capturas`;
mkdirSync(saida, { recursive: true });

const ESQUELETO = (corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${corpo}</body></html>`;

const TIPOS = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript' };
const erros = [];

async function rotas(contexto) {
  await contexto.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.hostname === 'app.local') {
      const caminho = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const arquivo = `${app}dist${caminho}`;
      if (!existsSync(arquivo)) return rota.fulfill({ status: 404, body: 'não encontrado' });
      let corpo = readFileSync(arquivo);
      if (caminho === '/index.html') corpo = ESQUELETO(corpo.toString());
      return rota.fulfill({ status: 200, contentType: TIPOS[caminho.slice(caminho.lastIndexOf('.'))] || 'application/octet-stream', body: corpo });
    }
    if (url.hostname === 'cdnjs.cloudflare.com') {
      const nome = url.pathname.endsWith('react-dom.production.min.js') ? 'react-dom/umd/react-dom.production.min.js' : 'react/umd/react.production.min.js';
      return rota.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${app}node_modules/${nome}`) });
    }
    if (url.hostname === 'fonts.googleapis.com') {
      return rota.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(`${app}teste/cache/fonts.css`) });
    }
    if (url.hostname === 'fonts.gstatic.com') {
      const h = createHash('md5').update(`${url.href}\n`).digest('hex').slice(0, 16);
      const f = `${app}teste/cache/${h}.woff2`;
      return existsSync(f) ? rota.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(f) }) : rota.abort();
    }
    return rota.abort();
  });
}

// Simula o visualizador do Claude (capacidade `sample`) com respostas fixas, para testar o modo com IA.
const SAMPLE_FALSO = () => {
  const sample = async (entrada, opcoes = {}) => {
    const ultima = Array.isArray(entrada) ? entrada[entrada.length - 1].content : String(entrada);
    const text = /^Solicito/.test(ultima) ? '[Examinador] PA 150 x 90 mmHg, FC 98 bpm, SatO2 95%.' : 'Começou faz uma hora, doutor. É um aperto no peito.';
    await new Promise((r) => setTimeout(r, 150));
    opcoes.onText?.({ text, delta: text });
    return { text, truncated: false, modelTierApplied: 'quick' };
  };
  sample.json = async () => ({
    itens: [{ id: 'apresentacao', nivel: 'adequado', comentario: 'Apresentou-se e explicou o atendimento.' },
      { id: 'caracteriza-dor', nivel: 'parcial', comentario: 'Perguntou início e tipo, faltou irradiação.' }],
    devolutiva: 'Você começou bem e foi direto à dor. O que mais custou pontos foi não pedir o ECG em 10 minutos. Dica: ECG antes de tudo.',
  });
  window.claude = { use: async (nome) => (nome === 'sample' ? sample : null) };
};

// Simula a capacidade `room` entre abas do mesmo contexto, para testar o treino em dupla.
const ROOM_FALSO = () => {
  const eu = Math.random().toString(36).slice(2, 10);
  const remetente = (peer, isMe) => ({ peer, by: null, isMe, sameTab: isMe, kind: 'viewer', guest: false });
  const join = async (nome) => {
    const canal = new BroadcastChannel(`sala-${nome}`);
    let presenca = {};
    const outros = new Map();
    const ouvintesPeers = new Set();
    const topicos = {};
    const lista = () => [{ ...remetente(eu, true), presence: presenca, updatedAt: Date.now() }, ...outros.values()];
    let foto = lista();
    const avisar = () => { foto = lista(); ouvintesPeers.forEach((f) => f({ peers: foto, joined: [], left: [], updated: [] })); };
    canal.onmessage = ({ data: m }) => {
      if (m.t === 'p') {
        outros.set(m.peer, { ...remetente(m.peer, false), presence: m.p, updatedAt: Date.now() });
        avisar();
        if (m.ola) canal.postMessage({ t: 'p', peer: eu, p: presenca });
      } else if (m.t === 'e') (topicos[m.topic] || []).forEach((f) => f({ ...remetente(m.peer, false), topic: m.topic, data: m.data }));
    };
    canal.postMessage({ t: 'p', peer: eu, p: presenca, ola: true });
    return {
      name: nome,
      presence: async (patch) => {
        presenca = { ...presenca };
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete presenca[k]; else presenca[k] = v; }
        canal.postMessage({ t: 'p', peer: eu, p: presenca });
        avisar();
      },
      peers: () => foto,
      onPeers: (f) => { ouvintesPeers.add(f); setTimeout(() => f({ peers: foto, joined: foto, left: [], updated: [] })); return () => ouvintesPeers.delete(f); },
      emit: async (topic, data) => {
        canal.postMessage({ t: 'e', topic, data, peer: eu });
        (topicos[topic] || []).forEach((f) => f({ ...remetente(eu, true), topic, data }));
      },
      on: (topic, f) => { (topicos[topic] ||= []).push(f); return () => { topicos[topic] = topicos[topic].filter((x) => x !== f); }; },
      connected: () => true,
      onConnection: (f) => { setTimeout(() => f(true)); return () => {}; },
      leave: async () => canal.close(),
    };
  };
  // O saguão (a sala base) também tem presença: é onde as salas abertas são anunciadas.
  let saguao = null;
  window.claude = { use: async (n) => (n === 'room' ? (saguao ||= { ...(await join('__saguao')), join }) : null) };
};

async function novaPagina(navegador, { largura = 1280, altura = 900, escuro = false, comIA = false, gratis = false } = {}) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: altura }, colorScheme: escuro ? 'dark' : 'light',
    deviceScaleFactor: 1 });
  await rotas(contexto);
  // Os roteiros gerais rodam com acesso completo; o plano gratuito tem um roteiro próprio.
  if (!gratis) await contexto.addInitScript(() => { window.__rxAcessoTotal = true; });
  if (comIA) await contexto.addInitScript(SAMPLE_FALSO);
  const pagina = await contexto.newPage();
  pagina.on('console', (m) => m.type() === 'error' && erros.push(`console: ${m.text()}`));
  pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  return pagina;
}

async function verificarLargura(pagina, nome) {
  const { sw, cw } = await pagina.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (sw > cw + 1) erros.push(`${nome}: rolagem horizontal (${sw} > ${cw})`);
}

async function foto(pagina, nome, inteira = true) {
  await pagina.waitForTimeout(250);
  await verificarLargura(pagina, nome);
  await pagina.screenshot({ path: `${saida}/${nome}.png`, fullPage: inteira });
}

const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell' });
try {
  // ---- desktop claro: fluxo completo
  const p = await novaPagina(navegador);
  await p.goto('http://app.local/');
  await p.getByRole('heading', { name: /Desafio de hoje/ }).waitFor();
  await foto(p, '01-painel-vazio');

  await p.getByRole('button', { name: 'Trilha', exact: true }).click();
  await p.getByRole('heading', { name: /Sua trilha/ }).waitFor();
  await foto(p, '00-trilha-inicio');
  await p.getByRole('button', { name: 'Início', exact: true }).click();
  await p.getByRole('button', { name: /Iniciar o desafio/ }).click();
  await p.locator('.questao').waitFor();
  await p.getByRole('radio').nth(1).click();
  await foto(p, '02-questao-escolhida', false);
  await p.getByRole('button', { name: 'Responder' }).click();
  await foto(p, '03-questao-respondida');
  // resolve o resto com o teclado
  const total = await p.locator('.contador small').innerText().then((t) => Number(t.replace('/', '')));
  for (let i = 1; i < total; i++) {
    await p.keyboard.press('Enter'); // próxima
    await p.keyboard.press(['a', 'b', 'c', 'd'][i % 4]);
    await p.keyboard.press('Enter'); // responder
  }
  await p.keyboard.press('Enter'); // ver resultado
  await p.getByRole('heading', { name: 'Sessão concluída' }).waitFor();
  await foto(p, '04-resumo-sessao');

  await p.getByRole('button', { name: 'Voltar à trilha' }).click();
  await p.locator('#trilha-data').fill('2027-03-14');
  await foto(p, '05-trilha-com-progresso');
  await p.getByRole('button', { name: 'Início', exact: true }).click();
  await foto(p, '05b-painel-com-progresso');

  await p.getByRole('button', { name: 'Questões', exact: true }).click();
  await p.getByRole('button', { name: /^GO$/ }).click();
  await p.locator('#filtro-busca').fill('sífilis');
  await foto(p, '06-banco-filtrado');
  await p.getByRole('button', { name: 'Limpar filtros' }).first().click();
  await p.locator('#filtro-figuras').check();
  await p.locator('.linha-questao').first().click();
  await p.locator('.figura').first().waitFor();
  await foto(p, '07-questao-com-figura');
  await p.locator('.figura-botao').first().click();
  await foto(p, '08-figura-ampliada', false);
  await p.keyboard.press('Escape');

  await p.getByRole('button', { name: 'Raio-X', exact: true }).click();
  await p.getByRole('heading', { name: /O que o Inep cobra/ }).waitFor();
  await foto(p, '09-raiox');

  await p.getByRole('button', { name: 'Simulado', exact: true }).click();
  await foto(p, '10-simulado-config');
  await p.getByRole('button', { name: '10', exact: true }).click();
  await p.getByRole('button', { name: /Começar ·/ }).click();
  await p.locator('.paleta').waitFor();
  for (let i = 0; i < 6; i++) {
    await p.getByRole('radio').nth(i % 4).click();
    if (i === 2) await p.getByRole('button', { name: /Marcar dúvida/ }).click();
    await p.getByRole('button', { name: /Próxima/ }).click();
  }
  await foto(p, '11-simulado-andamento', false);
  await p.reload();
  await p.locator('.paleta').waitFor(); // continua após recarregar
  await p.getByRole('button', { name: 'Entregar', exact: true }).first().click();
  await foto(p, '12-simulado-confirmar', false);
  await p.getByRole('button', { name: 'Entregar e ver resultado' }).click();
  await p.getByText('Acertos por grande área').waitFor();
  await foto(p, '13-simulado-resultado');
  await p.getByRole('button', { name: 'Corrigir questão por questão' }).click();
  await p.locator('.questao').waitFor();
  await foto(p, '14-correcao', false);

  await p.goto('http://app.local/#revisao');
  await p.getByRole('heading', { name: /revisar hoje/ }).waitFor();
  await foto(p, '15-revisao');
  await p.getByRole('button', { name: 'Desempenho', exact: true }).click();
  await foto(p, '16-desempenho');

  // ---- flashcards
  await p.goto('http://app.local/#flashcards');
  await p.getByRole('heading', { name: /Memorize o que mais cai/ }).waitFor();
  await foto(p, '50-flashcards');
  await p.getByRole('button', { name: 'Conceitos-chave' }).click();
  await p.getByRole('button', { name: /^Estudar/ }).click();
  await p.locator('.fc-cartao').waitFor();
  await foto(p, '51-flashcard-frente', false);
  await p.keyboard.press('Space');
  await p.locator('.fc-verso').waitFor();
  await foto(p, '52-flashcard-verso', false);
  await p.keyboard.press('3');
  await p.keyboard.press('Space');
  await p.keyboard.press('1');
  await p.getByRole('button', { name: 'Encerrar' }).click();
  await p.getByRole('button', { name: 'Casos das provas' }).click();
  await p.getByRole('button', { name: /^Estudar/ }).click();
  await p.keyboard.press('Space');
  await p.locator('.fc-verso').waitFor();
  await foto(p, '53-flashcard-caso', false);
  await p.getByRole('button', { name: 'Encerrar' }).click();

  // ---- prática no modo roteiro, com autoavaliação
  await p.goto('http://app.local/#pratica');
  await p.getByRole('heading', { name: /paciente simulado/ }).waitFor();
  await foto(p, '40-pratica-lista');
  await p.locator('.estacao-cartao').first().click();
  await p.getByRole('button', { name: /Iniciar estação/ }).waitFor();
  await p.waitForTimeout(400);
  await foto(p, '41-estacao-instrucoes');
  await p.locator('#modo-roteiro').check();
  await p.getByRole('button', { name: /Iniciar estação/ }).click();
  for (const nome of ['Início', 'Tipo da dor', 'Irradiação', 'Tabagismo', 'Sinais vitais', 'Eletrocardiograma de 12 derivações']) {
    await p.locator('.roteiro').getByRole('button', { name: nome, exact: true }).click();
  }
  await p.locator('#conclusao').fill('IAM com supra de ST anterior. AAS 300 mg, clopidogrel 300 mg, angioplastia primária.');
  await foto(p, '42-estacao-roteiro', false);
  await p.getByRole('button', { name: 'Encerrar estação' }).click();
  await p.getByRole('button', { name: 'Encerrar e corrigir' }).click();
  for (const grupo of await p.locator('.checklist li .segmentado').all()) await grupo.getByRole('button').nth(1).click();
  await p.getByRole('button', { name: 'Ver minha nota' }).click();
  await p.getByText('Nota da estação').waitFor();
  await foto(p, '43-estacao-resultado');

  // ---- prática com paciente por IA (sample simulado)
  const ia = await novaPagina(navegador, { comIA: true });
  await ia.goto('http://app.local/#pratica');
  await ia.locator('.estacao-cartao').first().click();
  await ia.getByText('Você digita como falaria').waitFor();
  await ia.getByRole('button', { name: /Iniciar estação/ }).click();
  await ia.locator('#fala').fill('Bom dia, sou o médico de plantão. Quando começou a dor?');
  await ia.keyboard.press('Enter');
  await ia.getByText('É um aperto no peito.').waitFor();
  await ia.getByText('Pedir exame físico ou exames').click();
  await ia.locator('.pedidos').getByRole('button', { name: 'sinais vitais' }).click();
  await ia.getByText('PA 150 x 90 mmHg, FC 98 bpm').waitFor();
  await foto(ia, '44-estacao-ia-conversa', false);
  await ia.getByRole('button', { name: 'Encerrar estação' }).click();
  await ia.getByRole('button', { name: 'Encerrar e corrigir' }).click();
  await ia.getByRole('button', { name: /Corrigir com Dr. Caio/ }).click();
  await ia.getByText('Nota da estação').waitFor();
  await foto(ia, '45-estacao-ia-resultado');

  // ---- simulador clínico sem IA (caso escrito, exames, ECG, conduta, correção, busca e treino de ECG)
  const sim = await novaPagina(navegador);
  await sim.goto('http://app.local/#simulador');
  await sim.getByRole('heading', { name: /Treine como se estivesse no plantão/ }).waitFor();
  await foto(sim, '90-simulador-inicio');
  await sim.getByRole('button', { name: /Dor torácica na UPA/ }).click();
  await sim.getByText('tô com uma dor muito forte no peito desde cedo').waitFor();
  for (const pergunta of ['Bom dia, sou o médico de plantão', 'Quando começou a dor?', 'Como é essa dor?', 'A dor vai para algum lugar?', 'Teve suor frio ou enjoo?', 'O senhor tem pressão alta ou diabetes?', 'O senhor fuma?', 'Já teve AVC ou sangramento?']) {
    await sim.locator('#fala-sim').fill(pergunta);
    await sim.keyboard.press('Enter');
  }
  await sim.getByText('vai pro braço esquerdo e pro queixo').waitFor();
  await sim.getByText('Fumo um maço por dia').waitFor();
  for (const s of ['Sinais vitais', 'Cardiovascular', 'Respiratório']) await sim.getByRole('button', { name: s, exact: true }).click();
  await sim.getByText(/PA 150 x 90 mmHg · FC 70 bpm/).waitFor();
  await sim.getByRole('tab', { name: 'Exames' }).click();
  await sim.locator('.sim-painel input').fill('troponina e ECG');
  await sim.getByRole('button', { name: 'Solicitar' }).click();
  await sim.getByText(/Troponina: Troponina I ultrassensível: 1.850/).waitFor();
  await sim.locator('.sim-ecg svg').waitFor();
  await foto(sim, '91-simulador-atendimento');
  await sim.getByRole('tab', { name: 'Conduta' }).click();
  await sim.getByLabel('IAM com supradesnivelamento do ST de parede inferior').check();
  for (const o of [/^Reperfusão: angioplastia/, /^Monitorização cardíaca/, /^ECG com derivações direitas/, /^Internar em unidade coronariana/,
    /^AAS 300 mg/, /^Clopidogrel/, /^Anticoagulação \(enoxaparina/, /^Atorvastatina/, /^Nitrato sublingual/]) await sim.getByLabel(o).check();
  await sim.getByRole('button', { name: 'Encerrar e ver correção' }).click();
  await sim.getByText('Resultado do caso').waitFor();
  await sim.locator('.sim-alerta').getByText(/nitrato derruba a pré-carga/).waitFor();
  const nota = Number((await sim.locator('.sim-nota-valor').innerText()).split('/')[0]);
  if (!(nota >= 8 && nota < 10)) erros.push(`simulador: nota inesperada ${nota}`);
  await foto(sim, '92-simulador-correcao');
  await sim.getByRole('button', { name: /Outro caso/ }).click();
  await sim.getByText('Melhor nota:', { exact: false }).first().waitFor();
  await sim.getByRole('tab', { name: /ECG/ }).click();
  await sim.getByText('Qual é o diagnóstico deste ECG?').waitFor();
  await sim.locator('.sim-opcoes .alternativa-botao').first().click();
  await sim.locator('.sim-gabarito h3').filter({ hasText: /Acertou|Resposta/ }).waitFor();
  await foto(sim, '93-simulador-ecg');
  await sim.getByRole('tab', { name: /Busca médica/ }).click();
  await sim.getByLabel('Tema médico').fill('apendicite');
  await sim.getByRole('button', { name: 'Buscar', exact: true }).click();
  await sim.locator('.sim-aula summary').first().waitFor();
  await sim.getByRole('button', { name: 'Simular 5 questões' }).click();
  await sim.locator('.sim-quiz .alternativa-botao').first().click();
  await sim.locator('.sim-quiz .sim-ia-texto').first().waitFor();
  await foto(sim, '94-simulador-busca');
  await sim.getByRole('button', { name: /Atender este caso/ }).first().click();
  await sim.getByText('tô com uma dor na barriga que não passa').waitFor();
  const simCel = await novaPagina(navegador, { largura: 390, altura: 844 });
  await simCel.goto('http://app.local/#simulador');
  await simCel.getByRole('tab', { name: /ECG/ }).click();
  await simCel.locator('.sim-ecg svg').waitFor();
  await verificarLargura(simCel, 'celular-simulador-ecg');
  await foto(simCel, '95-celular-simulador-ecg');

  // ---- celular escuro
  const m = await novaPagina(navegador, { largura: 390, altura: 844, escuro: true });
  await m.goto('http://app.local/#raiox');
  await m.getByRole('heading', { name: /O que o Inep cobra/ }).waitFor();
  await foto(m, '20-celular-raiox-escuro');
  await m.goto('http://app.local/#questoes');
  await m.locator('#filtro-figuras').check();
  await foto(m, '21-celular-banco-escuro');
  await m.locator('.linha-questao').nth(1).click();
  await m.locator('.questao').waitFor();
  await m.getByRole('radio').first().click();
  await m.getByRole('button', { name: 'Responder' }).click();
  await foto(m, '22-celular-questao-escuro');
  await m.goto('http://app.local/#trilha');
  await m.getByRole('heading', { name: /Sua trilha/ }).waitFor();
  await foto(m, '25-celular-trilha-escuro');
  await m.goto('http://app.local/#pratica');
  await m.getByRole('heading', { name: /paciente simulado/ }).waitFor();
  await foto(m, '26-celular-pratica-escuro');
  await m.goto('http://app.local/#flashcards');
  await m.getByRole('heading', { name: /Memorize o que mais cai/ }).waitFor();
  await foto(m, '27-celular-flashcards');
  await m.goto('http://app.local/#planos');
  await m.getByRole('heading', { name: 'Escolha o seu plano' }).waitFor();
  for (const valor of ['R$ 147,90', 'R$ 497,90', 'R$ 1.490']) await m.getByText(valor, { exact: true }).first().waitFor();
  await verificarLargura(m, 'celular-planos');
  await foto(m, '28-celular-planos');
  await m.goto('http://app.local/#painel');
  await foto(m, '23-celular-painel-escuro');
  // Menu lateral no celular: abre pelo ☰, navega e fecha sozinho.
  await m.getByRole('button', { name: 'Abrir menu' }).click();
  await m.locator('.casca.menu-aberto').waitFor();
  await foto(m, '23b-celular-menu-aberto', false);
  await m.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: 'Desafio', exact: true }).click();
  await m.locator('.casca:not(.menu-aberto)').waitFor();
  await m.locator('.tela-desafio').waitFor();
  // Busca do menu lateral leva ao banco de questões filtrado.
  await m.getByRole('button', { name: 'Abrir menu' }).click();
  await m.locator('#busca-lateral').fill('dengue');
  await m.locator('#busca-lateral').press('Enter');
  await m.getByRole('heading', { name: /Questões oficiais/ }).waitFor();
  await m.goto('http://app.local/#simulado');
  await m.getByRole('button', { name: /Começar prova de 5 horas/ }).click();
  await m.locator('.paleta').waitFor();
  await foto(m, '24-celular-simulado-escuro', false);

  // ---- plano gratuito: 25 questões por dia e 1 simulado por mês
  {
    const g = await novaPagina(navegador, { gratis: true });
    await g.goto('http://app.local/#painel');
    await g.getByRole('heading', { name: /Desafio de hoje/ }).waitFor(); // espera o plano do dia ser salvo antes de gravar os dados de teste
    await g.waitForTimeout(500);
    await g.evaluate(async () => {
      const qs = (await (await fetch('data/questoes.json')).json()).questoes.filter((q) => q.gabarito);
      const agora = Date.now();
      const est = { versao: 1, respostas: {}, simulados: [], simuladosIniciados: [agora] };
      for (const q of qs.slice(0, 25)) est.respostas[q.id] = [{ t: agora, escolha: q.gabarito, certa: true, origem: 'treino' }];
      localStorage.setItem('raiox-revalida:v1', JSON.stringify(est));
    });
    await g.goto('http://app.local/#simulado');
    await g.reload();
    await g.locator('.aviso-limite').first().waitFor();
    if (!(await g.getByRole('button', { name: /Começar prova de 5 horas/ }).isDisabled())) erros.push('gratuito: o 2º simulado do mês deveria estar bloqueado');
    await foto(g, '29-gratis-simulado', false);
    await g.goto('http://app.local/#questoes');
    await g.getByRole('button', { name: /Resolver|Treinar|Começar/ }).first().click();
    await g.locator('.aviso-limite').waitFor();
    if (!(await g.getByRole('button', { name: 'Responder' }).isDisabled())) erros.push('gratuito: a 26ª questão do dia deveria estar bloqueada');
    await foto(g, '29b-gratis-questoes', false);
    await g.getByRole('button', { name: 'Ver planos' }).first().click();
    await g.getByRole('heading', { name: 'Escolha o seu plano' }).waitFor();
    await g.close();
  }

  // ---- curso: módulos, aula, comentário e liberação em 90%
  const c = await novaPagina(navegador);
  await c.goto('http://app.local/#curso');
  await c.getByRole('heading', { name: 'Curso completo do ENAMED' }).waitFor();
  if ((await c.locator('.modulo-cartao').count()) !== 6) erros.push('curso: deveriam ser 6 módulos (5 áreas e SUS)');
  if (await c.locator('.modulo-cartao:disabled').count()) erros.push('curso: todos os módulos deveriam estar abertos');
  await verificarLargura(c, 'curso');
  await foto(c, '50-curso');
  await c.locator('.modulo-cartao').first().click();
  await c.getByRole('heading', { name: 'Clínica Médica', level: 1 }).waitFor();
  await foto(c, '51-modulo');
  await c.getByRole('button', { name: /Leptospirose/ }).click();
  await c.getByRole('heading', { name: 'Pegadinhas da banca' }).waitFor();
  await c.getByRole('button', { name: 'Marcar aula como concluída' }).click();
  await c.getByRole('button', { name: /Aula concluída/ }).waitFor();
  await foto(c, '52-aula');
  // Aula com figuras: queimaduras, no módulo de Cirurgia.
  {
    const f = await novaPagina(navegador);
    await f.goto('http://app.local/#curso');
    await f.getByRole('heading', { name: 'Curso completo do ENAMED' }).waitFor();
    await f.locator('.modulo-cartao').nth(1).click();
    await f.getByRole('heading', { name: 'Cirurgia', level: 1 }).waitFor();
    await f.getByRole('button', { name: /Queimaduras e trauma elétrico/ }).click();
    await f.locator('.aula-figura img').first().scrollIntoViewIfNeeded();
    await f.waitForFunction(() => [...document.querySelectorAll('.aula-figura img')].every((i) => i.complete && i.naturalWidth > 0));
    if ((await f.locator('.aula-figura').count()) !== 2) erros.push('aula de queimaduras: deveria ter 2 figuras');
    await foto(f, '52b-aula-figuras', false);
    await f.close();
  }
  // As edições ainda sem comentário escrito (2022 e 2025) entram como já respondidas, para a fila começar por uma comentada.
  await c.evaluate(async () => {
    const qs = (await (await fetch('data/questoes.json')).json()).questoes;
    const est = JSON.parse(localStorage.getItem('raiox-revalida:v1'));
    for (const q of qs) if (/_(2022|2025)-/.test(q.id) && q.area === 'Clínica Médica') est.respostas[q.id] = [{ t: Date.now(), escolha: 'A', certa: false, origem: 'treino' }];
    localStorage.setItem('raiox-revalida:v1', JSON.stringify(est));
  });
  await c.reload();
  await c.getByRole('button', { name: /Voltar ao módulo/ }).click().catch(() => {});
  await c.locator('.modulo-cartao').first().click().catch(() => {});
  await c.getByRole('button', { name: /^Responder \d+ questões/ }).click();
  await c.locator('.questao').waitFor();
  await c.getByRole('radio').nth(1).click();
  await c.getByRole('button', { name: 'Responder' }).click();
  await c.locator('.comentario, .navegacao-questao').first().waitFor();
  // Nem toda questão nova tem comentário escrito ainda: abre o detalhe só quando existe.
  if (await c.locator('.comentario-alternativas summary').count()) await c.locator('.comentario-alternativas summary').click();
  await foto(c, '53-comentario');
  // Simula o módulo 1 completo: o simulado do módulo deve liberar.
  await c.evaluate(async () => {
    const qs = (await (await fetch('data/questoes.json')).json()).questoes;
    const ct = await (await fetch('data/conteudo.json')).json();
    const est = JSON.parse(localStorage.getItem('raiox-revalida:v1'));
    const agora = Date.now();
    for (const q of qs) if (q.area === 'Clínica Médica' && !q.anulada) est.respostas[q.id] = [{ t: agora, escolha: q.gabarito, certa: true, origem: 'treino' }];
    for (const x of ct.cartoes) if (x.area === 'Clínica Médica') est.flashcards[`c:${x.id}`] = { intervalo: 1, facilidade: 2.5, proxima: agora + 864e5, vistos: 1 };
    for (const a of ct.aulas) if (a.area === 'Clínica Médica') est.aulas[a.id] = agora;
    localStorage.setItem('raiox-revalida:v1', JSON.stringify(est));
  });
  await c.goto('http://app.local/#curso');
  await c.reload();
  await c.getByRole('heading', { name: 'Curso completo do ENAMED' }).waitFor();
  await c.locator('.modulo-cartao').first().click();
  await c.getByRole('button', { name: /Começar o simulado/ }).click();
  await c.locator('.paleta').waitFor();
  await c.goto('http://app.local/#curso');
  await c.reload();
  await c.getByRole('heading', { name: 'Curso completo do ENAMED' }).waitFor();
  await foto(c, '54-curso-liberado');
  // Módulo do SUS: aula própria de princípios e diretrizes.
  await c.getByRole('button', { name: /SUS e suas diretrizes/ }).click();
  await c.getByRole('button', { name: /Princípios e diretrizes do SUS/ }).waitFor();
  await foto(c, '55-modulo-sus');
  // Desempenho: nível, conquistas e o aviso do ranking (sem a capacidade db neste teste).
  await c.goto('http://app.local/#desempenho');
  await c.reload();
  await c.getByRole('heading', { name: 'Seu nível' }).or(c.locator('.nivel-painel')).first().waitFor();
  await c.getByRole('heading', { name: 'Ranking dos alunos' }).waitFor();
  await verificarLargura(c, 'desempenho-ranking');
  await foto(c, '56-desempenho-nivel');

  // ---- discursivas da 2ª etapa: escrever, ver o padrão do Inep e se autoavaliar
  await c.goto('http://app.local/#pratica');
  await c.reload();
  await c.getByRole('button', { name: 'Treinar discursivas' }).click();
  await c.getByRole('heading', { name: 'Questões discursivas' }).waitFor();
  if ((await c.locator('.lista-discursivas li').count()) !== 5) erros.push('discursivas: deveriam ser 5 casos');
  await c.locator('.lista-discursivas button').first().click();
  await c.locator('.discursiva textarea').first().fill('Fibrilação atrial');
  await c.getByRole('button', { name: 'Entregar e ver o padrão de resposta' }).click();
  await c.getByText('Padrão de resposta do Inep').first().waitFor();
  for (const g of await c.locator('.item-discursivo .segmentado').all()) await g.getByRole('button', { name: 'Adequado', exact: true }).click();
  await c.getByText('10,0').first().waitFor();
  await c.getByRole('button', { name: 'Salvar nota no meu desempenho' }).click();
  await c.getByRole('button', { name: 'Nota salva' }).waitFor();
  await verificarLargura(c, 'discursiva');
  await foto(c, '57-discursiva');

  // ---- treino em dupla: duas abas, sala simulada com BroadcastChannel
  const ctxDupla = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  await rotas(ctxDupla);
  await ctxDupla.addInitScript(ROOM_FALSO);
  const [ana, beto] = [await ctxDupla.newPage(), await ctxDupla.newPage()];
  for (const p of [ana, beto]) {
    p.on('console', (m) => m.type() === 'error' && erros.push(`console: ${m.text()}`));
    p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  }
  await ana.goto('http://app.local/#pratica');
  await ana.getByRole('button', { name: 'Treinar em dupla' }).first().click();
  await ana.locator('#dupla-nome').fill('Ana');
  await ana.getByRole('button', { name: 'Criar sala' }).click();
  const codigo = (await ana.getByRole('heading', { name: /^Sala / }).textContent()).replace('Sala ', '').trim();
  await beto.goto('http://app.local/#pratica');
  await beto.getByRole('button', { name: 'Treinar em dupla' }).first().click();
  await beto.locator('#dupla-nome').fill('Beto');
  // Beto acha a sala da Ana em "Salas abertas agora", sem precisar do código.
  await beto.locator('.lista-salas li', { hasText: 'Ana' }).waitFor();
  await foto(beto, '69-salas-abertas');
  await beto.locator('.lista-salas li', { hasText: 'Ana' }).getByRole('button', { name: 'Treinar junto' }).click();
  await beto.getByRole('heading', { name: `Sala ${codigo}` }).waitFor();
  await ana.getByText('Beto').waitFor();
  await ana.getByRole('button', { name: 'Serei o candidato' }).click();
  await beto.getByRole('button', { name: 'Serei o paciente e examinador' }).click();
  await beto.getByRole('button', { name: /Iniciar estação de/ }).click();
  await ana.getByText('Cenário de atuação').waitFor();
  await beto.getByRole('button', { name: 'Liberar ao candidato' }).first().click();
  await ana.locator('.achados li.liberado').first().waitFor();
  await ana.locator('#dupla-fala').fill('Solicito o eletrocardiograma.');
  await ana.getByRole('button', { name: 'Enviar' }).click();
  await beto.getByText('Solicito o eletrocardiograma.').waitFor();
  await foto(ana, '70-dupla-candidato');
  await foto(beto, '71-dupla-examinador');
  for (const grupo of await beto.locator('.checklist .segmentado').all()) await grupo.getByRole('button', { name: 'Adequado', exact: true }).click();
  await beto.getByRole('button', { name: 'Encerrar e dar a nota' }).click();
  await ana.getByText('Nota da estação').waitFor();
  await foto(ana, '72-dupla-nota');

  // ---- desafio diário, cronograma semanal e metas
  {
    const d = await novaPagina(navegador);
    await d.goto('http://app.local/#painel');
    await d.getByRole('heading', { name: /Desafio de hoje/ }).waitFor(); // espera o plano do dia ser salvo antes de gravar os dados de teste
    await d.waitForTimeout(500);
    await d.evaluate(async () => {
      const qs = (await (await fetch('data/questoes.json')).json()).questoes.filter((q) => q.gabarito);
      const DIA = 86400000;
      const agora = Date.now();
      const chave = (t) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
      const est = { versao: 1, respostas: {}, desafios: {}, simulados: [], trilha: { dataProva: '', metaDiaria: 20, plano: null, rodada: 0 } };
      for (let i = 1; i <= 10; i += 1) est.desafios[chave(agora - i * DIA)] = { concluido: agora - i * DIA, feitas: 20, acertos: 12 };
      qs.slice(0, 120).forEach((q, i) => { est.respostas[q.id] = [{ t: agora - (i % 20) * DIA, escolha: i % 3 ? q.gabarito : 'Z', certa: i % 3 !== 0, origem: 'treino' }]; });
      localStorage.setItem('raiox-revalida:v1', JSON.stringify(est));
    });
    await d.goto('http://app.local/#desafio');
    await d.reload();
    await d.getByText('dias seguidos').first().waitFor();
    if (!(await d.locator('.sequencia-numero strong').innerText()).match(/^1[01]$/)) erros.push('desafio: a sequência deveria ser 10 ou 11 dias');
    if (!(await d.locator('.escada-bonus li.ganho').count())) erros.push('desafio: o bônus de 7 dias deveria aparecer como ganho');
    await foto(d, '80-desafio');
    await d.goto('http://app.local/#cronograma');
    await d.getByRole('heading', { name: 'Sua semana de estudos' }).waitFor();
    if ((await d.locator('.semana > li').count()) !== 7) erros.push('cronograma: deveria mostrar 7 dias');
    await foto(d, '81-cronograma');
    await d.getByRole('button', { name: 'Configurar estudos' }).click();
    await d.getByRole('dialog').waitFor();
    await d.getByRole('dialog').getByRole('button', { name: 'Dom', exact: true }).click();
    await d.getByRole('dialog').getByRole('button', { name: '3h', exact: true }).click();
    await foto(d, '82-configurar-estudos', false);
    await d.getByRole('button', { name: 'Salvar' }).click();
    const cfg = await d.evaluate(() => JSON.parse(localStorage.getItem('raiox-revalida:v1')).trilha.cronograma);
    if (!cfg?.diasEstudo.includes(0) || cfg.minutosDia !== 180) erros.push('cronograma: configuração não foi salva');
    await d.goto('http://app.local/#desempenho');
    await d.getByRole('heading', { name: /Metas de/ }).waitFor();
    if ((await d.locator('svg.grafico').count()) !== 2) erros.push('desempenho: deveria ter 2 gráficos de evolução');
    await foto(d, '83-metas');
    const dm = await novaPagina(navegador, { largura: 390, altura: 844 });
    await dm.goto('http://app.local/#painel');
    await dm.evaluate((e) => localStorage.setItem('raiox-revalida:v1', e), await d.evaluate(() => localStorage.getItem('raiox-revalida:v1')));
    for (const rota of ['cronograma', 'desafio', 'desempenho']) {
      await dm.goto(`http://app.local/#${rota}`);
      await dm.reload();
      await dm.locator('h1').first().waitFor();
      await foto(dm, `84-celular-${rota}`);
    }
    await d.close();
    await dm.close();
  }

  // ---- espanhol: todas as telas, sem texto faltando no dicionário
  const es = await novaPagina(navegador);
  await es.goto('http://app.local/?lang=es#painel');
  await es.getByRole('button', { name: /(Empezar|Iniciar) (el plan|el desafío|10 preguntas)/ }).waitFor();
  await foto(es, '60-es-painel');
  for (const [rota, titulo] of [['curso', 'Curso completo del ENAMED'], ['trilha', 'Su ruta hasta el ENAMED'],
    ['questoes', 'Preguntas oficiales del Inep'], ['flashcards', 'Memorice lo que más aparece'], ['simulado', 'Practique con tiempo de examen'],
    ['pratica', 'Estaciones con paciente simulado'], ['cronograma', 'Su semana de estudio'], ['raiox', 'Lo que evalúa el Inep, pregunta por pregunta'], ['desempenho', 'Su rendimiento']]) {
    await es.getByRole('navigation', { name: 'Secciones' }).getByRole('button').nth(['painel', 'desafio', 'cronograma', 'curso', 'trilha', 'simulador', 'questoes', 'flashcards', 'simulado', 'pratica', 'raiox', 'desempenho'].indexOf(rota)).click();
    await es.getByRole('heading', { name: titulo }).waitFor();
    await verificarLargura(es, `es-${rota}`);
  }
  await foto(es, '61-es-desempenho');
  await es.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Curso' }).click();
  await es.locator('.modulo-cartao').first().click();
  await es.getByRole('button', { name: /Leptospirosis/ }).click();
  await es.getByRole('heading', { name: 'Trampas del examen' }).waitFor();
  await foto(es, '62-es-aula');
  await es.getByRole('button', { name: /Volver al módulo/ }).click();
  await es.evaluate(async () => {
    const qs = (await (await fetch('data/questoes.json')).json()).questoes;
    const est = JSON.parse(localStorage.getItem('raiox-revalida:v1') || 'null') || { versao: 1, respostas: {} };
    for (const q of qs) if (/_(2022|2025)-/.test(q.id) && q.area === 'Clínica Médica') est.respostas[q.id] = [{ t: Date.now(), escolha: 'A', certa: false, origem: 'treino' }];
    localStorage.setItem('raiox-revalida:v1', JSON.stringify(est));
  });
  await es.reload();
  await es.locator('.modulo-cartao').first().click().catch(() => {});
  await es.getByRole('button', { name: /^Responder \d+ preguntas/ }).click();
  await es.getByRole('radio').first().click();
  await es.getByRole('button', { name: 'Responder' }).click();
  await es.locator('.comentario, .navegacao-questao').first().waitFor();
  await foto(es, '63-es-questao');
  await es.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Flashcards' }).click();
  await es.getByRole('button', { name: /^Estudiar/ }).click();
  await es.getByRole('button', { name: /Mostrar respuesta/ }).click();
  await es.getByRole('button', { name: /Bien/ }).click();
  await es.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Simulacro' }).click();
  await es.getByRole('button', { name: /Empezar examen de 5 horas/ }).click();
  await es.locator('.paleta').waitFor();
  await es.getByRole('button', { name: 'Entregar' }).first().click();
  await es.getByRole('button', { name: 'Entregar y ver resultado' }).click();
  await es.getByRole('button', { name: 'Corregir pregunta por pregunta' }).waitFor();
  await es.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Práctica' }).click();
  await es.locator('.estacao-cartao').first().click();
  await es.getByRole('button', { name: /Iniciar estación/ }).click();
  await es.getByRole('button', { name: 'Terminar estación' }).click();
  await es.getByRole('button', { name: 'Terminar y corregir' }).click();
  await es.getByRole('heading', { name: 'Autoevaluación' }).waitFor();
  await es.getByRole('group', { name: 'Idioma' }).getByRole('button', { name: 'PT' }).click();
  await es.getByRole('heading', { name: 'Autoavaliação' }).waitFor().catch(() => {});
  await es.getByRole('navigation', { name: 'Seções' }).waitFor();
  const faltando = await es.evaluate(() => [...(window.__semTraducao || [])]);
  if (faltando.length) erros.push(`espanhol: ${faltando.length} textos sem tradução: ${JSON.stringify(faltando.slice(0, 8))}`);
  const em = await novaPagina(navegador, { largura: 360, altura: 780 });
  await em.goto('http://app.local/?lang=es#curso');
  await em.getByRole('heading', { name: 'Curso completo del ENAMED' }).waitFor();
  await verificarLargura(em, 'es-celular-curso');
  await foto(em, '64-es-celular-curso');
  await em.goto('http://app.local/?lang=es#planos');
  await em.getByRole('heading', { name: 'Elija su plan' }).waitFor();
  await verificarLargura(em, 'es-celular-planos');

  // ---- desktop escuro
  const e = await novaPagina(navegador, { escuro: true });
  await e.goto('http://app.local/#raiox');
  await e.getByRole('heading', { name: /O que o Inep cobra/ }).waitFor();
  await foto(e, '30-raiox-escuro');
} catch (err) {
  erros.push(`falha no roteiro: ${err.message.split('\n')[0]} ${(err.stack.match(/rodar\.mjs:\d+/) || [''])[0]}`);
} finally {
  await navegador.close();
}
console.log(erros.length ? `PROBLEMAS:\n${erros.join('\n')}` : 'OK: nenhum erro de console, de página ou de largura.');
