// Eletrocardiograma sintético de 12 derivações para treino de leitura.
// Cada traçado é gerado por um modelo de ondas (P, QRS, ST, T, U) com amplitudes por derivação e um ritmo
// (tempos de P e de QRS). Papel padrão: 25 mm/s e 10 mm/mV.

export const DERIVACOES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

// Amplitudes normais (mV) por derivação: p, q, r, s, t.
const NORMAL = {
  I: [0.1, -0.05, 0.7, -0.1, 0.22], II: [0.15, -0.05, 1.0, -0.15, 0.3], III: [0.06, -0.03, 0.45, -0.2, 0.1],
  aVR: [-0.12, 0, 0.12, -0.8, -0.25], aVL: [0.04, -0.04, 0.4, -0.2, 0.1], aVF: [0.1, -0.04, 0.7, -0.12, 0.2],
  V1: [0.08, 0, 0.18, -0.95, 0.05], V2: [0.08, 0, 0.32, -1.25, 0.4], V3: [0.07, -0.02, 0.65, -0.75, 0.45],
  V4: [0.06, -0.05, 1.15, -0.4, 0.45], V5: [0.06, -0.07, 1.0, -0.2, 0.35], V6: [0.06, -0.06, 0.8, -0.1, 0.3],
};

const g = (t, c, w, a) => a * Math.exp(-((t - c) ** 2) / (2 * w * w));
const passo = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (1 - Math.cos(Math.PI * (t - a) / (b - a))) / 2);
// Pseudoaleatório determinístico: o mesmo ECG sempre sai igual.
function aleatorio(semente) {
  let s = semente >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Catálogo de traçados. Cada um diz o ritmo e as modificações por derivação.
 * `achados`: o que o aluno deveria descrever. `laudo`: resposta-modelo.
 */
export const ECGS = {
  normal: {
    nome: 'Ritmo sinusal normal', fc: 75,
    achados: ['Ritmo sinusal (P positiva em DI, DII e aVF, uma P antes de cada QRS)', 'FC ~75 bpm', 'PR 0,16 s, QRS estreito (< 0,12 s)', 'Eixo normal', 'Sem alterações de ST-T'],
    laudo: 'Ritmo sinusal, FC 75 bpm, PR e QRS normais, eixo normal, sem alterações de repolarização.',
  },
  taqui_sinusal: {
    nome: 'Taquicardia sinusal', fc: 125,
    achados: ['P sinusal antes de cada QRS', 'FC > 100 bpm (~125)', 'QRS estreito, RR regular'],
    laudo: 'Taquicardia sinusal, FC ~125 bpm. Procurar causa: febre, dor, hipovolemia, anemia, TEP, hipertireoidismo.',
  },
  bradi_sinusal: {
    nome: 'Bradicardia sinusal', fc: 44,
    achados: ['P sinusal antes de cada QRS', 'FC < 50 bpm (~44)', 'PR e QRS normais'],
    laudo: 'Bradicardia sinusal, FC ~44 bpm.',
  },
  fa: {
    nome: 'Fibrilação atrial', fc: 110, irregular: 0.35, semP: true, fibrilacao: 0.06,
    achados: ['Ausência de onda P', 'Linha de base com ondas f irregulares', 'RR irregularmente irregular', 'QRS estreito, resposta ventricular ~110 bpm'],
    laudo: 'Fibrilação atrial com resposta ventricular elevada (~110 bpm). Avaliar estabilidade, CHA2DS2-VASc e controle de frequência ou ritmo.',
  },
  flutter: {
    nome: 'Flutter atrial 4:1', fc: 75, semP: true, flutter: 300,
    achados: ['Ondas F em "dente de serra" (melhor em DII, DIII, aVF)', 'Frequência atrial ~300/min', 'Condução 4:1, FC ventricular ~75 bpm', 'QRS estreito'],
    laudo: 'Flutter atrial típico com condução 4:1 (FC ~75 bpm).',
  },
  bav1: {
    nome: 'BAV de 1º grau', fc: 70, pr: 0.30,
    achados: ['Ritmo sinusal', 'PR fixo e prolongado (> 0,20 s; ~0,30 s)', 'Todas as P conduzem'],
    laudo: 'Ritmo sinusal com bloqueio AV de 1º grau (PR ~0,30 s).',
  },
  bav2m1: {
    nome: 'BAV de 2º grau Mobitz I (Wenckebach)', fc: 80, wenckebach: true,
    achados: ['PR aumenta progressivamente', 'Uma P não conduzida (QRS ausente) ao fim do ciclo', 'RR diminui antes da pausa', 'QRS estreito'],
    laudo: 'Bloqueio AV de 2º grau Mobitz I (fenômeno de Wenckebach).',
  },
  bavt: {
    nome: 'BAV total (3º grau)', fc: 36, fcAtrial: 85, dissociacao: true, qrs: 0.13,
    achados: ['Ondas P regulares (~85/min) sem relação com o QRS', 'Escape ventricular lento (~36 bpm), QRS alargado', 'Dissociação AV completa'],
    laudo: 'Bloqueio AV total com escape ventricular (~36 bpm). Indicação de marca-passo; se instável, atropina, marca-passo transcutâneo.',
  },
  bre: {
    nome: 'Bloqueio de ramo esquerdo', fc: 72, qrs: 0.15, ramo: 'esquerdo',
    achados: ['QRS ≥ 0,12 s', 'V1 com QS/rS profundo', 'R alargada e entalhada em DI, aVL, V5 e V6, sem q septal', 'ST-T discordante do QRS'],
    laudo: 'Ritmo sinusal com bloqueio completo de ramo esquerdo. Se novo e com dor torácica, aplicar critérios de Sgarbossa.',
  },
  brd: {
    nome: 'Bloqueio de ramo direito', fc: 72, qrs: 0.14, ramo: 'direito',
    achados: ['QRS ≥ 0,12 s', 'rSR\' ("orelha de coelho") em V1-V2', 'S larga e empastada em DI e V6', 'T invertida em V1-V2'],
    laudo: 'Ritmo sinusal com bloqueio completo de ramo direito.',
  },
  iam_inferior: {
    nome: 'IAM com supra de ST inferior', fc: 68,
    st: { II: 0.25, III: 0.3, aVF: 0.28, I: -0.1, aVL: -0.18, V2: -0.05 },
    achados: ['Supradesnivelamento do ST em DII, DIII e aVF', 'Infradesnivelamento recíproco em DI e aVL', 'Supra em DIII > DII (sugere coronária direita)'],
    laudo: 'IAM com supra de ST de parede inferior. Fazer V3R/V4R (VD) e V7-V9; reperfusão imediata (angioplastia ou fibrinólise).',
  },
  iam_anterior: {
    nome: 'IAM com supra de ST anterior', fc: 92,
    st: { V1: 0.2, V2: 0.35, V3: 0.4, V4: 0.3, I: 0.08, aVL: 0.1, II: -0.08, III: -0.15, aVF: -0.12 },
    q: { V1: -0.25, V2: -0.3, V3: -0.15 },
    achados: ['Supradesnivelamento do ST de V1 a V4', 'Ondas Q em V1-V3', 'Infra recíproco em parede inferior'],
    laudo: 'IAM com supra de ST anterior extenso (artéria descendente anterior). Reperfusão imediata.',
  },
  pericardite: {
    nome: 'Pericardite aguda', fc: 98, pericardite: true,
    achados: ['Supra de ST difuso, côncavo (em várias paredes)', 'Infra do segmento PR (supra de PR em aVR)', 'Sem imagem em espelho, exceto aVR'],
    laudo: 'Alterações compatíveis com pericardite aguda: supra de ST difuso com infra de PR.',
  },
  hipercalemia: {
    nome: 'Hipercalemia', fc: 70, tFator: 2.6, tEstreita: true, pFator: 0.4, qrs: 0.11,
    achados: ['Ondas T apiculadas, altas e de base estreita', 'Onda P achatada', 'QRS tendendo a alargar'],
    laudo: 'Alterações sugestivas de hipercalemia (T apiculada, P achatada). Gluconato de cálcio, insulina com glicose, beta-2, tratar causa.',
  },
  hipocalemia: {
    nome: 'Hipocalemia', fc: 78, tFator: 0.35, u: 0.18, stDifuso: -0.05,
    achados: ['Ondas T achatadas', 'Ondas U proeminentes (melhor em V2-V3)', 'Discreto infra de ST'],
    laudo: 'Alterações sugestivas de hipocalemia (T achatada, onda U proeminente).',
  },
  tv: {
    nome: 'Taquicardia ventricular monomórfica', fc: 175, semP: true, qrs: 0.16, ventricular: true,
    achados: ['Taquicardia regular de QRS largo (~175 bpm)', 'Sem ondas P visíveis', 'Morfologia uniforme (monomórfica)'],
    laudo: 'Taquicardia ventricular monomórfica sustentada. Sem pulso: RCP e desfibrilação; instável com pulso: cardioversão sincronizada; estável: amiodarona.',
  },
  wpw: {
    nome: 'Pré-excitação (Wolff-Parkinson-White)', fc: 76, pr: 0.10, delta: true, qrs: 0.12,
    achados: ['PR curto (< 0,12 s)', 'Onda delta (empastamento inicial do QRS)', 'QRS alargado'],
    laudo: 'Padrão de pré-excitação ventricular (Wolff-Parkinson-White).',
  },
  qt_longo: {
    nome: 'QT longo', fc: 62, qt: 0.56,
    achados: ['Intervalo QT prolongado (QTc > 470-480 ms)', 'Ritmo sinusal, QRS estreito'],
    laudo: 'Ritmo sinusal com QT longo. Revisar fármacos, eletrólitos (K, Mg, Ca); risco de torsades de pointes.',
  },
};

export const CHAVES_ECG = Object.keys(ECGS);

/** Tempos de P e QRS em 10 s. */
function ritmo(e, aleat, duracao) {
  const fc = e.fc;
  const pr = e.pr ?? 0.16;
  const batidas = []; // { t (início do QRS), p (tempo da P ou null), pr }
  const ps = [];
  if (e.dissociacao) {
    const ppA = 60 / (e.fcAtrial || 80);
    for (let t = 0.12; t < duracao; t += ppA) ps.push(t);
    const rr = 60 / fc;
    for (let t = 0.6; t < duracao; t += rr) batidas.push({ t });
    return { batidas, ps };
  }
  if (e.wenckebach) {
    const pp = 60 / fc;
    let ciclo = 0;
    for (let tp = 0.1; tp < duracao; tp += pp) {
      ps.push(tp);
      const prAtual = [0.18, 0.26, 0.32][ciclo];
      if (ciclo < 3) batidas.push({ t: tp + prAtual });
      ciclo = (ciclo + 1) % 4;
    }
    return { batidas, ps };
  }
  const rrBase = 60 / fc;
  let t = 0.25;
  while (t < duracao + 0.5) {
    batidas.push({ t });
    if (!e.semP) ps.push(t - pr);
    t += e.irregular ? rrBase * (1 - e.irregular + 2 * e.irregular * aleat()) : rrBase;
  }
  return { batidas, ps };
}

/** Uma derivação ao longo do tempo (mV). */
function gerarDerivacao(e, d, rit, aleat) {
  const [pA, qA0, rA0, sA0, tA0] = NORMAL[d];
  const larg = (e.qrs ?? 0.09) / 0.09;
  let qA = e.q?.[d] ?? qA0;
  let rA = rA0;
  let sA = sA0;
  let tA = tA0 * (e.tFator ?? 1);
  const st = (e.st?.[d] ?? 0) + (e.stDifuso ?? 0);
  // Morfologias de bloqueio de ramo e de ritmo ventricular.
  let extra = null;
  if (e.ramo === 'esquerdo') {
    if (['V1', 'V2', 'V3'].includes(d)) { rA = 0.08; sA = -1.6; qA = 0; tA = 0.35; }
    if (['I', 'aVL', 'V5', 'V6'].includes(d)) { qA = 0; rA = 1.1; sA = 0; tA = -0.3; extra = (x) => g(x, 0.1, 0.022, 0.6); }
  } else if (e.ramo === 'direito') {
    if (['V1', 'V2'].includes(d)) { rA = 0.25; sA = -0.35; tA = -0.2; extra = (x) => g(x, 0.11, 0.018, 0.75); }
    if (['I', 'V5', 'V6', 'aVL'].includes(d)) { sA = -0.35; extra = (x) => g(x, 0.1, 0.025, -0.25); }
  } else if (e.ventricular) {
    const sinal = ['V1', 'V2', 'aVR', 'III'].includes(d) ? -1 : 1;
    qA = 0; rA = 1.2 * sinal; sA = -0.25 * sinal; tA = -0.45 * sinal;
  }
  if (e.pericardite && d !== 'aVR' && d !== 'V1') extra = null;
  const stPeri = e.pericardite ? (d === 'aVR' ? -0.15 : d === 'V1' ? 0 : 0.17) : 0;
  const prPeri = e.pericardite ? (d === 'aVR' ? 0.07 : -0.06) : 0;
  const qt = e.qt ?? Math.min(0.44, 0.39 * Math.sqrt(60 / e.fc) + 0.02);
  const tW = e.tEstreita ? 0.028 : 0.055;
  const fP = e.pFator ?? 1;

  const qrs = (x) => {
    const w = larg;
    let v = g(x, 0.015 * w, 0.009 * w, qA) + g(x, 0.04 * w, 0.011 * w, rA) + g(x, 0.07 * w, 0.011 * w, sA);
    if (e.delta) v += passo(x, -0.06, 0.03) * (1 - passo(x, 0.03, 0.05)) * Math.sign(rA) * 0.35 - (x > -0.06 && x < 0.05 ? 0 : 0);
    if (extra) v += extra(x);
    const j = 0.09 * w;
    const fimT = qt;
    const stV = st + stPeri;
    if (stV) v += stV * passo(x, j - 0.01, j + 0.02) * (1 - passo(x, fimT - 0.08, fimT));
    v += g(x, qt - 0.11, tW, tA + (stV > 0 && !e.pericardite ? stV * 0.6 : 0));
    if (e.u) v += g(x, qt + 0.08, 0.03, e.u * (['V2', 'V3', 'V4'].includes(d) ? 1 : 0.5));
    return v;
  };
  const onP = (x) => g(x, 0.045, 0.022, pA * fP) + (prPeri ? prPeri * passo(x, 0.06, 0.08) * (1 - passo(x, 0.14, 0.16)) : 0);

  return (t) => {
    let v = 0;
    for (const b of rit.batidas) { const x = t - b.t; if (x > -0.2 && x < 0.8) v += qrs(x); }
    for (const p of rit.ps) { const x = t - p; if (x > -0.05 && x < 0.2) v += onP(x); }
    if (e.fibrilacao) v += e.fibrilacao * (Math.sin(t * 37 + d.length) * 0.6 + Math.sin(t * 53.7 + d.charCodeAt(0)) * 0.4) * (d === 'V1' || d === 'II' ? 1.4 : 0.8);
    if (e.flutter) {
      const fase = (t * e.flutter / 60) % 1;
      const amp = ['II', 'III', 'aVF'].includes(d) ? -0.22 : d === 'V1' ? 0.12 : -0.06;
      v += amp * (fase < 0.75 ? fase / 0.75 : 1 - (fase - 0.75) / 0.25) - amp / 2;
    }
    return v + (aleat() - 0.5) * 0.012;
  };
}

const MM = 4; // px por mm no desenho
const SEG = 25 * MM; // px por segundo (25 mm/s)
const MV = 10 * MM; // px por mV (10 mm/mV)

function caminho(fn, t0, dur, x0, y0) {
  const pontos = [];
  const passoT = 1 / 250;
  for (let t = t0; t <= t0 + dur + 1e-9; t += passoT) {
    pontos.push(`${(x0 + (t - t0) * SEG).toFixed(1)},${(y0 - fn(t) * MV).toFixed(1)}`);
  }
  return `M${pontos.join('L')}`;
}

/** SVG do ECG de 12 derivações (3 x 4) com DII longo. */
export function svgEcg(chave, { fc, semente = 7 } = {}) {
  const base = ECGS[chave] || ECGS.normal;
  const e = fc && !base.dissociacao && !base.wenckebach ? { ...base, fc } : base;
  const aleat = aleatorio(semente);
  const rit = ritmo(e, aleat, 10.5);
  const fns = Object.fromEntries(DERIVACOES.map((d) => [d, gerarDerivacao(e, d, rit, aleatorio(semente + d.length * 31 + d.charCodeAt(d.length - 1)))]));
  const largura = 10 * SEG + 20;
  const alturaLinha = 30 * MM;
  const altura = alturaLinha * 4 + 10;
  const colunas = [['I', 'II', 'III'], ['aVR', 'aVL', 'aVF'], ['V1', 'V2', 'V3'], ['V4', 'V5', 'V6']];
  const tracos = [];
  const rotulos = [];
  colunas.forEach((col, c) => col.forEach((d, l) => {
    const x0 = 10 + c * 2.5 * SEG;
    const y0 = 5 + l * alturaLinha + alturaLinha * 0.55;
    tracos.push(caminho(fns[d], c * 2.5, 2.5, x0, y0));
    rotulos.push(`<text x="${x0 + 16}" y="${y0 - alturaLinha * 0.32}">${d}</text>`);
    if (c > 0) tracos.push(`M${x0},${y0 - 18}V${y0 + 18}`);
  }));
  const yLongo = 5 + 3 * alturaLinha + alturaLinha * 0.55;
  tracos.push(caminho(fns.II, 0, 10, 10, yLongo));
  rotulos.push(`<text x="26" y="${yLongo - alturaLinha * 0.32}">II</text>`);
  // Pulso de calibração 1 mV.
  const cal = (y) => `M2,${y}h2v-${MV}h${0.2 * SEG}v${MV}h2`;
  return `<svg class="ecg-papel" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Eletrocardiograma de 12 derivações" xmlns="http://www.w3.org/2000/svg">
<defs><pattern id="ecg-mm" width="${MM}" height="${MM}" patternUnits="userSpaceOnUse"><path d="M${MM},0V${MM}H0" fill="none" stroke="#f3c4c4" stroke-width=".5"/></pattern>
<pattern id="ecg-5mm" width="${5 * MM}" height="${5 * MM}" patternUnits="userSpaceOnUse"><rect width="${5 * MM}" height="${5 * MM}" fill="url(#ecg-mm)"/><path d="M${5 * MM},0V${5 * MM}H0" fill="none" stroke="#e79a9a" stroke-width="1"/></pattern></defs>
<rect width="100%" height="100%" fill="#fff7f5"/><rect width="100%" height="100%" fill="url(#ecg-5mm)"/>
<path d="${cal(5 + alturaLinha * 0.55)}${cal(5 + alturaLinha * 1.55)}${cal(5 + alturaLinha * 2.55)}${cal(yLongo)}" fill="none" stroke="#1a1a1a" stroke-width="1.2"/>
<path d="${tracos.join('')}" fill="none" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/>
<g font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#111">${rotulos.join('')}</g>
<text x="${largura - 10}" y="${altura - 8}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#7a4b4b">25 mm/s · 10 mm/mV · traçado didático gerado pelo RX ENAMED</text>
</svg>`;
}
