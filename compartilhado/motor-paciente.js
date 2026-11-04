// Paciente simulado gratuito: responde ao que o candidato pergunta usando só o roteiro da estação,
// entrega impressos de exame quando pedidos e sugere a avaliação pelo PEP. Não usa IA nem tem custo.
// Roda no servidor (o roteiro nunca vai para o navegador do candidato) e nos testes locais.
import { impressoPorChave } from './estacoes.js';

export function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const VAZIAS = new Set(`a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela para pra pro com sem que se
e ou ao aos the voce senhor senhora sr sra dona seu sua seus suas meu minha tem teve ter esta estao isso esse essa este
algum alguma alguns algumas como qual quais quando onde quanto muito pouco mais menos ja ainda tambem sobre entre apos
desde ate foi era ser sao vai vou pode poderia gostaria queria quer fale conte diga me nos lhe dele dela eles elas
doutor doutora favor bom boa dia tarde noite ola oi sim nao`.split(/\s+/));

const radical = (p) => (p.length > 5 ? p.slice(0, 5) : p);
export function radicais(t) {
  return new Set(normalizar(t).split(' ').filter((p) => p.length >= 3 && !VAZIAS.has(p)).map(radical));
}

const temChave = (n, c) => {
  const k = normalizar(c);
  if (!k) return false;
  return k.includes(' ') ? ` ${n} `.includes(` ${k}`) : new RegExp(`(^| )${k}`).test(n);
};

// Assuntos da anamnese: marcam a pergunta e cada item do roteiro, para casar "quando começou?" com "há 3 meses…".
const ASSUNTOS = {
  inicio: ['quando', 'comec', 'inicio', 'inicia', 'ha quanto', 'quanto tempo', 'desde quando', 'ha ', 'faz quanto'],
  local: ['onde', 'local', 'lugar', 'regiao', 'aponta', 'lado'],
  irradiacao: ['irradi', 'espalh', 'vai para', 'corre para', 'migra'],
  intensidade: ['intens', 'forte', 'fraca', 'nota', 'escala', 'zero a dez', '0 a 10'],
  carater: ['tipo de dor', 'como e a dor', 'aperto', 'pontada', 'queima', 'colica', 'pressao no', 'caracter', 'jeito'],
  fatores: ['melhor', 'pior', 'alivi', 'agrava', 'piora', 'melhora', 'passa com', 'cede'],
  evolucao: ['evolu', 'progress', 'aument', 'piorando', 'constante', 'continua', 'frequen', 'vezes'],
  febre: ['febre', 'temperatura', 'calafri', 'sudorese', 'suor', 'febril'],
  digestivo: ['nause', 'enjo', 'vomit', 'diarr', 'fezes', 'evacu', 'intestin', 'coco', 'apetite', 'comer', 'aliment', 'barriga', 'abdom', 'azia'],
  urinario: ['urin', 'xixi', 'diurese', 'ardencia', 'disuri', 'mijar'],
  respiratorio: ['falta de ar', 'dispne', 'cansac', 'tosse', 'catarro', 'escarro', 'chiado', 'respir', 'fôlego', 'folego'],
  cardiovascular: ['palpit', 'coracao', 'dor no peito', 'peito', 'inchac', 'edema', 'incha'],
  neurologico: ['cabeca', 'cefale', 'tontu', 'desmai', 'convuls', 'formig', 'fraqueza', 'visao', 'enxerg', 'memoria', 'confus'],
  pele: ['pele', 'mancha', 'coceira', 'prurido', 'amarel', 'icteric', 'lesao', 'lesoes', 'ferida', 'caroco'],
  peso: ['peso', 'emagrec', 'engord', 'perdeu', 'ganhou'],
  humor: ['sono', 'dormir', 'humor', 'triste', 'ansied', 'animo', 'nervos', 'estresse', 'preocup'],
  comorbidades: ['doenca', 'comorb', 'problema de saude', 'pressao alta', 'hipertens', 'diabet', 'acompanhament', 'tratament', 'cronic'],
  medicacoes: ['remedio', 'medicac', 'medicam', 'toma algum', 'usa algum', 'uso continuo', 'anticoncep', 'pilula', 'tomando'],
  alergias: ['alerg'],
  cirurgias: ['cirurg', 'operou', 'operac', 'internad', 'internac', 'hospital'],
  habitos: ['fuma', 'cigarr', 'tabag', 'bebe', 'alcool', 'bebida', 'etilis', 'droga', 'maconha', 'cocain', 'atividade fisica', 'exercic'],
  familia: ['famil', 'pai', 'mae', 'parente', 'irma', 'heredit', 'filho', 'avo'],
  social: ['trabalh', 'profiss', 'ocupac', 'mora', 'casa', 'casad', 'esposa', 'marido', 'renda', 'escola', 'saneament', 'agua', 'vive'],
  gineco: ['menstru', 'regra', 'ciclo', 'dum', 'gravid', 'gestac', 'gesta', 'parto', 'aborto', 'relac', 'sexual', 'preservativ', 'contracep', 'corriment', 'sangra', 'pre natal', 'prenatal'],
  vacinas: ['vacin', 'cartao', 'caderneta'],
  crianca: ['nasceu', 'mamad', 'amament', 'leite', 'desenvolv', 'cresc', 'creche', 'brinca'],
  exames_previos: ['fez algum exame', 'trouxe', 'resultado', 'exames anteriores', 'ja fez exame'],
  queixa: ['o que', 'motivo', 'trouxe aqui', 'queixa', 'sentindo', 'aconteceu', 'ajudar', 'problema'],
};

function assuntos(n) {
  const s = new Set();
  for (const [a, chaves] of Object.entries(ASSUNTOS)) if (chaves.some((c) => temChave(n, c))) s.add(a);
  return s;
}

// Abreviações que o candidato costuma usar ao pedir exames.
const SINONIMOS = [
  [/\b(rx|raio x|raiox|raio-x)\b/g, 'radiografia'], [/\b(usg|us|ultrassom|ultrasom|eco)\b/g, 'ultrassonografia'],
  [/\b(ecg|eletro)\b/g, 'eletrocardiograma'], [/\b(tc)\b/g, 'tomografia'], [/\b(eas|urina 1|urina tipo 1)\b/g, 'urina'],
  [/\b(pa)\b/g, 'pressao arterial'], [/\b(fc)\b/g, 'frequencia cardiaca'], [/\b(sat|sato2|oximetria)\b/g, 'saturacao'],
  [/\bsinais vitais\b/g, 'sinais vitais geral'], [/\bexame fisico\b/g, 'exame fisico geral'],
];
const expandir = (n) => SINONIMOS.reduce((s, [re, troca]) => s.replace(re, troca), n);

const VERBOS_PEDIDO = ['quero', 'gostaria', 'preciso', 'solicit', 'pec', 'peco', 'pedir', 'pedido', 'examin', 'realiz', 'faco', 'fazer o exame', 'auscult', 'palp',
  'percu', 'inspec', 'afir', 'medir', 'verific', 'checar', 'aferir', 'avalio', 'avaliar', 'gostaria de ver', 'quero ver', 'mostrar', 'resultado do', 'resultado da'];
const ITENS_GENERICOS = new Set(['exame', 'exame', 'fisic', 'impre', 'impresso', 'gera', 'geral', 'resul', 'compl', 'compleme']);

function pedidoPorTexto(e, n, revelados) {
  const x = expandir(n);
  const anamnese = ASSUNTOS.exames_previos.some((c) => temChave(x, c)) || /\b(ja fez|fez algum|trouxe|tem algum exame)\b/.test(x);
  const pede = !anamnese && (VERBOS_PEDIDO.some((v) => temChave(x, v))
    || /\b(exame fisico|radiografia|ultrassonografia|eletrocardiograma|tomografia|ressonancia|hemograma|sinais vitais|glicemia|gasometria|laborator|bioquimic|urina|cultura|teste rapido|sorologi|impresso)/.test(x));
  if (!pede) return null;
  const rq = radicais(x);
  const candidatos = [
    ...e.exameFisico.map((it, i) => ({ chave: `f${i}`, nome: it.item, chaves: it.chaves })),
    ...e.exames.map((it, i) => ({ chave: `x${i}`, nome: it.item, chaves: it.chaves })),
  ];
  let melhor = null;
  for (const c of candidatos) {
    const ri = [...radicais(expandir(normalizar(c.nome)))].filter((r) => !ITENS_GENERICOS.has(r));
    let pontos = ri.filter((r) => rq.has(r)).length;
    if (c.chaves?.some((k) => temChave(x, k))) pontos += 2;
    if (!pontos) continue;
    const nota = pontos + (revelados.has(c.chave) ? -0.5 : 0);
    if (!melhor || nota > melhor.nota) melhor = { ...c, nota };
  }
  if (!melhor && /exame fisico|sinais vitais|examinar|examino/.test(x)) {
    // "Vou examinar o paciente": entrega o exame físico geral (ou o primeiro ainda não entregue).
    const fisicos = candidatos.filter((c) => c.chave.startsWith('f'));
    melhor = fisicos.find((c) => /geral|vitais/.test(normalizar(c.nome)) && !revelados.has(c.chave))
      || fisicos.find((c) => !revelados.has(c.chave)) || null;
  }
  return melhor ? impressoPorChave(e, melhor.chave) : { indisponivel: true };
}

const SAUDACAO = ['bom dia', 'boa tarde', 'boa noite', 'ola', 'meu nome', 'sou o doutor', 'sou a doutora', 'sou o medico', 'sou a medica', 'prazer', 'tudo bem'];
const SEM_RESPOSTA = ['Isso eu não sei dizer, doutor(a).', 'Não reparei nisso não.', 'Não, isso não.', 'Hum… acho que não.', 'Não sei responder isso.'];

/** Frase do roteiro na voz do paciente: "nega febre" vira "Nega febre." (roteiros do Inep vêm na terceira pessoa). */
export function falaDoRoteiro(resposta) {
  const t = String(resposta || '').trim().replace(/[;,]\s*$/, '');
  if (!t) return '';
  const frase = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(frase) ? frase : `${frase}.`;
}

/**
 * Responde a uma fala do candidato.
 * Retorna { de: 'paciente' | 'examinador', texto, chave? } — chave identifica o item do roteiro (a3) ou o impresso (f0, x1).
 */
export function responder(e, fala, revelados = new Set()) {
  const n = normalizar(fala);
  if (!n) return { de: 'paciente', texto: '…' };
  const pedido = pedidoPorTexto(e, n, revelados);
  if (pedido?.indisponivel) return { de: 'examinador', texto: 'Este exame não está disponível nesta estação.' };
  if (pedido) return { de: 'examinador', texto: pedido.texto, chave: pedido.chave, rotulo: pedido.rotulo, imagem: pedido.imagem };

  const roteiro = e.paciente?.roteiro || [];
  const aq = assuntos(n);
  const rq = radicais(n);
  const notas = roteiro.map((r, i) => {
    const at = assuntos(normalizar(r.topico));
    const ar = assuntos(normalizar(r.resposta));
    const rt = radicais(r.topico);
    const rr = radicais(r.resposta);
    let pontos = 0;
    // O assunto do tópico vale mais que uma palavra solta da resposta ("alergia a remédio" não responde "usa remédio?").
    for (const a of aq) pontos += (at.has(a) ? 3 : ar.has(a) ? 1.5 : 0) * (a === 'queixa' ? 0.4 : 1);
    for (const x of rq) { if (rt.has(x)) pontos += 2; else if (rr.has(x)) pontos += 1; }
    if (r.chaves?.some((k) => temChave(n, k))) pontos += 4;
    return { i, pontos: pontos - (revelados.has(`a${i}`) ? 0.5 : 0) };
  }).filter((x) => x.pontos >= 2).sort((a, b) => b.pontos - a.pontos);

  const soSaudacao = SAUDACAO.some((s) => n.includes(s)) && ![...aq].some((a) => a !== 'queixa') && !/\?/.test(String(fala));
  if (soSaudacao) return { de: 'paciente', texto: e.paciente?.abertura || 'Bom dia, doutor(a).' };
  if (notas.length) {
    const top = notas[0];
    // Pergunta dupla ("tem alguma doença ou toma remédio?"): junta o segundo item se for quase tão bom.
    const juntos = [top, ...notas.slice(1, 2).filter((x) => x.pontos >= Math.max(3, top.pontos * 0.8))];
    return {
      de: 'paciente',
      texto: juntos.map((x) => falaDoRoteiro(roteiro[x.i].resposta)).join(' '),
      chave: `a${top.i}`,
      chaves: juntos.map((x) => `a${x.i}`),
    };
  }
  if (SAUDACAO.some((s) => n.includes(s))) return { de: 'paciente', texto: e.paciente?.abertura || 'Bom dia, doutor(a).' };
  return { de: 'paciente', texto: SEM_RESPOSTA[n.length % SEM_RESPOSTA.length] };
}

/** Resposta de um item escolhido na lista do modo roteiro (a0, f1, x2). */
export function revelar(e, chave) {
  const m = /^a(\d+)$/.exec(String(chave || ''));
  if (m) {
    const r = e.paciente?.roteiro?.[Number(m[1])];
    return r ? { de: 'paciente', texto: falaDoRoteiro(r.resposta), chave, rotulo: r.topico } : null;
  }
  const imp = impressoPorChave(e, chave);
  return imp ? { de: 'examinador', texto: imp.texto, chave, rotulo: imp.rotulo, imagem: imp.imagem } : null;
}

/* -------------------------------------------------------------- sugestão de avaliação */

const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
const numero = (p) => (/^\d+$/.test(p) ? Number(p) : NUMEROS[p]);

/** Subitens enumerados de um critério: "(1) dor; (2) febre OU calafrios" ou "Caracteriza a dor: início, tipo e irradiação". */
export function subitens(descricao) {
  const d = String(descricao || '');
  const enumerados = [...d.matchAll(/\(\s*\d+\s*\)\s*([^;()]+?)(?=\s*(?:;|\(\s*\d+\s*\)|$|\.\s*$))/g)].map((m) => m[1]);
  let itens = enumerados;
  if (!itens.length) {
    const parenteses = [...d.matchAll(/\(([^()]*,[^()]*)\)/g)].map((m) => m[1]).find((x) => !/pelo menos|minimo/i.test(x));
    if (parenteses) itens = parenteses.split(/,|;|\s+e\s+(?=[^,]*$)/).map((x) => x.trim()).filter((x) => x.length > 2);
  }
  if (!itens.length) {
    const dois = d.indexOf(':');
    if (dois < 0) return [];
    const resto = d.slice(dois + 1).replace(/\(.*?\)/g, '').replace(/\.\s*$/, '');
    itens = resto.split(/,|;|\s+e\s+(?=[^,]*$)/).map((x) => x.trim()).filter((x) => x.length > 2);
    if (itens.length < 2) return [];
  }
  return itens.map((x) => x.replace(/^\s*e\s+|[,.]\s*e?\s*$/g, '').trim()).filter(Boolean)
    .map((x) => x.split(/\s+OU\s+|\s+ou\s+|\//).map((a) => a.trim()).filter(Boolean));
}

/** Quantos subitens bastam para "adequado", lido do texto do critério ("seis ou mais", "as duas ações", "pelo menos 4"). */
function minimoAdequado(c, total) {
  const fontes = [c.integral, c.descricao].map(normalizar);
  for (const f of fontes) {
    let m = /(?:pelo menos|no minimo|minimo de)\s+(\w+)/.exec(f) || /(\w+)\s+ou mais/.exec(f)
      || /(?:realiza|investiga|pergunta|cita|orienta|solicita|menciona|aborda)\s+(?:as |os )?(\w+)\s+(?:acoes|itens|perguntas|orientacoes|aspectos|exames)/.exec(f);
    if (m && numero(m[1])) return Math.min(total, numero(m[1]));
    if (/todas|todos/.test(f)) return total;
  }
  return total;
}

/**
 * Sugestão de nível para cada critério com subitens verificáveis no texto da consulta.
 * Critérios de manobra (exame no manequim) ou sem lista ficam sem sugestão: o aluno marca.
 */
export function sugerirAvaliacao(e, { falas = [], conclusao = '', revelados = [] } = {}) {
  const rotulos = revelados.map((k) => {
    const m = /^a(\d+)$/.exec(k);
    if (m) return e.paciente?.roteiro?.[Number(m[1])]?.topico || '';
    return impressoPorChave(e, k)?.rotulo || '';
  });
  const evidencia = normalizar([...falas, conclusao, ...rotulos].join(' '));
  const rad = radicais(evidencia);
  const assuntosEvidencia = assuntos(evidencia);
  // Itens de comunicação têm sinônimos próprios: "sou a médica" identifica-se; "bom dia" cumprimenta.
  const COMUNICACAO = [
    [/identific|apresent/, /(sou (o|a) (dr|doutor|doutora|medic)|meu nome|me chamo|sou o residente|sou a residente)/],
    [/cumpriment|saud/, /(bom dia|boa tarde|boa noite|ola|prazer|tudo bem)/],
    [/nome do pacient|pergunta (seu|o) nome|identifica (o|a) pacient|nome/, /(seu nome|como (o senhor|a senhora|voce) se chama|qual (o|e o) (seu )?nome|como se chama)/],
  ];
  const presente = (alt) => {
    const na = normalizar(alt);
    for (const [termo, frase] of COMUNICACAO) if (termo.test(na) && frase.test(evidencia)) return true;
    const r = [...radicais(alt)].filter((x) => x.length >= 3);
    if (!r.length) return false;
    // Termo técnico curto ("dispneia") também vale pelo sinônimo leigo ("falta de ar") do mesmo assunto.
    if (r.length <= 2 && [...assuntos(normalizar(alt))].some((a) => a !== 'queixa' && assuntosEvidencia.has(a) && ASSUNTOS[a].some((c) => temChave(normalizar(alt), c)))) {
      const n = normalizar(alt);
      if ([...assuntosEvidencia].some((a) => ASSUNTOS[a].some((c) => temChave(n, c)) && ASSUNTOS[a].some((c) => temChave(evidencia, c)))) return true;
    }
    const achados = r.filter((x) => rad.has(x)).length;
    return achados === r.length || (r.length >= 3 && achados >= r.length - 1);
  };
  const sugestoes = {};
  for (const c of e.pep) {
    if (/manequim|manobra|demonstr|tecnica/.test(normalizar(c.descricao))) continue;
    const subs = subitens(c.descricao);
    if (subs.length < 2) continue;
    const cobertos = subs.filter((alts) => alts.some(presente)).length;
    const minimo = minimoAdequado(c, subs.length);
    const nivel = cobertos >= minimo ? 'adequado' : cobertos > 0 && c.pontos.parcial !== null ? 'parcial' : 'inadequado';
    sugestoes[c.id] = { nivel, cobertos, total: subs.length, minimo };
  }
  return sugestoes;
}
