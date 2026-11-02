// Casos clínicos do simulador, escritos pela equipe do curso. Tudo roda no navegador, sem IA e sem custo:
// o paciente responde por reconhecimento das perguntas, os exames têm resultado definido e a correção
// segue um checklist com pesos (como o PEP da prova prática).
import { normalizar } from './util.js';
import { LOTE2, EXAMES_LOTE2 } from './casos-lote2.js';

const temChave = (n, c) => {
  const k = normalizar(c);
  return k.includes(' ') ? n.includes(k) : new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n);
};

/* ------------------------------------------------------------------ exames */

// Catálogo de exames: resultado normal padrão e palavras que o aluno pode digitar.
export const EXAMES = [
  { id: 'ecg', nome: 'Eletrocardiograma (ECG)', grupo: 'Cardiologia', chaves: ['ecg', 'eletro'], normal: 'ECG de 12 derivações realizado: veja o traçado.' },
  { id: 'troponina', nome: 'Troponina', grupo: 'Cardiologia', chaves: ['tropon'], normal: 'Troponina I ultrassensível: 8 ng/L (ref < 34).' },
  { id: 'ckmb', nome: 'CK-MB', grupo: 'Cardiologia', chaves: ['ck-mb', 'ckmb', 'ck mb'], normal: 'CK-MB massa: 2,1 ng/mL (ref < 5).' },
  { id: 'bnp', nome: 'BNP', grupo: 'Cardiologia', chaves: ['bnp', 'peptideo natriuretico'], normal: 'BNP: 45 pg/mL (ref < 100).' },
  { id: 'ecocardiograma', nome: 'Ecocardiograma', grupo: 'Cardiologia', chaves: ['ecocard', 'eco '], normal: 'FEVE 62%, câmaras de dimensões normais, valvas sem alterações.' },
  { id: 'hemograma', nome: 'Hemograma', grupo: 'Laboratório', chaves: ['hemogram', 'leucocit', 'hemoglobina', 'plaqueta'], normal: 'Hb 13,8 g/dL; Ht 41%; leucócitos 7.200/mm³ (62% segmentados); plaquetas 250.000/mm³.' },
  { id: 'pcr', nome: 'Proteína C-reativa (PCR)', grupo: 'Laboratório', chaves: ['pcr', 'proteina c'], normal: 'PCR: 3 mg/L (ref < 5).' },
  { id: 'funcao_renal', nome: 'Ureia e creatinina', grupo: 'Laboratório', chaves: ['ureia', 'creatin', 'funcao renal'], normal: 'Ureia 32 mg/dL; creatinina 0,9 mg/dL.' },
  { id: 'eletrolitos', nome: 'Sódio, potássio e cloro', grupo: 'Laboratório', chaves: ['eletrolit', 'sodio', 'potassio', 'cloro', 'magnesio'], normal: 'Na 139 mEq/L; K 4,2 mEq/L; Cl 102 mEq/L; Mg 2,0 mg/dL.' },
  { id: 'glicemia', nome: 'Glicemia', grupo: 'Laboratório', chaves: ['glicem', 'glicose'], normal: 'Glicemia: 92 mg/dL.' },
  { id: 'hba1c', nome: 'Hemoglobina glicada', grupo: 'Laboratório', chaves: ['glicada', 'hba1c', 'a1c'], normal: 'HbA1c: 5,4%.' },
  { id: 'gasometria', nome: 'Gasometria arterial', grupo: 'Laboratório', chaves: ['gasometr', 'gaso'], normal: 'pH 7,40; pCO₂ 40 mmHg; pO₂ 92 mmHg; HCO₃ 24 mEq/L; BE 0; lactato 1,1 mmol/L.' },
  { id: 'lactato', nome: 'Lactato', grupo: 'Laboratório', chaves: ['lactato'], normal: 'Lactato: 1,1 mmol/L (ref < 2).' },
  { id: 'cetonemia', nome: 'Cetonemia', grupo: 'Laboratório', chaves: ['ceton', 'beta-hidroxi', 'hidroxibutirato'], normal: 'Beta-hidroxibutirato: 0,2 mmol/L (ref < 0,6).' },
  { id: 'coagulograma', nome: 'Coagulograma', grupo: 'Laboratório', chaves: ['coagul', 'inr', 'ttpa', 'tap', 'fibrinog'], normal: 'TP/INR 1,0; TTPa 30 s; fibrinogênio 320 mg/dL.' },
  { id: 'tipagem', nome: 'Tipagem sanguínea e prova cruzada', grupo: 'Laboratório', chaves: ['tipagem', 'prova cruzada', 'tipo sangu', 'abo'], normal: 'Tipagem: A positivo. Prova cruzada em andamento.' },
  { id: 'tgo_tgp', nome: 'Transaminases (TGO/TGP)', grupo: 'Laboratório', chaves: ['tgo', 'tgp', 'transamin', 'funcao hepat', 'enzimas hepat'], normal: 'TGO 24 U/L; TGP 28 U/L.' },
  { id: 'bilirrubinas', nome: 'Bilirrubinas', grupo: 'Laboratório', chaves: ['bilirrub'], normal: 'Bilirrubina total 0,7 mg/dL (direta 0,2).' },
  { id: 'ldh', nome: 'LDH', grupo: 'Laboratório', chaves: ['ldh', 'desidrogenase'], normal: 'LDH: 180 U/L.' },
  { id: 'amilase_lipase', nome: 'Amilase e lipase', grupo: 'Laboratório', chaves: ['amilase', 'lipase'], normal: 'Amilase 70 U/L; lipase 35 U/L.' },
  { id: 'ddimero', nome: 'D-dímero', grupo: 'Laboratório', chaves: ['dimero', 'd-dimero'], normal: 'D-dímero: 320 ng/mL (ref < 500).' },
  { id: 'tsh', nome: 'TSH', grupo: 'Laboratório', chaves: ['tsh', 'tireo', 't4'], normal: 'TSH 1,8 mUI/L; T4 livre 1,2 ng/dL.' },
  { id: 'urina1', nome: 'Urina tipo 1 (EAS)', grupo: 'Laboratório', chaves: ['urina', 'eas', 'sumario'], normal: 'Densidade 1.020; sem proteínas, glicose, cetonas ou nitrito; leucócitos 2/campo.' },
  { id: 'proteinuria', nome: 'Relação proteína/creatinina urinária', grupo: 'Laboratório', chaves: ['proteinur', 'proteina/creat', 'proteina urin', 'relacao proteina'], normal: 'Relação proteína/creatinina: 0,1 (ref < 0,3).' },
  { id: 'urocultura', nome: 'Urocultura', grupo: 'Laboratório', chaves: ['urocult'], normal: 'Urocultura: em andamento.' },
  { id: 'hemocultura', nome: 'Hemoculturas', grupo: 'Laboratório', chaves: ['hemocult'], normal: 'Duas amostras coletadas: em andamento.' },
  { id: 'beta_hcg', nome: 'Beta-hCG', grupo: 'Laboratório', chaves: ['hcg', 'teste de gravidez'], normal: 'Beta-hCG: negativo.' },
  { id: 'teste_rapido_hiv', nome: 'Teste rápido para HIV', grupo: 'Laboratório', chaves: ['hiv', 'anti-hiv'], normal: 'Teste rápido para HIV: não reagente.' },
  { id: 'vdrl', nome: 'Sífilis (teste rápido/VDRL)', grupo: 'Laboratório', chaves: ['sifilis', 'vdrl', 'treponem'], normal: 'Teste rápido para sífilis: não reagente.' },
  { id: 'liquor', nome: 'Líquor (punção lombar)', grupo: 'Laboratório', chaves: ['liquor', 'lcr', 'puncao lombar', 'raqui'], normal: 'Líquor límpido, 2 células/mm³, proteína 30 mg/dL, glicose 60 mg/dL.' },
  { id: 'baciloscopia', nome: 'Baciloscopia de escarro (BAAR)', grupo: 'Laboratório', chaves: ['bacilos', 'baar'], normal: 'Baciloscopia: negativa.' },
  { id: 'trm_tb', nome: 'Teste rápido molecular para TB (TRM-TB)', grupo: 'Laboratório', chaves: ['trm', 'molecular', 'genexpert', 'xpert'], normal: 'TRM-TB: MTB não detectado.' },
  { id: 'cultura_escarro', nome: 'Cultura de escarro', grupo: 'Laboratório', chaves: ['cultura de escarro', 'cultura para micobact', 'cultura do escarro'], normal: 'Cultura de escarro: em andamento.' },
  { id: 'raio_x_torax', nome: 'Raio X de tórax', grupo: 'Imagem', chaves: ['raio x de torax', 'rx de torax', 'radiografia de torax', 'rx torax', 'raio-x de torax', 'raio x torax'], normal: 'Sem alterações pleuropulmonares; área cardíaca normal.' },
  { id: 'raio_x_abdome', nome: 'Raio X de abdome', grupo: 'Imagem', chaves: ['raio x de abdome', 'rx de abdome', 'radiografia de abdome', 'rx abdome'], normal: 'Distribuição gasosa normal, sem pneumoperitônio ou níveis hidroaéreos.' },
  { id: 'usg_abdome', nome: 'Ultrassom de abdome', grupo: 'Imagem', chaves: ['usg de abdome', 'ultrassom de abdome', 'ultrassonografia de abdome', 'usg abdome', 'us de abdome', 'ultrassom abdominal'], normal: 'Órgãos abdominais sem alterações.' },
  { id: 'usg_obstetrica', nome: 'Ultrassom obstétrico com Doppler', grupo: 'Imagem', chaves: ['obstetric', 'usg obst', 'doppler'], normal: 'Feto único, vivo, biometria adequada, líquido normal.' },
  { id: 'cardiotocografia', nome: 'Cardiotocografia', grupo: 'Imagem', chaves: ['cardiotoco', 'ctg'], normal: 'Categoria I.' },
  { id: 'fast', nome: 'eFAST (ultrassom no trauma)', grupo: 'Imagem', chaves: ['fast', 'efast'], normal: 'Sem líquido livre; deslizamento pleural presente bilateralmente.' },
  { id: 'tc_cranio', nome: 'TC de crânio', grupo: 'Imagem', chaves: ['tc de cranio', 'tomografia de cranio', 'tc cranio', 'tomografia do cranio'], normal: 'Sem alterações.' },
  { id: 'angiotc_cranio', nome: 'AngioTC de vasos intracranianos', grupo: 'Imagem', chaves: ['angiotc de cranio', 'angiotomografia de cranio', 'angio tc de cranio', 'angiotc cranio', 'angiotc de vasos'], normal: 'Sem oclusão de grandes vasos.' },
  { id: 'tc_abdome', nome: 'TC de abdome', grupo: 'Imagem', chaves: ['tc de abdome', 'tomografia de abdome', 'tc abdome'], normal: 'Sem alterações.' },
  { id: 'angiotc_torax', nome: 'AngioTC de tórax', grupo: 'Imagem', chaves: ['angiotc de torax', 'angiotomografia de torax', 'angio tc de torax', 'angiotc torax'], normal: 'Sem falhas de enchimento nas artérias pulmonares.' },
];
EXAMES.push(...EXAMES_LOTE2);
export const EXAME_POR_ID = Object.fromEntries(EXAMES.map((e) => [e.id, e]));
export const GRUPOS_EXAME = ['Laboratório', 'Imagem', 'Cardiologia'];

/** Encontra os exames citados num texto livre ("hemograma, troponina e ECG"). */
export function examesDoTexto(texto) {
  const n = ` ${normalizar(texto)} `;
  return EXAMES.filter((e) => e.chaves.some((c) => temChave(n, c))).map((e) => e.id);
}

/* ---------------------------------------------------------------- exame físico */

export const SISTEMAS = [
  ['vitais', 'Sinais vitais'], ['geral', 'Estado geral'], ['cabeca', 'Cabeça e pescoço'], ['cardio', 'Cardiovascular'], ['resp', 'Respiratório'],
  ['abdome', 'Abdome'], ['neuro', 'Neurológico'], ['extremidades', 'Extremidades e pele'], ['especifico', 'Exame específico'],
];
const FISICO_NORMAL = {
  geral: 'Bom estado geral, lúcido, corado, hidratado.', cabeca: 'Sem alterações, sem linfonodos palpáveis, sem turgência jugular.',
  cardio: 'Ritmo regular em 2 tempos, bulhas normofonéticas, sem sopros.', resp: 'Murmúrio vesicular presente bilateralmente, sem ruídos adventícios.',
  abdome: 'Plano, flácido, indolor, sem massas, ruídos hidroaéreos presentes.', neuro: 'Sem déficits focais.',
  extremidades: 'Sem edema, pulsos presentes e simétricos, enchimento capilar < 3 s.', especifico: 'Sem alterações.',
};

/* ------------------------------------------------------------------ anamnese */

// Perguntas que valem para todo caso; o caso pode trocar a resposta usando o mesmo id.
const GENERICAS = [
  { id: 'alergias', rotulo: 'Tem alguma alergia?', chaves: ['alerg'], resposta: 'Não tenho alergia a nada.' },
  { id: 'medicacoes', rotulo: 'Usa algum remédio?', chaves: ['remedio', 'medica', 'toma algum', 'uso de', 'usa algum'], resposta: 'Não tomo remédio nenhum.' },
  { id: 'comorbidades', rotulo: 'Tem alguma doença?', chaves: ['doenca', 'comorb', 'problema de saude', 'pressao alta', 'diabet', 'hipert'], resposta: 'Não tenho nenhuma doença.' },
  { id: 'cirurgias', rotulo: 'Já fez cirurgia ou internação?', chaves: ['cirurg', 'operou', 'operacao', 'internad', 'internac'], resposta: 'Nunca fiz cirurgia nem fiquei internado.' },
  { id: 'tabagismo', rotulo: 'Fuma?', chaves: ['fuma', 'cigarr', 'tabag'], resposta: 'Não fumo.' },
  { id: 'alcool', rotulo: 'Bebe álcool?', chaves: ['bebe', 'alcool', 'bebida', 'cerveja', 'etilis'], resposta: 'Só socialmente, de vez em quando.' },
  { id: 'drogas', rotulo: 'Usa outras drogas?', chaves: ['droga', 'cocain', 'maconha', 'crack'], resposta: 'Não uso drogas.' },
  { id: 'familia', rotulo: 'Doenças na família?', chaves: ['famil', 'pai', 'mae', 'parente', 'irmao', 'heredit'], resposta: 'Ninguém na família com doença séria que eu saiba.' },
  { id: 'febre', rotulo: 'Teve febre?', chaves: ['febre', 'febril', 'temperatura'], resposta: 'Febre não.' },
  { id: 'vomitos', rotulo: 'Teve náusea ou vômito?', chaves: ['vomit', 'enjo', 'nause'], resposta: 'Não, enjoo não.' },
  { id: 'intestino', rotulo: 'Como está o intestino?', chaves: ['intestin', 'diarr', 'evacu', 'fezes', 'constip', 'prisao de ventre'], resposta: 'O intestino está normal.' },
  { id: 'urina', rotulo: 'Como está a urina?', chaves: ['urina', 'xixi', 'urinar', 'diurese'], resposta: 'Urina normal.' },
];
const SAUDACAO = ['bom dia', 'boa tarde', 'boa noite', 'ola', 'meu nome', 'sou o doutor', 'sou a doutora', 'sou o medico', 'sou a medica', 'prazer'];
const SEM_RESPOSTA = ['Isso eu não sei dizer, doutor.', 'Não reparei nisso não.', 'Não, isso não.', 'Hum… acho que não.'];

/** Junta as perguntas genéricas com as do caso (as do caso têm prioridade). */
export function perguntasDoCaso(caso) {
  const doCaso = new Map(caso.anamnese.map((p) => [p.id, p]));
  const genericas = GENERICAS.filter((g) => !doCaso.has(g.id));
  return [...caso.anamnese.map((p) => ({ ...GENERICAS.find((g) => g.id === p.id), ...p })), ...genericas];
}


/** Resposta do paciente a uma pergunta digitada: a pergunta reconhecida (ou nenhuma) e o texto. */
export function responder(caso, texto, jaFeitas = new Set()) {
  const n = normalizar(texto);
  let melhor = null;
  let pontos = 0;
  for (const p of perguntasDoCaso(caso)) {
    const s = p.chaves.reduce((t, c) => t + (temChave(n, c) ? 1 : 0), 0);
    // Empate: prefere a pergunta ainda não feita (o aluno costuma avançar na anamnese).
    if (s > pontos || (s === pontos && s > 0 && melhor && jaFeitas.has(melhor.id) && !jaFeitas.has(p.id))) { melhor = p; pontos = s; }
  }
  if (melhor) return { pergunta: melhor, texto: melhor.resposta };
  if (SAUDACAO.some((s) => n.includes(s))) return { pergunta: null, texto: caso.saudacao || 'Bom dia, doutor.' };
  return { pergunta: null, texto: SEM_RESPOSTA[n.length % SEM_RESPOSTA.length] };
}

export const achadoFisico = (caso, sistema) => (sistema === 'vitais'
  ? caso.vitais
  : caso.exameFisico[sistema] || FISICO_NORMAL[sistema]);

export const resultadoExame = (caso, id) => caso.exames[id] || EXAME_POR_ID[id]?.normal || 'Resultado normal.';

/* ------------------------------------------------------------------ correção */

const PESOS = { anamnese: 20, fisico: 10, exames: 15, diagnostico: 20, conduta: 20, prescricao: 15 };
const pedido = (essencial, pedidos) => (Array.isArray(essencial) ? essencial.some((e) => pedidos.has(e)) : pedidos.has(essencial));
const nomeEssencial = (e) => (Array.isArray(e) ? e.map((x) => EXAME_POR_ID[x]?.nome).join(' ou ') : EXAME_POR_ID[e]?.nome);

function notaDeOpcoes(opcoes, marcadas) {
  const certas = opcoes.filter((o) => o.certo && !o.opcional);
  const acertos = certas.filter((o) => marcadas.has(o.id)).length;
  const erradas = opcoes.filter((o) => !o.certo && marcadas.has(o.id));
  const nota = certas.length ? Math.max(0, (acertos - erradas.length * 0.5) / certas.length) * 10 : 10;
  return {
    nota,
    faltou: certas.filter((o) => !marcadas.has(o.id)).map((o) => o.texto),
    erradas: erradas.map((o) => ({ texto: o.texto, comentario: o.comentario, perigoso: !!o.perigoso })),
  };
}

/**
 * Corrige o atendimento. `registro`: { perguntas: Set de ids, sistemas: Set, exames: Set, diagnostico: id da opção,
 * conduta: Set de ids, prescricao: Set de ids }.
 */
export function corrigir(caso, registro) {
  const essAnam = caso.anamnese.filter((p) => p.essencial);
  const feitas = essAnam.filter((p) => registro.perguntas.has(p.id));
  const anamnese = { nota: essAnam.length ? (feitas.length / essAnam.length) * 10 : 10, faltou: essAnam.filter((p) => !registro.perguntas.has(p.id)).map((p) => p.rotulo) };

  const essFis = caso.fisicoEssencial;
  const fisico = { nota: (essFis.filter((s) => registro.sistemas.has(s)).length / essFis.length) * 10, faltou: essFis.filter((s) => !registro.sistemas.has(s)).map((s) => SISTEMAS.find(([k]) => k === s)[1]) };

  const ess = caso.examesEssenciais;
  const aceitos = new Set([...ess.flat(), ...caso.examesAceitaveis]);
  const desnecessarios = [...registro.exames].filter((e) => !aceitos.has(e) && !caso.examesPerigosos?.[e]);
  const perigososEx = [...registro.exames].filter((e) => caso.examesPerigosos?.[e]);
  const cobertos = ess.filter((e) => pedido(e, registro.exames)).length;
  const exames = {
    nota: Math.max(0, (ess.length ? (cobertos / ess.length) * 10 : 10) - desnecessarios.length * 0.5 - perigososEx.length * 3),
    faltou: ess.filter((e) => !pedido(e, registro.exames)).map(nomeEssencial),
    desnecessarios: desnecessarios.map((e) => EXAME_POR_ID[e].nome),
  };

  const opcaoDx = caso.diagnostico.opcoes.find((o) => o.id === registro.diagnostico);
  const diagnostico = { nota: opcaoDx?.certo ? 10 : 0, escolhido: opcaoDx?.texto || '', comentario: opcaoDx?.comentario || '' };
  const conduta = notaDeOpcoes(caso.conduta, registro.conduta);
  const prescricao = notaDeOpcoes(caso.prescricao, registro.prescricao);

  const partes = { anamnese, fisico, exames, diagnostico, conduta, prescricao };
  const nota = Object.entries(PESOS).reduce((t, [k, p]) => t + partes[k].nota * p, 0) / 100;
  const perigosos = [
    ...caso.examesCriticos.filter((e) => !registro.exames.has(e)).map((e) => `Não pediu ${EXAME_POR_ID[e].nome}: ${caso.criticoMotivo?.[e] || 'exame obrigatório neste quadro.'}`),
    ...perigososEx.map((e) => caso.examesPerigosos[e]),
    ...conduta.erradas.filter((x) => x.perigoso).map((x) => `${x.texto}: ${x.comentario}`),
    ...prescricao.erradas.filter((x) => x.perigoso).map((x) => `${x.texto}: ${x.comentario}`),
  ];
  // Cada erro perigoso tira 1 ponto da nota final, como na prova (um erro grave pode custar a estação).
  const final = Math.max(0, nota - perigosos.length);
  return { nota: Math.round(final * 10) / 10, partes, perigosos };
}

/* ------------------------------------------------------------------- casos */

const op = (id, texto, certo, comentario = '', extra = {}) => ({ id, texto, certo, comentario, ...extra });
const P = (id, rotulo, chaves, resposta, essencial = false) => ({ id, rotulo, chaves, resposta, essencial });

const LOTE1 = [
  {
    id: 'iam-inferior', area: 'Clínica Médica', titulo: 'Dor torácica na UPA', cenario: 'UPA, 7h da manhã', ecg: 'iam_inferior', dificuldade: 'Intermediária',
    paciente: { nome: 'José Almeida', idade: 61, sexo: 'M', ocupacao: 'motorista' },
    queixa: 'Doutor, tô com uma dor muito forte no peito desde cedo.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo', 'hora'], 'Começou faz uma hora e meia, eu tava carregando umas caixas.', true),
      P('carater', 'Como é a dor?', ['como e', 'tipo', 'caracter', 'aperto', 'pontada', 'queima', 'jeito'], 'É um aperto, como se tivesse um peso em cima do peito.', true),
      P('irradiacao', 'Onde dói e para onde vai?', ['onde', 'local', 'irradi', 'espalha', 'braco', 'vai pra', 'vai para', 'lugar', 'mandibula', 'queixo'], 'No meio do peito, e vai pro braço esquerdo e pro queixo.', true),
      P('intensidade', 'Qual a intensidade?', ['intens', 'nota', 'forte', 'escala', '0 a 10'], 'Nota 9, doutor, nunca senti nada assim.'),
      P('fatores', 'O que melhora ou piora?', ['melhora', 'piora', 'posicao', 'respirar', 'repouso', 'parado'], 'Não melhora parado, nem mudando de posição, nem respirando diferente.'),
      P('associados', 'Teve suor, enjoo ou falta de ar?', ['suor', 'sudore', 'nause', 'enjo', 'vomit', 'falta de ar', 'dispne', 'associad', 'outro sintoma'], 'Suei frio e fiquei enjoado, mas não vomitei.', true),
      P('comorbidades', 'Tem alguma doença?', ['doenca', 'comorb', 'pressao', 'diabet', 'colesterol', 'problema de saude', 'hipert'], 'Tenho pressão alta, colesterol alto e diabetes faz uns 5 anos.', true),
      P('medicacoes', 'Usa algum remédio?', ['remedio', 'medica', 'toma', 'uso'], 'Tomo losartana e metformina, mas às vezes esqueço.'),
      P('tabagismo', 'Fuma?', ['fuma', 'cigarr', 'tabag'], 'Fumo um maço por dia desde os 20 anos.', true),
      P('familia', 'Doenças na família?', ['famil', 'pai', 'mae', 'parente', 'irmao'], 'Meu pai morreu do coração com 58 anos.'),
      P('contraindicacoes', 'Já teve AVC, sangramento ou cirurgia recente?', ['sangra', 'derrame', 'avc', 'cirurgia', 'hemorrag', 'ulcera', 'trauma'], 'Nunca tive derrame nem sangramento, e não fiz cirurgia nenhuma.', true),
      P('drogas', 'Usa cocaína ou remédio para ereção?', ['droga', 'cocain', 'viagra', 'sildenafil', 'tadalafil', 'erecao'], 'Não uso nada disso não.'),
    ],
    vitais: 'PA 150 x 90 mmHg · FC 70 bpm · FR 20 irpm · Tax 36,4 °C · SatO₂ 95% em ar ambiente · Glicemia capilar 168 mg/dL',
    exameFisico: {
      geral: 'Ansioso, sudoreico, levemente pálido, com a mão no peito.', cabeca: 'Sem turgência jugular.',
      cardio: 'Ritmo regular em 2 tempos, bulhas normofonéticas, sem sopros. Pulsos simétricos nos 4 membros.',
      resp: 'Murmúrio vesicular presente bilateralmente, sem estertores.', especifico: 'PA simétrica nos dois braços (150 x 90 e 146 x 88 mmHg).',
    },
    fisicoEssencial: ['vitais', 'cardio', 'resp'],
    exames: {
      troponina: 'Troponina I ultrassensível: 1.850 ng/L (ref < 34).', ckmb: 'CK-MB massa: 38 ng/mL (ref < 5).',
      funcao_renal: 'Ureia 38 mg/dL; creatinina 1,0 mg/dL.', eletrolitos: 'Na 138 mEq/L; K 4,3 mEq/L; Mg 2,0 mg/dL.', glicemia: 'Glicemia: 168 mg/dL.',
      raio_x_torax: 'Área cardíaca normal, sem congestão pulmonar, mediastino de largura normal.',
    },
    examesEssenciais: ['ecg', 'troponina'], examesAceitaveis: ['ckmb', 'hemograma', 'funcao_renal', 'eletrolitos', 'coagulograma', 'raio_x_torax', 'glicemia', 'hba1c'],
    examesCriticos: ['ecg'], criticoMotivo: { ecg: 'em toda dor torácica, o ECG deve sair em até 10 minutos da chegada.' },
    diagnostico: {
      opcoes: [
        op('a', 'IAM com supradesnivelamento do ST de parede inferior', true),
        op('b', 'Dissecção aguda de aorta', false, 'Dor rasgando com irradiação para o dorso e assimetria de pulsos/PA, ausentes aqui.'),
        op('c', 'Pericardite aguda', false, 'Supra difuso e côncavo, dor que melhora sentado; aqui o supra é localizado com espelho.'),
        op('d', 'Tromboembolismo pulmonar', false),
        op('e', 'Angina instável', false, 'Na angina instável não há supra de ST nem elevação de troponina.'),
      ],
    },
    conduta: [
      op('c1', 'Reperfusão: angioplastia primária (porta-balão ≤ 90 min) ou, se não houver em até 120 min, fibrinólise (porta-agulha ≤ 30 min)', true),
      op('c2', 'Monitorização cardíaca, acesso venoso e oxigênio só se SatO₂ < 90%', true),
      op('c3', 'ECG com derivações direitas (V3R, V4R) e posteriores (V7–V9)', true),
      op('c4', 'Internar em unidade coronariana', true),
      op('c5', 'Aguardar a segunda troponina para confirmar antes de reperfundir', false, 'no IAM com supra, o ECG basta: esperar troponina atrasa a reperfusão.', { perigoso: true }),
      op('c6', 'Teste ergométrico depois que a dor passar', false, 'teste de esforço é contraindicado no infarto agudo.', { perigoso: true }),
      op('c7', 'Alta com analgésico e retorno ambulatorial', false, 'infarto em curso exige internação e reperfusão.', { perigoso: true }),
    ],
    prescricao: [
      op('p1', 'AAS 300 mg VO mastigado (ataque)', true),
      op('p2', 'Clopidogrel em dose de ataque (300 mg se fibrinólise; 600 mg se angioplastia)', true),
      op('p3', 'Anticoagulação (enoxaparina ou heparina) conforme a estratégia de reperfusão', true),
      op('p4', 'Atorvastatina 80 mg VO', true),
      op('p5', 'Morfina 2–4 mg IV se a dor persistir apesar do tratamento', true, '', { opcional: true }),
      op('p6', 'Nitrato sublingual mesmo com hipotensão ou suspeita de infarto de VD', false, 'no infarto inferior com VD acometido, nitrato derruba a pré-carga e causa choque.', { perigoso: true }),
      op('p7', 'Ibuprofeno 600 mg VO para a dor', false, 'anti-inflamatório aumenta eventos cardiovasculares e sangramento no infarto.', { perigoso: true }),
      op('p8', 'Metoprolol IV em bolus de rotina na chegada', false, 'betabloqueador IV de rotina aumenta o risco de choque cardiogênico.'),
    ],
    pontosChave: [
      'ECG em até 10 minutos da chegada em toda dor torácica.',
      'IAM inferior: supra em DII, DIII e aVF, com espelho em DI e aVL. Supra em DIII > DII sugere coronária direita.',
      'No infarto inferior, pesquise VD (V3R/V4R): se acometido, evite nitrato e diurético e hidrate se houver hipotensão.',
      'Reperfusão: angioplastia primária se porta-balão ≤ 90–120 min; senão, fibrinólise em até 30 min.',
    ],
  },
  {
    id: 'cetoacidose', area: 'Clínica Médica', titulo: 'Jovem com dor abdominal e vômitos', cenario: 'Pronto-socorro', ecg: null, dificuldade: 'Intermediária',
    paciente: { nome: 'Larissa Moura', idade: 19, sexo: 'F', ocupacao: 'estudante' },
    queixa: 'Tô passando muito mal, com dor na barriga e vomitando.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo'], 'Faz dois dias que tô com muita sede e fazendo muito xixi. Hoje comecei a vomitar.', true),
      P('poliuria', 'Tem sede ou urina demais?', ['sede', 'urin', 'xixi', 'polidips', 'poliur', 'agua'], 'Muita sede, bebo água o tempo todo e levanto várias vezes à noite pra urinar.', true),
      P('peso', 'Perdeu peso?', ['peso', 'emagrec', 'quilos'], 'Emagreci uns 6 quilos no último mês sem fazer dieta.'),
      P('dor', 'Como é a dor na barriga?', ['dor', 'barriga', 'abdom', 'onde'], 'Dói a barriga toda, é uma dor espalhada.'),
      P('vomitos', 'Quantas vezes vomitou?', ['vomit', 'enjo', 'nause'], 'Vomitei umas cinco vezes hoje.'),
      P('comorbidades', 'Tem alguma doença?', ['doenca', 'comorb', 'diabet', 'problema de saude'], 'Tenho diabetes tipo 1 desde os 12 anos.', true),
      P('medicacoes', 'Usa insulina? Como está usando?', ['insulin', 'remedio', 'medica', 'uso', 'toma', 'aplica'], 'Uso insulina NPH e regular, mas fiquei sem nos últimos 3 dias porque acabou.', true),
      P('infeccao', 'Teve febre ou algum sinal de infecção?', ['febre', 'infec', 'ardencia', 'arde', 'disuria', 'tosse', 'garganta'], 'Tô com ardência pra urinar desde a semana passada e acho que tive febre ontem.', true),
      P('gestacao', 'Pode estar grávida? Última menstruação?', ['menstru', 'gravid', 'gestac', 'dum', 'regra'], 'Não, minha menstruação tá certinha, a última foi há duas semanas.'),
    ],
    vitais: 'PA 100 x 60 mmHg · FC 122 bpm · FR 30 irpm, respiração profunda · Tax 37,8 °C · SatO₂ 98% · Glicemia capilar: "HI" (> 500 mg/dL)',
    exameFisico: {
      geral: 'Desidratada (++/4+), mucosas secas, hálito cetônico, sonolenta mas orientada.', resp: 'Respiração de Kussmaul; murmúrio vesicular presente, sem ruídos adventícios.',
      cardio: 'Taquicárdica, ritmo regular, enchimento capilar de 3 s.', abdome: 'Dor difusa à palpação, sem defesa nem descompressão dolorosa, ruídos presentes.',
      neuro: 'Glasgow 14, sem déficits focais.', especifico: 'Punho-percussão lombar negativa.',
    },
    fisicoEssencial: ['vitais', 'geral', 'resp', 'abdome'],
    exames: {
      gasometria: 'pH 7,08; pCO₂ 18 mmHg; HCO₃ 6 mEq/L; BE −22; lactato 1,8 mmol/L.', glicemia: 'Glicemia: 540 mg/dL.',
      cetonemia: 'Beta-hidroxibutirato: 6,2 mmol/L (ref < 0,6).', eletrolitos: 'Na 131 mEq/L; K 5,6 mEq/L; Cl 96 mEq/L (ânion gap 29).',
      funcao_renal: 'Ureia 58 mg/dL; creatinina 1,4 mg/dL.', hemograma: 'Hb 15,1 g/dL; leucócitos 16.800/mm³ (sem desvio); plaquetas 310.000/mm³.',
      urina1: 'Glicosúria 4+, cetonúria 3+, leucócitos 40/campo, nitrito positivo.', pcr: 'PCR: 28 mg/L.',
    },
    examesEssenciais: ['gasometria', 'glicemia', 'eletrolitos', ['cetonemia', 'urina1']],
    examesAceitaveis: ['funcao_renal', 'hemograma', 'urocultura', 'hemocultura', 'beta_hcg', 'pcr', 'ecg', 'lactato'],
    examesCriticos: ['eletrolitos'], criticoMotivo: { eletrolitos: 'sem saber o potássio não se pode iniciar insulina com segurança.' },
    diagnostico: {
      opcoes: [
        op('a', 'Cetoacidose diabética desencadeada por infecção urinária e falta de insulina', true),
        op('b', 'Estado hiperglicêmico hiperosmolar', false, 'No EHH quase não há acidose nem cetose; aqui o pH é 7,08.'),
        op('c', 'Apendicite aguda', false, 'A dor abdominal difusa é da cetoacidose e melhora com o tratamento.'),
        op('d', 'Gastroenterite aguda', false),
        op('e', 'Acidose lática por sepse', false, 'O lactato está normal e as cetonas muito elevadas.'),
      ],
    },
    conduta: [
      op('c1', 'Hidratação vigorosa: SF 0,9% 15–20 mL/kg na 1ª hora', true),
      op('c2', 'Insulina regular IV contínua 0,1 U/kg/h, só com K ≥ 3,3 mEq/L', true),
      op('c3', 'Repor potássio quando K < 5,2 mEq/L com diurese presente', true),
      op('c4', 'Glicemia capilar de 1/1 h e eletrólitos a cada 2–4 h', true),
      op('c5', 'Soro glicosado quando a glicemia chegar a 200–250 mg/dL, mantendo a insulina', true),
      op('c6', 'Bicarbonato de sódio de rotina para corrigir o pH', false, 'bicarbonato só se pH < 6,9: de rotina piora hipocalemia e edema cerebral.'),
      op('c7', 'Iniciar insulina antes de saber o potássio', false, 'a insulina joga o potássio para dentro das células e pode causar arritmia fatal.', { perigoso: true }),
      op('c8', 'Suspender a insulina IV assim que a glicemia normalizar', false, 'a insulina IV só sai após resolver a acidose e sobrepor insulina SC por 1–2 h.', { perigoso: true }),
    ],
    prescricao: [
      op('p1', 'SF 0,9% 1.000 mL IV em 1 hora', true),
      op('p2', 'Insulina regular 0,1 U/kg/h IV em bomba', true),
      op('p3', 'KCl 19,1%: 20–30 mEq em cada litro de soro quando K entre 3,3 e 5,2', true),
      op('p4', 'Ceftriaxona 1 g IV 24/24 h (infecção urinária como gatilho)', true),
      op('p5', 'Ondansetrona 4 mg IV se vômitos', true, '', { opcional: true }),
      op('p6', 'Bicarbonato de sódio 8,4% 100 mL IV', false, 'sem indicação com pH 7,08.'),
      op('p7', 'Insulina NPH 0,5 U/kg SC agora, no lugar da insulina IV', false, 'na cetoacidose moderada/grave a insulina é regular IV contínua.', { perigoso: true }),
    ],
    pontosChave: [
      'Cetoacidose: glicemia ≥ 250 mg/dL (ou diabetes conhecido), pH < 7,3 ou HCO₃ < 18 e cetonemia.',
      'Ordem: volume primeiro, potássio antes da insulina (se K < 3,3, repor antes), depois insulina IV.',
      'Bicarbonato só com pH < 6,9.',
      'Sempre procure o gatilho: infecção e falta de insulina são os mais comuns.',
    ],
  },
  {
    id: 'fa-alta-resposta', area: 'Clínica Médica', titulo: 'Idosa com palpitações', cenario: 'Pronto-socorro', ecg: 'fa', dificuldade: 'Intermediária',
    paciente: { nome: 'Maria das Graças', idade: 72, sexo: 'F', ocupacao: 'aposentada' },
    queixa: 'Doutor, meu coração tá disparado desde cedo.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo', 'hora'], 'Começou hoje de manhã, umas 6 horas atrás.', true),
      P('carater', 'Como é a palpitação?', ['como e', 'tipo', 'ritmo', 'descompass', 'irregular', 'dispar', 'jeito'], 'Bate rápido e todo desencontrado.', true),
      P('associados', 'Tem dor no peito, falta de ar ou desmaio?', ['dor', 'desmai', 'sincop', 'falta de ar', 'cansa', 'tontu', 'peito'], 'Um pouco de cansaço. Não tenho dor no peito e não desmaiei.', true),
      P('previo', 'Já teve isso antes?', ['antes', 'ja teve', 'primeira vez', 'outra vez', 'episodio'], 'Nunca tive isso antes.'),
      P('comorbidades', 'Tem alguma doença?', ['doenca', 'comorb', 'pressao', 'diabet', 'avc', 'derrame', 'coracao', 'problema de saude', 'insuficiencia'], 'Tenho pressão alta e diabetes. Tive um derrame pequeno há 3 anos.', true),
      P('medicacoes', 'Usa algum remédio?', ['remedio', 'medica', 'toma', 'uso'], 'Enalapril, metformina e AAS.'),
      P('tireoide', 'Tem problema de tireoide?', ['tireo', 'hipertireo'], 'Não, nunca tive problema de tireoide.'),
      P('sangramento', 'Já teve sangramento importante?', ['sangra', 'hemorrag', 'ulcera'], 'Nunca tive sangramento.', true),
      P('alcool', 'Bebe álcool?', ['bebe', 'alcool', 'bebida'], 'Não bebo.'),
    ],
    vitais: 'PA 132 x 84 mmHg · FC 138 bpm, irregular · FR 18 irpm · Tax 36,6 °C · SatO₂ 96%',
    exameFisico: {
      geral: 'Lúcida, corada, sem sinais de má perfusão.', cardio: 'Ritmo cardíaco irregularmente irregular, FC 138 bpm, sem sopros; déficit de pulso.',
      cabeca: 'Tireoide sem nódulos; sem turgência jugular.',
    },
    fisicoEssencial: ['vitais', 'cardio', 'resp'],
    exames: {
      tsh: 'TSH 1,8 mUI/L; T4 livre 1,1 ng/dL.', eletrolitos: 'Na 140 mEq/L; K 4,1 mEq/L; Mg 2,1 mg/dL.',
      ecocardiograma: 'FEVE 60%, átrio esquerdo aumentado (45 mm), sem trombo visível ao transtorácico.', funcao_renal: 'Ureia 36 mg/dL; creatinina 1,0 mg/dL (ClCr ~55 mL/min).',
    },
    examesEssenciais: ['ecg', 'tsh'], examesAceitaveis: ['eletrolitos', 'ecocardiograma', 'funcao_renal', 'hemograma', 'troponina', 'raio_x_torax', 'coagulograma', 'glicemia', 'bnp'],
    examesCriticos: ['ecg'], criticoMotivo: { ecg: 'sem ECG não se define o ritmo nem a conduta.' },
    diagnostico: {
      opcoes: [
        op('a', 'Fibrilação atrial de alta resposta ventricular, hemodinamicamente estável', true),
        op('b', 'Flutter atrial', false, 'No flutter há ondas F em serrote e o ritmo costuma ser regular.'),
        op('c', 'Taquicardia sinusal', false, 'Na sinusal há onda P antes de cada QRS e o RR é regular.'),
        op('d', 'Taquicardia ventricular', false, 'TV tem QRS largo; aqui o QRS é estreito.'),
        op('e', 'Taquicardia por reentrada nodal', false, 'A reentrada nodal é regular.'),
      ],
    },
    conduta: [
      op('c1', 'Paciente estável: controle da frequência cardíaca (meta FC < 110 bpm)', true),
      op('c2', 'Calcular CHA₂DS₂-VASc e HAS-BLED', true),
      op('c3', 'Anticoagulação oral (CHA₂DS₂-VASc = 6)', true),
      op('c4', 'Investigar causas: TSH, eletrólitos e ecocardiograma', true),
      op('c5', 'Cardioversão elétrica imediata', false, 'cardioversão imediata é para o paciente instável; ela está estável.'),
      op('c6', 'Manter só o AAS para prevenir AVC', false, 'AAS não protege contra AVC na fibrilação atrial; com CHA₂DS₂-VASc 6 a anticoagulação é obrigatória.', { perigoso: true }),
      op('c7', 'Adenosina para reverter o ritmo', false, 'adenosina não reverte fibrilação atrial.'),
    ],
    prescricao: [
      op('p1', 'Metoprolol 5 mg IV lento (até 3 doses) e depois VO para controle da FC', true),
      op('p2', 'Apixabana 5 mg VO 12/12 h', true),
      op('p3', 'Varfarina com meta de INR 2–3 (alternativa aos anticoagulantes diretos)', true, '', { opcional: true }),
      op('p4', 'Digoxina IV se FEVE reduzida ou hipotensão', true, '', { opcional: true }),
      op('p5', 'Amiodarona IV como primeira escolha para controle de frequência', false, 'amiodarona não é primeira linha para controle de FC no paciente estável com FEVE normal.'),
      op('p6', 'Diltiazem associado a verapamil', false, 'dois bloqueadores de canal de cálcio juntos causam bradicardia e hipotensão graves.', { perigoso: true }),
      op('p7', 'Adenosina 6 mg IV em bolus', false, 'sem efeito na fibrilação atrial.'),
    ],
    pontosChave: [
      'Fibrilação atrial: ausência de onda P, linha de base irregular e RR irregularmente irregular.',
      'Instável: cardioversão elétrica sincronizada. Estável: controle de frequência (betabloqueador ou bloqueador de canal de cálcio).',
      'CHA₂DS₂-VASc ≥ 2 em homens ou ≥ 3 em mulheres: anticoagular. AAS não substitui.',
      'Pesquise causas reversíveis: tireoide, eletrólitos, valvopatia, álcool.',
    ],
  },
  {
    id: 'pneumonia-sepse', area: 'Clínica Médica', titulo: 'Idoso com febre e tosse', cenario: 'Pronto-socorro', ecg: null, dificuldade: 'Intermediária',
    paciente: { nome: 'Antônio Ferreira', idade: 68, sexo: 'M', ocupacao: 'aposentado' },
    queixa: 'Tô com febre e tosse faz uns dias, e agora tô sem ar.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo'], 'Começou faz 4 dias com febre e tosse.', true),
      P('tosse', 'Como é a tosse?', ['tosse', 'catarro', 'escarro', 'expector'], 'Tosse com catarro amarelo-esverdeado.', true),
      P('febre', 'Como é a febre?', ['febre', 'febril', 'temperatura', 'calafrio'], 'Febre alta, uns 39 graus, com calafrio.', true),
      P('dispneia', 'Tem falta de ar?', ['falta de ar', 'dispne', 'cansa', 'respir', 'fôlego', 'folego'], 'A falta de ar piorou desde ontem.', true),
      P('dor', 'Tem dor no peito?', ['dor', 'peito', 'pontada'], 'Dói do lado direito quando respiro fundo.'),
      P('confusao', 'Está confuso ou sonolento?', ['confus', 'sonol', 'desorient', 'esquec'], '(Filha) Hoje ele tá meio confuso, trocando as palavras.'),
      P('comorbidades', 'Tem alguma doença?', ['doenca', 'comorb', 'pressao', 'dpoc', 'pulmao', 'problema de saude', 'enfisema', 'bronquite'], 'Tenho DPOC e pressão alta.', true),
      P('medicacoes', 'Usa algum remédio?', ['remedio', 'medica', 'toma', 'uso', 'bombinha'], 'Uso bombinha de formoterol com budesonida e losartana.'),
      P('tabagismo', 'Fuma?', ['fuma', 'cigarr', 'tabag'], 'Fumei 40 anos, parei há 5.'),
      P('antibiotico', 'Usou antibiótico ou foi internado recentemente?', ['antibiot', 'internad', 'internac', 'hospital'], 'Não usei antibiótico nem fui internado nos últimos 3 meses.', true),
      P('vacinas', 'Está com as vacinas em dia?', ['vacin', 'gripe', 'pneumoc'], 'Não tomei a vacina da gripe este ano nem a da pneumonia.'),
    ],
    vitais: 'PA 86 x 50 mmHg (PAM 62) · FC 118 bpm · FR 30 irpm · Tax 39,1 °C · SatO₂ 88% em ar ambiente',
    exameFisico: {
      geral: 'Prostrado, desidratado, sonolento mas responde (Glasgow 14).', resp: 'Macicez, estertores crepitantes e broncofonia aumentada em base direita.',
      cardio: 'Taquicárdico, ritmo regular, enchimento capilar de 4 s.', extremidades: 'Extremidades frias, livedo em joelhos.', neuro: 'Confuso, sem déficit focal.',
    },
    fisicoEssencial: ['vitais', 'resp', 'extremidades'],
    exames: {
      raio_x_torax: 'Consolidação em lobo inferior direito com broncograma aéreo.', lactato: 'Lactato: 4,6 mmol/L.',
      gasometria: 'pH 7,30; pCO₂ 34 mmHg; pO₂ 56 mmHg; HCO₃ 16 mEq/L; lactato 4,6 mmol/L.',
      hemograma: 'Leucócitos 21.000/mm³ com 12% de bastões; plaquetas 140.000/mm³.', pcr: 'PCR: 210 mg/L.',
      funcao_renal: 'Ureia 78 mg/dL; creatinina 1,8 mg/dL.', coagulograma: 'INR 1,3; TTPa 34 s.', bilirrubinas: 'Bilirrubina total 1,1 mg/dL.',
    },
    examesEssenciais: ['raio_x_torax', ['lactato', 'gasometria'], 'hemocultura'],
    examesAceitaveis: ['hemograma', 'pcr', 'funcao_renal', 'eletrolitos', 'bilirrubinas', 'coagulograma', 'tgo_tgp', 'ecg', 'urina1', 'glicemia', 'gasometria', 'lactato'],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Pneumonia comunitária grave com sepse e hipoperfusão (CURB-65 = 5)', true),
        op('b', 'Exacerbação de DPOC sem infecção', false, 'Há consolidação, febre alta e hipoperfusão: é pneumonia com sepse.'),
        op('c', 'Tromboembolismo pulmonar', false),
        op('d', 'Insuficiência cardíaca descompensada', false),
        op('e', 'Tuberculose pulmonar', false, 'Quadro agudo de 4 dias com consolidação lobar fala a favor de pneumonia bacteriana.'),
      ],
    },
    conduta: [
      op('c1', 'Pacote da 1ª hora: lactato, hemoculturas, antibiótico e cristaloide 30 mL/kg', true),
      op('c2', 'Noradrenalina se PAM < 65 mmHg durante ou após a reposição volêmica', true),
      op('c3', 'Oxigênio com alvo de SatO₂ 88–92% (DPOC)', true),
      op('c4', 'Internação em UTI', true),
      op('c5', 'Tratamento ambulatorial com amoxicilina', false, 'CURB-65 de 5 e sepse: internação em UTI.', { perigoso: true }),
      op('c6', 'Esperar o resultado da hemocultura para iniciar antibiótico', false, 'cada hora de atraso do antibiótico na sepse aumenta a mortalidade.', { perigoso: true }),
      op('c7', 'Corticoide em dose alta para todos com pneumonia', false, 'não é rotina.'),
    ],
    prescricao: [
      op('p1', 'Ringer lactato ou SF 0,9% 30 mL/kg IV nas primeiras 3 horas', true),
      op('p2', 'Ceftriaxona 2 g IV 1x/dia + azitromicina 500 mg IV 1x/dia', true),
      op('p3', 'Noradrenalina em bomba, titulada para PAM ≥ 65 mmHg', true),
      op('p4', 'Enoxaparina 40 mg SC 1x/dia (profilaxia de TEV)', true, '', { opcional: true }),
      op('p5', 'Amoxicilina 500 mg VO 8/8 h', false, 'insuficiente para pneumonia grave.'),
      op('p6', 'Dopamina como vasopressor de primeira escolha', false, 'a noradrenalina é a primeira escolha; dopamina causa mais arritmia.'),
      op('p7', 'Furosemida 40 mg IV para melhorar a oxigenação', false, 'diurético num paciente hipotenso e hipovolêmico agrava o choque.', { perigoso: true }),
    ],
    pontosChave: [
      'CURB-65: Confusão, Ureia > 50 mg/dL, FR ≥ 30, PA < 90 x 60, idade ≥ 65. 0–1 ambulatório, 2 internação, ≥ 3 grave.',
      'Sepse: pacote da 1ª hora (lactato, hemoculturas, antibiótico, 30 mL/kg se hipotensão ou lactato ≥ 4).',
      'Vasopressor de escolha: noradrenalina, alvo PAM ≥ 65 mmHg.',
      'PAC grave: betalactâmico + macrolídeo (ou quinolona respiratória).',
    ],
  },
  {
    id: 'avc-isquemico', area: 'Clínica Médica', titulo: 'Fraqueza súbita no braço', cenario: 'Pronto-socorro, 9h30', ecg: 'fa', dificuldade: 'Avançada',
    paciente: { nome: 'Sebastião Rocha', idade: 66, sexo: 'M', ocupacao: 'pedreiro aposentado' },
    saudacao: '(Esposa) Bom dia, doutor. Ele tá com a fala enrolada, eu ajudo a contar.',
    queixa: '(Esposa) Doutor, no café da manhã a boca dele entortou e o braço direito ficou fraco.',
    anamnese: [
      P('inicio', 'Que horas começou? Quando foi visto bem pela última vez?', ['comec', 'quando', 'hora', 'inicio', 'tempo', 'visto bem', 'ultima vez', 'normal'], '(Esposa) Foi às 8 horas em ponto, eu tava junto. Antes disso ele tava normal. Agora são 9 e meia.', true),
      P('sintomas', 'Quais sintomas apareceram?', ['sintom', 'fraque', 'fala', 'boca', 'braco', 'perna', 'forca', 'enrol'], '(Esposa) A boca entortou, o braço e a perna direita ficaram fracos e a fala tá enrolada.'),
      P('cefaleia', 'Teve dor de cabeça forte ou vômito?', ['cabeca', 'cefal', 'vomit'], 'Não… não tive dor de cabeça forte nem vomitei.', true),
      P('trauma', 'Caiu, bateu a cabeça ou teve convulsão?', ['caiu', 'queda', 'bateu', 'convuls', 'trauma', 'ataque'], '(Esposa) Não caiu, não bateu a cabeça e não teve convulsão.'),
      P('comorbidades', 'Tem alguma doença?', ['doenca', 'comorb', 'pressao', 'diabet', 'coracao', 'problema de saude', 'hipert'], '(Esposa) Pressão alta e diabetes. E às vezes o coração dele dispara.', true),
      P('medicacoes', 'Usa remédio para afinar o sangue?', ['remedio', 'medica', 'anticoag', 'afinar', 'varfarina', 'marevan', 'sangue', 'toma'], '(Esposa) Toma losartana e metformina. Não toma nada pra afinar o sangue.', true),
      P('contraindicacoes', 'Teve sangramento, cirurgia ou AVC recente?', ['sangra', 'cirurg', 'avc', 'derrame', 'hemorrag', 'recente'], '(Esposa) Não teve sangramento, cirurgia nem derrame antes.', true),
      P('tabagismo', 'Fuma?', ['fuma', 'cigarr', 'tabag'], 'Fumo… uns 10 cigarros por dia.'),
    ],
    vitais: 'PA 178 x 96 mmHg · FC 96 bpm, irregular · FR 18 irpm · Tax 36,5 °C · SatO₂ 96% · Glicemia capilar 132 mg/dL',
    exameFisico: {
      geral: 'Lúcido, ansioso.', neuro: 'Paresia facial central à direita, hemiparesia direita (força grau 3 no membro superior e 4 no inferior), disartria moderada, sem alteração de consciência. NIHSS 8.',
      cardio: 'Ritmo irregular, sem sopros. Carótidas sem sopros.', cabeca: 'Sem sinais de trauma, sem rigidez de nuca.',
    },
    fisicoEssencial: ['vitais', 'neuro'],
    exames: {
      tc_cranio: 'TC sem contraste: sem sangramento, sem área hipodensa estabelecida (ASPECTS 10).', coagulograma: 'INR 1,0; TTPa 29 s.',
      hemograma: 'Hb 14,2 g/dL; leucócitos 8.100/mm³; plaquetas 230.000/mm³.', glicemia: 'Glicemia: 132 mg/dL.',
      angiotc_cranio: 'Sem oclusão de grande vaso proximal.',
    },
    examesEssenciais: ['tc_cranio'], examesAceitaveis: ['ecg', 'coagulograma', 'hemograma', 'funcao_renal', 'eletrolitos', 'glicemia', 'troponina', 'angiotc_cranio', 'ecocardiograma'],
    examesCriticos: ['tc_cranio'], criticoMotivo: { tc_cranio: 'a TC sem contraste exclui hemorragia antes da trombólise.' },
    diagnostico: {
      opcoes: [
        op('a', 'AVC isquêmico agudo (artéria cerebral média esquerda) dentro da janela de trombólise', true),
        op('b', 'AVC hemorrágico', false, 'A TC não mostra sangramento.'),
        op('c', 'Hipoglicemia', false, 'A glicemia é 132 mg/dL.'),
        op('d', 'Paralisia de Bell', false, 'Na paralisia de Bell a paralisia facial é periférica e não há hemiparesia.'),
        op('e', 'Paralisia de Todd após convulsão', false, 'Não houve convulsão.'),
      ],
    },
    conduta: [
      op('c1', 'Trombólise IV (até 4,5 h do início) após TC sem sangramento', true),
      op('c2', 'Manter PA < 180 x 105 mmHg nas 24 h após a trombólise', true),
      op('c3', 'Internar em unidade de AVC com monitorização neurológica', true),
      op('c4', 'Avaliar trombectomia se houver oclusão de grande vaso', true, '', { opcional: true }),
      op('c5', 'Baixar a PA rapidamente para 120 x 80 mmHg', false, 'queda brusca da PA reduz a perfusão da penumbra e aumenta a área do infarto.', { perigoso: true }),
      op('c6', 'AAS 300 mg junto com a trombólise', false, 'antiagregante só 24 h depois da trombólise, após TC de controle.', { perigoso: true }),
      op('c7', 'Anticoagulação plena hoje por causa da fibrilação atrial', false, 'anticoagular na fase aguda aumenta o risco de transformação hemorrágica.', { perigoso: true }),
      op('c8', 'Repetir a TC em 24 h antes de qualquer tratamento', false, 'tempo é cérebro: a janela da trombólise é de 4,5 h.', { perigoso: true }),
    ],
    prescricao: [
      op('p1', 'Alteplase 0,9 mg/kg IV (máx. 90 mg): 10% em bolus e o restante em 1 hora', true),
      op('p2', 'Jejum até avaliar a deglutição', true),
      op('p3', 'Manter glicemia entre 140 e 180 mg/dL', true),
      op('p4', 'Heparina não fracionada em dose plena', false, 'contraindicada nas 24 h após trombólise.', { perigoso: true }),
      op('p5', 'Nifedipina sublingual', false, 'causa queda abrupta e imprevisível da PA.', { perigoso: true }),
      op('p6', 'Soro glicosado 5% de manutenção', false, 'a hiperglicemia piora o prognóstico do AVC.'),
    ],
    pontosChave: [
      'Defina o horário: a referência é a última vez em que o paciente foi visto bem.',
      'TC sem contraste antes de tudo, para excluir hemorragia. Glicemia capilar na chegada.',
      'Trombólise com alteplase até 4,5 h; PA precisa estar < 185 x 110 antes e < 180 x 105 nas 24 h depois.',
      'Sem antiagregante ou anticoagulante nas primeiras 24 h após trombólise.',
    ],
  },
  {
    id: 'apendicite', area: 'Cirurgia', titulo: 'Dor abdominal em jovem', cenario: 'UPA', ecg: null, dificuldade: 'Básica',
    paciente: { nome: 'Lucas Andrade', idade: 22, sexo: 'M', ocupacao: 'estudante' },
    queixa: 'Doutor, tô com uma dor na barriga que não passa.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo'], 'Começou ontem à noite, umas 18 horas atrás.', true),
      P('localizacao', 'Onde começou e onde dói agora?', ['onde', 'local', 'migr', 'umbigo', 'lado', 'mudou'], 'Começou em volta do umbigo e depois foi pro lado direito, embaixo.', true),
      P('carater', 'Como é a dor? O que piora?', ['como e', 'tipo', 'piora', 'melhora', 'andar', 'tossir', 'jeito'], 'É contínua e piora quando ando ou tusso.'),
      P('anorexia', 'Tem fome?', ['fome', 'apetite', 'comer', 'anorex', 'comida'], 'Perdi a fome total.', true),
      P('vomitos', 'Teve náusea ou vômito?', ['vomit', 'enjo', 'nause'], 'Enjoei e vomitei uma vez, depois que a dor começou.', true),
      P('febre', 'Teve febre?', ['febre', 'febril', 'temperatura'], 'Tô meio febril, deu 37,8 em casa.'),
      P('intestino', 'Como está o intestino?', ['intestin', 'diarr', 'evacu', 'fezes'], 'Intestino normal, sem diarreia.'),
      P('urina', 'Como está a urina?', ['urina', 'xixi', 'urinar', 'ardencia', 'sangue na urina'], 'Urina normal, sem ardência nem sangue.'),
    ],
    vitais: 'PA 122 x 76 mmHg · FC 98 bpm · FR 18 irpm · Tax 38,0 °C · SatO₂ 99%',
    exameFisico: {
      geral: 'Fácies de dor, anda curvado.', abdome: 'Dor à palpação em fossa ilíaca direita, Blumberg positivo (descompressão brusca dolorosa no ponto de McBurney), Rovsing positivo, defesa localizada.',
      especifico: 'Sinal do psoas positivo; toque retal doloroso à direita.',
    },
    fisicoEssencial: ['vitais', 'abdome'],
    exames: {
      hemograma: 'Leucócitos 14.500/mm³ com desvio à esquerda (8% de bastões); Hb 14,8 g/dL; plaquetas 260.000/mm³.', pcr: 'PCR: 48 mg/L.',
      usg_abdome: 'Apêndice não compressível, 9 mm de diâmetro, com borramento da gordura periapendicular.',
      tc_abdome: 'Apêndice espessado (10 mm), densificação da gordura, sem abscesso ou perfuração.',
    },
    examesEssenciais: ['hemograma'], examesAceitaveis: ['pcr', 'urina1', 'usg_abdome', 'tc_abdome', 'eletrolitos', 'funcao_renal', 'coagulograma', 'glicemia', 'amilase_lipase'],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Apendicite aguda (Alvarado 10)', true),
        op('b', 'Litíase ureteral direita', false, 'A cólica renal tem dor lombar em cólica e hematúria; aqui há peritonite localizada.'),
        op('c', 'Diverticulite', false, 'Rara aos 22 anos e mais comum à esquerda.'),
        op('d', 'Adenite mesentérica', false),
        op('e', 'Doença de Crohn', false),
      ],
    },
    conduta: [
      op('c1', 'Apendicectomia, de preferência por videolaparoscopia', true),
      op('c2', 'Jejum, hidratação venosa e analgesia', true),
      op('c3', 'Antibioticoprofilaxia antes da cirurgia', true),
      op('c4', 'Não fazer analgesia para não mascarar o exame', false, 'analgesia não atrapalha o diagnóstico e deve ser feita.'),
      op('c5', 'Alta com antiespasmódico e reavaliar em 48 h', false, 'apendicite sem tratamento evolui para perfuração e peritonite.', { perigoso: true }),
      op('c6', 'Colonoscopia de urgência', false, 'contraindicada: risco de perfuração.', { perigoso: true }),
    ],
    prescricao: [
      op('p1', 'Dipirona 1 g IV 6/6 h; morfina se dor intensa', true),
      op('p2', 'Cefazolina 2 g IV + metronidazol 500 mg IV na indução (profilaxia)', true),
      op('p3', 'SF 0,9% para hidratação venosa', true),
      op('p4', 'Laxativo para aliviar a dor', false, 'laxativo no abdome agudo inflamatório pode precipitar perfuração.', { perigoso: true }),
      op('p5', 'Ciprofloxacino VO e alta', false, 'apendicite com peritonite localizada é cirúrgica.'),
    ],
    pontosChave: [
      'Alvarado: migração da dor (1), anorexia (1), náusea/vômito (1), dor em FID (2), descompressão dolorosa (1), febre (1), leucocitose (2), desvio à esquerda (1).',
      'Alvarado ≥ 7 com quadro típico: cirurgia. Na dúvida: USG (crianças e gestantes) ou TC (adultos).',
      'Analgesia não mascara o diagnóstico.',
    ],
  },
  {
    id: 'pneumotorax-hipertensivo', area: 'Cirurgia', titulo: 'Motociclista com falta de ar', cenario: 'Sala de emergência, trazido pelo SAMU', ecg: null, dificuldade: 'Intermediária',
    paciente: { nome: 'Rafael Souza', idade: 28, sexo: 'M', ocupacao: 'entregador' },
    queixa: 'Doutor… tô sem ar… dói muito o peito.',
    anamnese: [
      P('mecanismo', 'Como foi o acidente?', ['como', 'acident', 'aconteceu', 'bateu', 'mecan', 'quando', 'moto'], 'Bati de moto num carro e caí de lado no asfalto, uns 40 minutos atrás.', true),
      P('dor', 'Onde dói?', ['dor', 'doi', 'onde', 'peito'], 'O lado esquerdo do peito, muito.', true),
      P('dispneia', 'Está com falta de ar?', ['falta de ar', 'dispne', 'respir', 'sem ar', 'puxar o ar'], 'Cada vez pior… não consigo puxar o ar.', true),
      P('consciencia', 'Desmaiou ou bateu a cabeça?', ['desmai', 'apag', 'lembr', 'cabeca', 'capacete'], 'Não desmaiei. Tava de capacete.'),
      P('refeicao', 'Quando comeu pela última vez?', ['comeu', 'jejum', 'refei', 'aliment', 'almo'], 'Almocei faz umas 2 horas.'),
      P('medicacoes', 'Usa algum remédio?', ['remedio', 'medica', 'toma'], 'Não tomo nada.'),
    ],
    vitais: 'PA 80 x 50 mmHg · FC 132 bpm · FR 36 irpm · Tax 36,0 °C · SatO₂ 82% com máscara não reinalante',
    exameFisico: {
      geral: 'Agitado, cianótico, com colar cervical.', cabeca: 'Turgência jugular; traqueia desviada para a direita.',
      resp: 'Murmúrio vesicular abolido e hipertimpanismo à percussão no hemitórax esquerdo; expansibilidade reduzida à esquerda.',
      cardio: 'Taquicárdico, bulhas normofonéticas.', extremidades: 'Escoriações no membro superior esquerdo; pulsos finos.', neuro: 'Glasgow 15, pupilas isocóricas e fotorreagentes.',
    },
    fisicoEssencial: ['vitais', 'resp', 'cabeca'],
    exames: {
      fast: 'eFAST: ausência de deslizamento pleural à esquerda; sem líquido livre no abdome e no pericárdio.',
      raio_x_torax: 'Pneumotórax volumoso à esquerda com desvio do mediastino para a direita.', hemograma: 'Hb 13,9 g/dL; leucócitos 12.000/mm³.',
      tipagem: 'Tipagem: O positivo. Prova cruzada em andamento.',
    },
    examesEssenciais: [], examesAceitaveis: ['fast', 'hemograma', 'tipagem', 'gasometria', 'coagulograma', 'beta_hcg'],
    examesPerigosos: { raio_x_torax: 'Pediu raio X antes de descomprimir: o pneumotórax hipertensivo é diagnóstico clínico e o exame atrasa o tratamento.' },
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Pneumotórax hipertensivo à esquerda', true),
        op('b', 'Hemotórax maciço', false, 'No hemotórax há macicez, não hipertimpanismo, e as jugulares costumam estar vazias.'),
        op('c', 'Tamponamento cardíaco', false, 'No tamponamento o murmúrio é normal e não há desvio de traqueia.'),
        op('d', 'Contusão pulmonar', false),
        op('e', 'Choque neurogênico', false, 'O choque neurogênico cursa com bradicardia e pele quente.'),
      ],
    },
    conduta: [
      op('c1', 'Descompressão imediata com agulha (4º–5º EIC entre linha axilar anterior e média, ou 2º EIC na linha hemiclavicular)', true),
      op('c2', 'Drenagem torácica em selo d’água no 5º EIC, linha axilar média, após a descompressão', true),
      op('c3', 'Seguir o ABCDE com restrição de movimento da coluna', true),
      op('c4', 'Raio X de tórax para confirmar antes de descomprimir', false, 'o diagnóstico é clínico; esperar o exame pode levar à parada.', { perigoso: true }),
      op('c5', 'Intubar antes de descomprimir o tórax', false, 'a ventilação com pressão positiva aumenta o pneumotórax e precipita a parada.', { perigoso: true }),
      op('c6', 'Pericardiocentese', false, 'não há tamponamento.'),
    ],
    prescricao: [
      op('p1', 'Oxigênio em máscara não reinalante 10–15 L/min', true),
      op('p2', 'Cristaloide aquecido 1 L IV, avaliando a resposta', true),
      op('p3', 'Analgesia com opioide IV em dose baixa após a descompressão', true, '', { opcional: true }),
      op('p4', 'Noradrenalina para corrigir a hipotensão', false, 'é choque obstrutivo: a pressão volta com a descompressão, não com vasopressor.', { perigoso: true }),
      op('p5', 'Furosemida IV', false, 'sem indicação.'),
    ],
    pontosChave: [
      'Pneumotórax hipertensivo: dispneia, hipotensão, turgência jugular, desvio de traqueia, murmúrio abolido e hipertimpanismo.',
      'Diagnóstico clínico: descompressão imediata, sem esperar imagem.',
      'Depois da agulha, drenagem torácica no 5º espaço intercostal, linha axilar média.',
    ],
  },
  {
    id: 'pre-eclampsia', area: 'Ginecologia e Obstetrícia', titulo: 'Gestante com dor de cabeça', cenario: 'Maternidade, pronto atendimento', ecg: null, dificuldade: 'Intermediária',
    paciente: { nome: 'Juliana Costa', idade: 27, sexo: 'F', ocupacao: 'vendedora' },
    queixa: 'Tô grávida e tô com uma dor de cabeça muito forte.',
    anamnese: [
      P('ig', 'De quantas semanas está? É a primeira gravidez?', ['seman', 'gravidez', 'gestac', 'idade gestac', 'dum', 'mes', 'primeira'], 'Tô de 34 semanas, é minha primeira gravidez.', true),
      P('cefaleia', 'Como é a dor de cabeça?', ['cabeca', 'cefal', 'dor'], 'Dor de cabeça forte desde ontem, que não passa com dipirona.', true),
      P('visual', 'Tem alteração na visão?', ['visao', 'enxerg', 'escotom', 'vista', 'luz', 'pontinho'], 'Tô vendo uns pontinhos brilhantes.', true),
      P('epigastralgia', 'Tem dor na barriga ou no estômago?', ['estomago', 'epigast', 'barriga', 'abdom', 'boca do estomago'], 'Dói aqui em cima da barriga, no estômago.', true),
      P('edema', 'Está inchada?', ['inch', 'edema'], 'Inchou muito o rosto e as mãos essa semana.'),
      P('mf', 'O bebê está mexendo?', ['mex', 'bebe', 'moviment'], 'O bebê tá mexendo normal.', true),
      P('perdas', 'Perdeu líquido ou sangue?', ['liquid', 'sangr', 'perd', 'bolsa'], 'Não perdi líquido nem sangue.'),
      P('contracoes', 'Tem contrações?', ['contra', 'dor de parto', 'endurec'], 'Sem contração.'),
      P('prenatal', 'Como foi o pré-natal? E a pressão?', ['pre-natal', 'prenatal', 'consulta', 'pressao'], 'Fiz 6 consultas, a pressão sempre foi normal.'),
      P('medicacoes', 'Usa algum remédio?', ['remedio', 'medica', 'toma'], 'Só sulfato ferroso e ácido fólico.'),
    ],
    vitais: 'PA 170 x 112 mmHg (confirmada após 15 min) · FC 92 bpm · FR 18 irpm · Tax 36,7 °C · SatO₂ 98%',
    exameFisico: {
      geral: 'Ansiosa, edema de face e mãos.', especifico: 'Altura uterina 32 cm, BCF 142 bpm, útero sem contrações, colo fechado e posterior.',
      neuro: 'Reflexos patelares vivos, sem déficits, sem rigidez de nuca.', abdome: 'Dor à palpação em epigástrio e hipocôndrio direito.',
      extremidades: 'Edema 2+/4+ em membros inferiores.',
    },
    fisicoEssencial: ['vitais', 'especifico', 'neuro'],
    exames: {
      proteinuria: 'Relação proteína/creatinina urinária: 2,1 (ref < 0,3).', urina1: 'Proteína 3+.',
      hemograma: 'Hb 11,8 g/dL; leucócitos 9.800/mm³; plaquetas 88.000/mm³; esquizócitos presentes.', tgo_tgp: 'TGO 168 U/L; TGP 142 U/L.',
      ldh: 'LDH 720 U/L.', bilirrubinas: 'Bilirrubina total 1,6 mg/dL (indireta 1,2).', funcao_renal: 'Creatinina 1,0 mg/dL; ácido úrico 7,2 mg/dL.',
      cardiotocografia: 'Categoria I: FCF 140 bpm, variabilidade moderada, acelerações presentes.', usg_obstetrica: 'Feto de 34 semanas, peso 2.100 g (p20), ILA 8 cm, Doppler normal.',
    },
    examesEssenciais: [['proteinuria', 'urina1'], 'hemograma', 'tgo_tgp'],
    examesAceitaveis: ['ldh', 'bilirrubinas', 'funcao_renal', 'cardiotocografia', 'usg_obstetrica', 'coagulograma', 'eletrolitos', 'glicemia', 'tipagem'],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Pré-eclâmpsia grave com síndrome HELLP e sinais de iminência de eclâmpsia', true),
        op('b', 'Hipertensão gestacional', false, 'Há proteinúria e lesão de órgão-alvo: é pré-eclâmpsia.'),
        op('c', 'Eclâmpsia', false, 'Eclâmpsia exige convulsão.'),
        op('d', 'Esteatose hepática aguda da gestação', false),
        op('e', 'Enxaqueca na gestação', false),
      ],
    },
    conduta: [
      op('c1', 'Sulfato de magnésio para prevenir eclâmpsia', true),
      op('c2', 'Anti-hipertensivo de ação rápida se PA ≥ 160 x 110 mmHg', true),
      op('c3', 'Estabilizar e interromper a gestação (HELLP com 34 semanas)', true),
      op('c4', 'Monitorar diurese, reflexos e frequência respiratória (toxicidade do magnésio)', true),
      op('c5', 'Corticoide para maturação pulmonar e aguardar 48 h para o parto', false, 'com 34 semanas o corticoide não é indicado e esperar agrava a HELLP.'),
      op('c6', 'Conduta expectante ambulatorial até 37 semanas', false, 'HELLP e iminência de eclâmpsia exigem internação e parto.', { perigoso: true }),
      op('c7', 'Diurético para reduzir o edema', false, 'a gestante com pré-eclâmpsia tem volume intravascular reduzido.'),
    ],
    prescricao: [
      op('p1', 'Sulfato de magnésio (Zuspan): 4 g IV em 20 min + 1 g/h IV contínuo', true),
      op('p2', 'Hidralazina 5 mg IV, repetindo a cada 20 min se PA ≥ 160 x 110', true),
      op('p3', 'Gluconato de cálcio 10% 10 mL disponível à beira-leito', true),
      op('p4', 'Nifedipina sublingual', false, 'via sublingual causa queda abrupta da PA e sofrimento fetal.'),
      op('p5', 'Enalapril 10 mg VO', false, 'IECA é contraindicado na gestação.', { perigoso: true }),
      op('p6', 'Furosemida 40 mg IV', false, 'sem indicação.'),
    ],
    pontosChave: [
      'Iminência de eclâmpsia: cefaleia, escotomas, epigastralgia, hiper-reflexia.',
      'HELLP: hemólise (LDH > 600, esquizócitos), TGO > 70 e plaquetas < 100.000.',
      'Sulfato de magnésio (Zuspan ou Pritchard). Toxicidade: reflexos abolidos, FR < 16, diurese < 25 mL/h. Antídoto: gluconato de cálcio.',
      'Anti-hipertensivos na crise: hidralazina IV ou nifedipina oral. Nunca IECA na gestação.',
    ],
  },
  {
    id: 'hpp-atonia', area: 'Ginecologia e Obstetrícia', titulo: 'Puérpera sangrando', cenario: 'Centro obstétrico, 30 min após o parto', ecg: null, dificuldade: 'Intermediária',
    paciente: { nome: 'Patrícia Lima', idade: 31, sexo: 'F', ocupacao: 'cozinheira' },
    queixa: 'Tô sentindo muito sangue descendo e tô tonta.',
    anamnese: [
      P('parto', 'Como foi o parto?', ['parto', 'nasc', 'bebe', 'quando', 'peso', 'demorou'], 'Nasceu há meia hora, um menino de 4,1 kg. O trabalho de parto demorou muito.', true),
      P('sangramento', 'Desde quando está sangrando?', ['sangr', 'sangue', 'perd', 'quanto'], 'Desde que saiu a placenta não para de sangrar.', true),
      P('sintomas', 'Como está se sentindo?', ['tont', 'frio', 'desmai', 'fraca', 'sentindo'], 'Tô tonta e com frio.'),
      P('paridade', 'Quantos filhos tem?', ['filho', 'gestac', 'gravidez', 'parto anterior', 'gesta'], 'É o meu terceiro filho.'),
      P('ocitocina', 'Recebeu ocitocina após o nascimento?', ['ocitoc', 'medica', 'recebeu', 'remedio', 'injec', 'fez'], '(Enfermeira) Fez ocitocina 10 UI IM logo após o nascimento.', true),
      P('placenta', 'Como saiu a placenta?', ['placenta', 'dequit', 'secundam'], '(Enfermeira) A placenta saiu inteira, com 10 minutos.', true),
      P('coagulopatia', 'Já teve problema de sangramento?', ['coagul', 'problema de sangr', 'hemofil', 'antes'], 'Nunca tive problema de sangramento.'),
    ],
    vitais: 'PA 88 x 50 mmHg · FC 124 bpm (índice de choque 1,4) · FR 24 irpm · Tax 36,2 °C · SatO₂ 97%',
    exameFisico: {
      geral: 'Pálida, sudoreica e ansiosa.', especifico: 'Útero amolecido, acima da cicatriz umbilical; sangramento vaginal intenso com coágulos; sem lacerações visíveis no canal; placenta íntegra conferida.',
      abdome: 'Útero mole e aumentado à palpação.', cardio: 'Taquicárdica, bulhas normofonéticas.', extremidades: 'Extremidades frias, enchimento capilar de 4 s.',
    },
    fisicoEssencial: ['vitais', 'especifico'],
    exames: {
      hemograma: 'Hb 7,6 g/dL; plaquetas 190.000/mm³.', coagulograma: 'INR 1,1; TTPa 31 s; fibrinogênio 280 mg/dL.',
      tipagem: 'Tipagem: O positivo. Duas unidades de concentrado de hemácias reservadas.', lactato: 'Lactato: 3,2 mmol/L.',
    },
    examesEssenciais: [], examesAceitaveis: ['hemograma', 'coagulograma', 'tipagem', 'lactato', 'gasometria', 'funcao_renal', 'eletrolitos'],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Hemorragia pós-parto por atonia uterina', true),
        op('b', 'Retenção de restos placentários', false, 'A placenta saiu íntegra.'),
        op('c', 'Laceração de trajeto', false, 'Não há lacerações e o útero está amolecido.'),
        op('d', 'Rotura uterina', false),
        op('e', 'Coagulopatia', false, 'Coagulograma e fibrinogênio normais.'),
      ],
    },
    conduta: [
      op('c1', 'Pedir ajuda, acionar o protocolo de hemorragia e puncionar dois acessos calibrosos', true),
      op('c2', 'Massagem uterina bimanual', true),
      op('c3', 'Ocitocina IV (uterotônico de primeira linha)', true),
      op('c4', 'Ácido tranexâmico nas primeiras 3 horas', true),
      op('c5', 'Se não responder: misoprostol ou metilergometrina, balão de tamponamento e, se preciso, cirurgia', true),
      op('c6', 'Aguardar o hemograma para iniciar o tratamento', false, 'na hemorragia pós-parto cada minuto conta (hora de ouro).', { perigoso: true }),
      op('c7', 'Histerectomia imediata como primeira medida', false, 'histerectomia é o último passo, após falha das medidas clínicas e conservadoras.'),
    ],
    prescricao: [
      op('p1', 'Ocitocina 5 UI IV lento + 20 UI em 500 mL de SF a 250 mL/h', true),
      op('p2', 'Ácido tranexâmico 1 g IV em 10 min (repetir após 30 min se persistir)', true),
      op('p3', 'Cristaloide aquecido e concentrado de hemácias se instabilidade persistir', true),
      op('p4', 'Misoprostol 800 mcg via retal se o sangramento persistir', true, '', { opcional: true }),
      op('p5', 'Metilergometrina 0,2 mg IM (não hipertensa)', true, '', { opcional: true }),
      op('p6', 'Furosemida para manter a diurese', false, 'diurético em choque hipovolêmico agrava a hipoperfusão.', { perigoso: true }),
      op('p7', 'Dopamina antes de repor volume', false, 'choque hemorrágico se trata com volume e sangue.', { perigoso: true }),
    ],
    pontosChave: [
      'Os 4 Ts da hemorragia pós-parto: Tônus (atonia, a mais comum), Trauma, Tecido (restos) e Trombina.',
      'Índice de choque (FC/PAS) ≥ 1 indica sangramento grave; ≥ 1,4 indica necessidade de transfusão.',
      'Ocitocina é a primeira linha; ácido tranexâmico nas primeiras 3 horas.',
      'Fatores de risco de atonia: macrossomia, trabalho de parto prolongado, multiparidade, gemelaridade, polidrâmnio.',
    ],
  },
  {
    id: 'diarreia-desidratacao', area: 'Pediatria', titulo: 'Criança com diarreia e vômitos', cenario: 'UBS', ecg: null, dificuldade: 'Básica',
    paciente: { nome: 'Enzo (com a mãe)', idade: 2, sexo: 'M', ocupacao: 'criança' },
    saudacao: '(Mãe) Bom dia, doutor.',
    queixa: '(Mãe) Doutor, ele tá com diarreia e vomitando desde ontem.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo'], '(Mãe) Começou ontem de manhã.', true),
      P('diarreia', 'Como é a diarreia? Tem sangue?', ['diarr', 'fezes', 'coco', 'evacu', 'sangue', 'muco', 'vezes'], '(Mãe) Umas 8 vezes por dia, bem líquida, sem sangue.', true),
      P('vomitos', 'Quantas vezes vomitou?', ['vomit', 'enjo'], '(Mãe) Vomitou 4 vezes, mas aceita um pouco de água.'),
      P('febre', 'Teve febre?', ['febre', 'febril', 'temperatura'], '(Mãe) Teve febre de 38 ontem.'),
      P('diurese', 'Está fazendo xixi?', ['xixi', 'urin', 'fralda', 'diurese'], '(Mãe) Fez pouco xixi hoje, a fralda tá mais seca.', true),
      P('sede', 'Está com sede? Está bebendo?', ['sede', 'bebe', 'agua', 'aceita', 'mama', 'come', 'beber'], '(Mãe) Tá com muita sede, bebe com vontade.', true),
      P('comportamento', 'Como está o comportamento dele?', ['comport', 'irrit', 'sonol', 'choro', 'chora', 'ativo', 'brinca'], '(Mãe) Tá mais irritado, chorando bastante.', true),
      P('vacinas', 'As vacinas estão em dia?', ['vacin', 'rotavirus'], '(Mãe) Vacinas em dia, inclusive a do rotavírus.'),
      P('contatos', 'Alguém por perto com diarreia?', ['creche', 'contato', 'alguem', 'casa', 'escola'], '(Mãe) O primo da creche teve diarreia também.'),
      P('comorbidades', 'Ele tem alguma doença?', ['doenca', 'comorb', 'problema de saude', 'saudavel'], '(Mãe) Ele é saudável.'),
    ],
    vitais: 'Peso 12 kg (há 1 mês: 12,8 kg) · FC 140 bpm · FR 32 irpm · Tax 37,9 °C · SatO₂ 98%',
    exameFisico: {
      geral: 'Irritado, chora sem lágrimas, olhos fundos, bebe avidamente.', cabeca: 'Mucosas secas.',
      abdome: 'Levemente distendido, ruídos hidroaéreos aumentados, indolor.', extremidades: 'Sinal da prega: desaparece lentamente. Enchimento capilar de 2 s, pulsos cheios.',
      neuro: 'Irritado, sem sinais meníngeos.',
    },
    fisicoEssencial: ['vitais', 'geral', 'extremidades'],
    exames: { eletrolitos: 'Na 136 mEq/L; K 3,8 mEq/L.', hemograma: 'Hb 12,1 g/dL; leucócitos 9.800/mm³.' },
    examesEssenciais: [], examesAceitaveis: [],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Diarreia aguda com desidratação (plano B do Ministério da Saúde)', true),
        op('b', 'Desidratação grave (plano C)', false, 'Plano C exige letargia, incapacidade de beber, prega muito lenta (> 2 s) ou enchimento capilar > 5 s.'),
        op('c', 'Diarreia sem desidratação (plano A)', false, 'Olhos fundos, sede intensa, irritação e prega lenta: há desidratação.'),
        op('d', 'Disenteria', false, 'Não há sangue nas fezes.'),
        op('e', 'Invaginação intestinal', false),
      ],
    },
    conduta: [
      op('c1', 'Plano B: reidratação oral na unidade, 50–100 mL/kg em 4 a 6 horas', true),
      op('c2', 'Reavaliar periodicamente; se reidratado, passar ao plano A', true),
      op('c3', 'Manter o aleitamento e a alimentação após a reidratação', true),
      op('c4', 'Orientar os sinais de alarme e o retorno', true),
      op('c5', 'Hidratação venosa rápida de rotina', false, 'hidratação venosa é para o plano C ou falha da reidratação oral.'),
      op('c6', 'Antibiótico para toda diarreia aguda', false, 'antibiótico só na disenteria ou suspeita de cólera.'),
      op('c7', 'Antidiarreico (loperamida)', false, 'contraindicado em crianças: risco de íleo e toxicidade.', { perigoso: true }),
    ],
    prescricao: [
      op('p1', 'Soro de reidratação oral 600–1.200 mL em 4 a 6 h (50–100 mL/kg)', true),
      op('p2', 'Zinco 20 mg/dia VO por 10 a 14 dias', true),
      op('p3', 'Ondansetrona se vômitos persistentes atrapalham a reidratação', true, '', { opcional: true }),
      op('p4', 'Loperamida', false, 'contraindicada em crianças.', { perigoso: true }),
      op('p5', 'Ciprofloxacino', false, 'sem indicação: diarreia aquosa sem sangue.'),
      op('p6', 'SF 0,9% 20 mL/kg IV em bolus', false, 'não é plano C.'),
    ],
    pontosChave: [
      'Avalie: estado geral, olhos, lágrimas, sede, sinal da prega, pulso e enchimento capilar.',
      'Plano A (sem desidratação): domicílio. Plano B (desidratação): SRO 50–100 mL/kg em 4–6 h na unidade. Plano C (grave): hidratação venosa.',
      'Zinco por 10–14 dias. Antibiótico só na disenteria.',
    ],
  },
  {
    id: 'meningite', area: 'Pediatria', titulo: 'Criança com febre e sonolência', cenario: 'Pronto-socorro infantil', ecg: null, dificuldade: 'Intermediária',
    paciente: { nome: 'Ana Clara (com a mãe)', idade: 6, sexo: 'F', ocupacao: 'criança' },
    saudacao: '(Mãe) Bom dia, doutor. Ela tá muito mole.',
    queixa: '(Mãe) Doutor, ela tá com febre alta, dor de cabeça e vomitando.',
    anamnese: [
      P('inicio', 'Quando começou?', ['comec', 'inicio', 'quando', 'desde', 'quanto tempo'], '(Mãe) Ontem à tarde começou a febre alta e a dor de cabeça.', true),
      P('cefaleia', 'Como é a dor de cabeça?', ['cabeca', 'cefal', 'luz', 'fotofob'], '(Mãe) Dor de cabeça forte, ela não quer luz.'),
      P('vomitos', 'Como são os vômitos?', ['vomit', 'enjo'], '(Mãe) Vomitou em jato 3 vezes.', true),
      P('consciencia', 'Está sonolenta ou confusa?', ['sonol', 'acorda', 'confus', 'comport', 'consciencia', 'mole'], '(Mãe) Hoje tá muito sonolenta, difícil de acordar.', true),
      P('manchas', 'Apareceu alguma mancha na pele?', ['mancha', 'pele', 'roxa', 'pintinha', 'petequ', 'pinta'], '(Mãe) Apareceram umas manchinhas roxas nas pernas agora há pouco.', true),
      P('convulsao', 'Teve convulsão?', ['convul', 'ataque', 'tremor'], '(Mãe) Não teve convulsão.'),
      P('vacinas', 'As vacinas estão em dia?', ['vacin'], '(Mãe) Faltou o reforço da vacina meningocócica C.', true),
      P('contatos', 'Quem convive com ela?', ['contat', 'casa', 'escola', 'irmao', 'mora', 'convive'], '(Mãe) Mora comigo, o pai e o irmão de 3 anos. Vai à escola todo dia.'),
    ],
    vitais: 'FC 140 bpm · FR 28 irpm · Tax 39,6 °C · PA 96 x 58 mmHg · SatO₂ 97% · Enchimento capilar 2 s',
    exameFisico: {
      geral: 'Prostrada, toxemiada.', neuro: 'Sonolenta, Glasgow 13, rigidez de nuca, Kernig e Brudzinski positivos, sem sinais focais, pupilas isocóricas.',
      extremidades: 'Petéquias e púrpura em membros inferiores, que não desaparecem à pressão.', cabeca: 'Fundo de olho sem papiledema.',
    },
    fisicoEssencial: ['vitais', 'neuro', 'extremidades'],
    exames: {
      liquor: 'Líquor turvo: 2.400 células/mm³ (90% neutrófilos), proteína 210 mg/dL, glicose 18 mg/dL (glicemia 98), Gram com diplococos Gram-negativos.',
      hemocultura: 'Duas amostras coletadas antes do antibiótico: em andamento.', hemograma: 'Leucócitos 22.000/mm³ com desvio à esquerda; plaquetas 110.000/mm³.',
      pcr: 'PCR: 180 mg/L.', tc_cranio: 'Sem lesão expansiva ou sinais de hipertensão intracraniana.', coagulograma: 'INR 1,3; TTPa 36 s.',
    },
    examesEssenciais: ['hemocultura', 'liquor'], examesAceitaveis: ['hemograma', 'pcr', 'coagulograma', 'eletrolitos', 'glicemia', 'lactato', 'funcao_renal', 'tc_cranio', 'gasometria'],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Meningite bacteriana com meningococcemia (doença meningocócica)', true),
        op('b', 'Meningite viral', false, 'Na viral o líquor tem linfócitos e glicose normal.'),
        op('c', 'Encefalite herpética', false),
        op('d', 'Dengue grave', false),
        op('e', 'Púrpura trombocitopênica imune', false, 'Na PTI a criança está bem, sem febre nem sinais meníngeos.'),
      ],
    },
    conduta: [
      op('c1', 'Antibiótico imediato; se a punção for demorar, colher hemocultura e iniciar sem esperar', true),
      op('c2', 'Precaução respiratória por gotículas nas primeiras 24 h de antibiótico', true),
      op('c3', 'Notificação imediata e quimioprofilaxia dos contatos íntimos', true),
      op('c4', 'Dexametasona antes ou junto da primeira dose de antibiótico', true),
      op('c5', 'TC de crânio obrigatória antes de qualquer antibiótico', false, 'TC antes da punção só com sinais focais, papiledema, convulsão ou imunossupressão, e nunca atrasa o antibiótico.', { perigoso: true }),
      op('c6', 'Aguardar a cultura para escolher o antibiótico', false, 'meningococcemia mata em horas: o tratamento é empírico e imediato.', { perigoso: true }),
      op('c7', 'Tratamento domiciliar com amoxicilina', false, 'exige internação e antibiótico IV.', { perigoso: true }),
    ],
    prescricao: [
      op('p1', 'Ceftriaxona 100 mg/kg/dia IV (máx. 4 g/dia), de 12/12 h', true),
      op('p2', 'Dexametasona 0,15 mg/kg IV 6/6 h por 2 a 4 dias', true),
      op('p3', 'Rifampicina para os contatos íntimos (quimioprofilaxia)', true),
      op('p4', 'Aciclovir IV isolado', false, 'não cobre a meningite bacteriana.'),
      op('p5', 'Amoxicilina VO', false, 'inadequada.'),
      op('p6', 'Restrição hídrica rígida mesmo com hipotensão', false, 'pode agravar o choque.'),
    ],
    pontosChave: [
      'Febre + petéquias/púrpura + sinais meníngeos: doença meningocócica até prova em contrário.',
      'Líquor bacteriano: turvo, neutrófilos, proteína alta, glicose baixa.',
      'Antibiótico não espera exame. Ceftriaxona é o empírico de escolha na criança.',
      'Notificação imediata e quimioprofilaxia dos contatos íntimos (rifampicina).',
    ],
  },
  {
    id: 'tuberculose', area: 'Medicina de Família e Comunidade / Saúde Coletiva', titulo: 'Tosse prolongada na UBS', cenario: 'UBS, consulta de demanda espontânea', ecg: null, dificuldade: 'Básica',
    paciente: { nome: 'Cláudio Nunes', idade: 45, sexo: 'M', ocupacao: 'pedreiro' },
    queixa: 'Doutor, tô com uma tosse que não passa.',
    anamnese: [
      P('tosse', 'Há quanto tempo tem tosse? Tem catarro?', ['tosse', 'catarro', 'quanto tempo', 'quando', 'comec', 'semana'], 'Tô tossindo há umas cinco semanas, com catarro.', true),
      P('febre', 'Tem febre?', ['febre', 'tarde', 'febril'], 'Febre baixa no fim da tarde.', true),
      P('sudorese', 'Sua à noite?', ['suor', 'sudore', 'noite', 'molhado'], 'Acordo molhado de suor à noite.', true),
      P('peso', 'Perdeu peso?', ['peso', 'emagrec', 'quilos'], 'Perdi uns 7 kg em 2 meses.', true),
      P('hemoptise', 'Saiu sangue com a tosse?', ['sangue', 'hemopt'], 'Uma vez saiu um pouco de sangue no catarro.'),
      P('contato', 'Conhece alguém com tuberculose?', ['contat', 'alguem', 'tuberc', 'casa', 'famil', 'mora', 'convive'], 'Meu irmão, que mora comigo, teve tuberculose ano passado e não terminou o tratamento.', true),
      P('hiv', 'Já fez teste de HIV?', ['hiv', 'aids', 'teste', 'sexual', 'preserv'], 'Nunca fiz teste de HIV.', true),
      P('alcool', 'Bebe álcool?', ['alcool', 'bebe', 'cerveja', 'bebida'], 'Bebo cerveja todo fim de semana, bastante.'),
      P('tabagismo', 'Fuma?', ['fuma', 'cigarr', 'tabag'], 'Fumo meio maço por dia.'),
    ],
    vitais: 'PA 118 x 74 mmHg · FC 96 bpm · FR 20 irpm · Tax 37,9 °C · SatO₂ 96% · Peso 58 kg (IMC 19)',
    exameFisico: { geral: 'Emagrecido, hipocorado (+/4+).', resp: 'Estertores no ápice direito.' },
    fisicoEssencial: ['vitais', 'resp'],
    exames: {
      trm_tb: 'TRM-TB: MTB detectado, sem resistência à rifampicina.', baciloscopia: 'Baciloscopia: positiva (++).',
      raio_x_torax: 'Infiltrado com cavitação no lobo superior direito.', teste_rapido_hiv: 'Teste rápido para HIV: não reagente.',
      cultura_escarro: 'Cultura de escarro: em andamento (resultado em 2 a 8 semanas).', hemograma: 'Hb 11,9 g/dL; leucócitos 8.600/mm³.',
    },
    examesEssenciais: [['trm_tb', 'baciloscopia'], 'teste_rapido_hiv'],
    examesAceitaveis: ['raio_x_torax', 'cultura_escarro', 'hemograma', 'glicemia', 'tgo_tgp', 'funcao_renal', 'hba1c', 'vdrl', 'bilirrubinas'],
    examesCriticos: [],
    diagnostico: {
      opcoes: [
        op('a', 'Tuberculose pulmonar bacilífera, sensível à rifampicina', true),
        op('b', 'Pneumonia comunitária', false, 'Tosse > 3 semanas, febre vespertina, sudorese noturna e perda de peso apontam tuberculose.'),
        op('c', 'Câncer de pulmão', false),
        op('d', 'Paracoccidioidomicose', false),
        op('e', 'DPOC exacerbada', false),
      ],
    },
    conduta: [
      op('c1', 'Iniciar o esquema básico (2 meses de RHZE + 4 meses de RH) na própria UBS', true),
      op('c2', 'Tratamento diretamente observado (TDO)', true),
      op('c3', 'Notificar no SINAN', true),
      op('c4', 'Avaliar todos os contatos (sintomáticos e infecção latente)', true),
      op('c5', 'Internar todo paciente com tuberculose', false, 'o tratamento é ambulatorial na atenção básica.'),
      op('c6', 'Aguardar a cultura para iniciar o tratamento', false, 'com TRM-TB positivo, o tratamento começa no mesmo dia.', { perigoso: true }),
      op('c7', 'Encaminhar ao pneumologista e não tratar na UBS', false, 'tuberculose sensível é tratada na atenção básica.'),
    ],
    prescricao: [
      op('p1', 'RHZE em dose fixa combinada: 4 comprimidos/dia em jejum (peso 51–70 kg) por 2 meses', true),
      op('p2', 'Depois, RH por 4 meses', true),
      op('p3', 'Piridoxina (vitamina B6) pelo etilismo e baixo peso', true, '', { opcional: true }),
      op('p4', 'Levofloxacino por 7 dias', false, 'não trata tuberculose e pode mascarar o diagnóstico.'),
      op('p5', 'Isoniazida isolada por 6 meses', false, 'monoterapia em doença ativa seleciona resistência.', { perigoso: true }),
      op('p6', 'Amoxicilina com clavulanato', false, 'sem efeito na tuberculose.'),
    ],
    pontosChave: [
      'Sintomático respiratório: tosse ≥ 3 semanas na população geral (qualquer duração em populações vulneráveis).',
      'Diagnóstico: TRM-TB (preferencial) ou baciloscopia; cultura com teste de sensibilidade nos casos indicados.',
      'Esquema básico: 2 RHZE + 4 RH. Oferecer teste de HIV a todos.',
      'Notificação compulsória, TDO e avaliação de contatos.',
    ],
  },
];

export const CASOS = [...LOTE1, ...LOTE2];
export const CASO_POR_ID = Object.fromEntries(CASOS.map((c) => [c.id, c]));
