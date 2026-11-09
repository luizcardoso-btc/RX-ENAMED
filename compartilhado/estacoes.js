// Formato das estações da prova de habilidades clínicas (2ª etapa do Revalida), usado pelo build do app,
// pelo servidor e pelos testes. Sem dependências: roda no Node e no navegador.
//
// Uma estação tem três camadas de informação, e cada pessoa vê só a sua:
//   - pública: o que aparece na lista (título, área, tempo, origem);
//   - candidato (médico): cenário, instruções e tarefas, como o impresso entregue na porta da estação;
//   - reservada (ator/examinador): roteiro do paciente, impressos de exame, diagnóstico, conduta e PEP.
// O candidato só recebe a camada reservada depois de encerrar a estação.

export const VERSAO_FORMATO = 2;
export const STATUS = ['publicada', 'revisao', 'rascunho'];
// Origem de cada critério do PEP (e da estação): nunca chamar de oficial o que não veio de documento do Inep.
export const ORIGENS = {
  oficial: 'Extraído de documento oficial do Inep',
  adaptado: 'Adaptado pedagogicamente de documento oficial',
  autoral: 'Autoral RX MED',
};
export const NIVEIS = {
  adequado: { rotulo: 'Adequado', fator: 1 },
  parcial: { rotulo: 'Parcialmente adequado', fator: 0.5 },
  inadequado: { rotulo: 'Inadequado', fator: 0 },
};
export const AREAS_ESTACAO = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia e Obstetrícia',
  'Medicina de Família e Comunidade / Saúde Coletiva'];
const MENTOR_DA_AREA = {
  'Clínica Médica': 'caio', Cirurgia: 'helena', Pediatria: 'tomas', 'Ginecologia e Obstetrícia': 'marina',
  'Medicina de Família e Comunidade / Saúde Coletiva': 'lia',
};

const arredondar = (x) => Math.round(x * 1000) / 1000;
const lista = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const texto = (x) => (typeof x === 'string' ? x.trim() : '');

/** Critério do PEP no formato completo, aceitando o formato antigo ({id, item, peso}). */
export function normalizarCriterio(c, origemPadrao = 'autoral') {
  const peso = Number(c.peso);
  const pontos = c.pontos && typeof c.pontos === 'object' ? c.pontos : {};
  return {
    id: String(c.id),
    descricao: texto(c.descricao) || texto(c.item),
    peso,
    pontos: {
      inadequado: Number(pontos.inadequado ?? 0),
      parcial: pontos.parcial === null ? null : Number(pontos.parcial ?? arredondar(peso / 2)),
      adequado: Number(pontos.adequado ?? peso),
    },
    integral: texto(c.integral) || 'Realiza o item de forma completa.',
    parcial: c.parcial === null ? null : texto(c.parcial) || 'Realiza o item de forma incompleta.',
    inadequado: texto(c.inadequado) || 'Não realiza o item.',
    evidencia: texto(c.evidencia),
    referencia: texto(c.referencia),
    critico: c.critico === true,
    origem: ORIGENS[c.origem] ? c.origem : origemPadrao,
  };
}

/** Estação no formato v2. Estações antigas (v1) ganham os campos novos com valores seguros, sem mudar o id. */
export function normalizarEstacao(e) {
  const origem = ORIGENS[e.origem] ? e.origem : 'autoral';
  const paciente = e.paciente && typeof e.paciente === 'object' ? e.paciente : null;
  return {
    formato: VERSAO_FORMATO,
    id: String(e.id),
    versao: Number(e.versao) || 1,
    status: STATUS.includes(e.status) ? e.status : 'publicada',
    origem,
    fonte: e.fonte && typeof e.fonte === 'object' ? e.fonte : null,
    area: e.area,
    especialidade: texto(e.especialidade),
    tema: texto(e.tema),
    titulo: texto(e.titulo),
    mentor: e.mentor || MENTOR_DA_AREA[e.area] || 'caio',
    duracaoMin: Number(e.duracaoMin) || 10,
    cenario: texto(e.cenario),
    instrucoes: lista(e.instrucoes).map(texto).filter(Boolean),
    tarefas: lista(e.tarefas).map(texto).filter(Boolean),
    historia: texto(e.historia),
    paciente: paciente ? {
      nome: texto(paciente.nome) || 'Paciente',
      idade: paciente.idade ?? null,
      sexo: texto(paciente.sexo),
      ocupacao: texto(paciente.ocupacao),
      perfil: texto(paciente.perfil),
      abertura: texto(paciente.abertura),
      roteiro: lista(paciente.roteiro).filter((r) => r && texto(r.resposta)).map((r) => ({
        topico: texto(r.topico), resposta: texto(r.resposta), ...(Array.isArray(r.chaves) ? { chaves: r.chaves } : {}),
      })),
      perguntasDoPaciente: lista(paciente.perguntasDoPaciente).map(texto).filter(Boolean),
    } : null,
    exameFisico: lista(e.exameFisico).filter((x) => x && texto(x.item)).map((x) => ({
      item: texto(x.item), achado: texto(x.achado), ...(x.imagem ? { imagem: x.imagem } : {}), ...(x.chaves ? { chaves: x.chaves } : {}),
    })),
    exames: lista(e.exames).filter((x) => x && texto(x.item)).map((x) => ({
      item: texto(x.item), resultado: texto(x.resultado), ...(x.imagem ? { imagem: x.imagem } : {}), ...(x.chaves ? { chaves: x.chaves } : {}),
    })),
    diagnostico: texto(e.diagnostico),
    condutaEsperada: lista(e.condutaEsperada).map(texto).filter(Boolean),
    procedimentos: lista(e.procedimentos).map(texto).filter(Boolean),
    pep: lista(e.pep).map((c) => normalizarCriterio(c, origem === 'oficial' ? 'oficial' : 'autoral')),
    referencias: lista(e.referencias).map(texto).filter(Boolean),
    pendencias: lista(e.pendencias).map(texto).filter(Boolean),
  };
}

/** Problemas que impedem a estação de ser publicada. Lista vazia = válida. */
export function validarEstacao(e) {
  const p = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(e.id || '')) p.push('id inválido (use letras minúsculas, números e hífen)');
  if (!AREAS_ESTACAO.includes(e.area)) p.push(`área desconhecida: ${e.area}`);
  for (const campo of ['titulo', 'cenario']) if (!e[campo]) p.push(`falta ${campo}`);
  if (!e.tarefas.length) p.push('faltam as tarefas do candidato');
  if (!e.pep.length) p.push('falta o PEP');
  const soma = arredondar(e.pep.reduce((s, c) => s + c.peso, 0));
  if (Math.abs(soma - 10) > 0.001) p.push(`os pesos do PEP somam ${soma}, e não 10`);
  const ids = e.pep.map((c) => c.id);
  if (new Set(ids).size !== ids.length) p.push('ids repetidos no PEP');
  for (const c of e.pep) {
    if (!c.descricao) p.push(`critério ${c.id} sem descrição`);
    if (!(c.peso > 0)) p.push(`critério ${c.id} sem peso`);
    if (Math.abs(c.pontos.adequado - c.peso) > 0.001) p.push(`critério ${c.id}: pontuação de adequado diferente do peso`);
    if (c.pontos.parcial !== null && !(c.pontos.parcial > 0 && c.pontos.parcial < c.peso)) p.push(`critério ${c.id}: pontuação parcial fora do intervalo`);
    if (e.origem === 'autoral' && c.origem === 'oficial') p.push(`critério ${c.id} marcado como oficial numa estação autoral`);
  }
  if (e.status === 'publicada' && !e.paciente) p.push('estação publicada sem dados do paciente');
  return p;
}

/** Diz em quais modos a estação pode ser treinada. */
export function modosDaEstacao(e) {
  const temRoteiro = Boolean(e.paciente?.roteiro?.length);
  return { gratuito: temRoteiro, roteiro: temRoteiro, ia: Boolean(e.paciente), dupla: true };
}

/** Camada pública: o que aparece na lista de estações. */
export function partePublica(e) {
  return {
    id: e.id, versao: e.versao, status: e.status, origem: e.origem,
    edicao: e.fonte?.edicao || null,
    area: e.area, especialidade: e.especialidade, tema: e.tema, titulo: e.titulo, mentor: e.mentor,
    duracaoMin: e.duracaoMin, resumo: (e.cenario.split(/(?<=\.)\s/)[0] || '').slice(0, 220),
    criterios: e.pep.length, modos: modosDaEstacao(e),
  };
}

/** Camada do candidato: o impresso da porta da estação. Nada do roteiro, dos achados ou do PEP. */
export function parteCandidato(e) {
  return {
    ...partePublica(e),
    cenario: e.cenario,
    instrucoes: e.instrucoes,
    tarefas: e.tarefas,
    paciente: e.paciente ? { nome: e.paciente.nome, idade: e.paciente.idade, sexo: e.paciente.sexo || null, ocupacao: e.paciente.ocupacao } : null,
    abertura: e.paciente?.abertura || '',
    // Nomes (não conteúdo) do que pode ser perguntado ou pedido: usados no modo roteiro.
    topicos: (e.paciente?.roteiro || []).map((r, i) => ({ chave: `a${i}`, rotulo: r.topico || `Pergunta ${i + 1}` })),
    pedidos: [
      ...e.exameFisico.map((x, i) => ({ chave: `f${i}`, grupo: 'Exame físico', rotulo: x.item })),
      ...e.exames.map((x, i) => ({ chave: `x${i}`, grupo: 'Exames complementares', rotulo: x.item })),
    ],
    fonte: e.fonte ? { edicao: e.fonte.edicao, estacao: e.fonte.estacao, documento: e.fonte.documento, url: e.fonte.url } : null,
  };
}

/** Camada reservada do ator (paciente e examinador): tudo, inclusive o PEP para avaliar. */
export function parteAtor(e) {
  return {
    ...parteCandidato(e),
    historia: e.historia,
    pacienteCompleto: e.paciente,
    exameFisico: e.exameFisico,
    exames: e.exames,
    diagnostico: e.diagnostico,
    condutaEsperada: e.condutaEsperada,
    procedimentos: e.procedimentos,
    pep: e.pep,
    referencias: e.referencias,
  };
}

/** Material de correção, liberado ao candidato só depois que a estação termina. */
export const parteCorrecao = parteAtor;

/** Conteúdo de um impresso pedido (chave f0, x2...). */
export function impressoPorChave(e, chave) {
  const m = /^([fx])(\d+)$/.exec(String(chave || ''));
  if (!m) return null;
  const x = (m[1] === 'f' ? e.exameFisico : e.exames)[Number(m[2])];
  if (!x) return null;
  return { chave, grupo: m[1] === 'f' ? 'Exame físico' : 'Exames complementares', rotulo: x.item, texto: m[1] === 'f' ? x.achado : x.resultado, imagem: x.imagem || null };
}

/** Nota, critérios cumpridos/não cumpridos e erros críticos a partir dos níveis marcados. */
export function corrigir(e, niveis) {
  let nota = 0;
  const itens = [];
  for (const c of e.pep) {
    const nivel = NIVEIS[niveis?.[c.id]] ? niveis[c.id] : 'inadequado';
    const pontos = nivel === 'parcial' ? (c.pontos.parcial ?? 0) : c.pontos[nivel];
    nota += pontos;
    itens.push({ id: c.id, nivel, pontos: arredondar(pontos), peso: c.peso, critico: c.critico });
  }
  return {
    nota: arredondar(Math.min(10, nota)),
    itens,
    cumpridos: itens.filter((i) => i.nivel === 'adequado').map((i) => i.id),
    parciais: itens.filter((i) => i.nivel === 'parcial').map((i) => i.id),
    naoCumpridos: itens.filter((i) => i.nivel === 'inadequado').map((i) => i.id),
    criticos: itens.filter((i) => i.critico && i.nivel === 'inadequado').map((i) => i.id),
  };
}

/** Sorteia as estações de um simulado respeitando a distribuição do edital (área -> quantidade). */
export function montarCircuito(estacoes, edital, total, sortear = Math.random) {
  const embaralhar = (l) => l.map((x) => [sortear(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const porArea = {};
  for (const e of embaralhar(estacoes)) (porArea[e.area] ||= []).push(e);
  const dist = edital?.distribuicao || {};
  const escala = total / Math.max(1, Object.values(dist).reduce((s, n) => s + n, 0));
  const escolhidas = [];
  // Primeiro a cota de cada área (proporcional ao edital), depois completa com o que sobrar.
  for (const [area, n] of Object.entries(dist)) {
    const cota = Math.round(n * escala);
    escolhidas.push(...(porArea[area] || []).splice(0, cota));
  }
  const resto = embaralhar(Object.values(porArea).flat());
  while (escolhidas.length < total && resto.length) escolhidas.push(resto.shift());
  return escolhidas.slice(0, total);
}
