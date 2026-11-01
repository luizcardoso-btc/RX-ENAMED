// Gera o site público do curso RX ENAMED em site/dist/, em português (raiz) e espanhol (/es/):
//   index.html               página do curso (o que é, diferenciais, mentores, planos, perguntas)
//   planos.html              planos e preços
//   plataforma/              área do aluno (o app de estudo, copiado de app/dist)
//   sitemap.xml, robots.txt  só com SITE_URL definido (endereço final do site)
// Uso: node app/build.mjs && node site/gerar.mjs        (SITE_URL=https://seu-dominio node site/gerar.mjs)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const raiz = new URL('..', import.meta.url).pathname;
const saida = `${raiz}site/dist`;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
// Com o servidor próprio (servidor/), os botões dos planos levam ao checkout do RX: CHECKOUT_PROPRIO=1 node site/gerar.mjs
const CHECKOUT_PROPRIO = process.env.CHECKOUT_PROPRIO === '1';

if (!existsSync(`${raiz}app/dist/index.html`)) throw new Error('Rode antes: node app/build.mjs');
const banco = JSON.parse(readFileSync(`${raiz}app/public/data/questoes.json`, 'utf8'));
const conteudo = JSON.parse(readFileSync(`${raiz}app/dist/data/conteudo.json`, 'utf8'));
const { default: ES } = await import(`${raiz}app/src/es.js`);
const { textosPreco } = await import(`${raiz}app/src/planos.js`);
const { lancamento, planos } = conteudo.planos;

const AREAS = [
  ['Clínica Médica', 1], ['Cirurgia', 2], ['Pediatria', 3], ['Ginecologia e Obstetrícia', 4],
  ['Medicina de Família e Comunidade / Saúde Coletiva', 5],
];
const COR = Object.fromEntries(AREAS);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n, lingua) => n.toLocaleString(lingua === 'es' ? 'es' : 'pt-BR');

// ------------------------------------------------------------------ textos das páginas

const TX = {
  pt: {
    locale: 'pt-BR',
    menu: { inicio: 'O curso', planos: 'Planos', plataforma: 'Área do aluno' },
    entrar: 'Começar grátis',
    titulo: 'Curso preparatório ENAMED e Revalida online | RX ENAMED',
    descricao: 'Curso preparatório online para o ENAMED e o Revalida: questões oficiais do Inep comentadas, aulas, simulados e 2ª etapa com paciente simulado por IA. Comece grátis.',
    heroiSobre: 'Curso preparatório para o ENAMED',
    heroiTitulo: 'Estude o que o Inep cobra, do jeito que o Inep cobra.',
    heroiTexto: 'Cada questão oficial lida e classificada por especialidade, tema e tipo de cobrança. Uma trilha que explica por que escolheu cada questão para você, aulas que terminam nas questões em que o tema caiu e a 2ª etapa treinada com paciente simulado por IA.',
    heroiPainel: 'Raio-X do caderno {ed}: as cinco áreas se alternam a cada questão',
    numeros: [['questões oficiais classificadas'], ['edições processadas'], ['aulas publicadas'], ['flashcards'], ['estações da 2ª etapa']],
    difTitulo: 'O que o RX faz diferente',
    difIntro: 'Os grandes cursos vendem o mesmo pacote. O RX nasceu para o revalidando e usa IA de um jeito que você vê e entende.',
    dif: [
      ['Raio-X da prova', 'O que mais cai, edição por edição, com peso de cada especialidade, incidência dos temas e dificuldade. Você sabe por onde começar.'],
      ['Trilha que se explica', 'Cinco módulos até a prova e um plano por dia. Cada questão vem com o motivo: peso na prova, seu erro ou a falta de dados.'],
      ['Aulas ligadas às questões', 'Cada aula termina nas questões oficiais em que o tema caiu, com as pegadinhas da banca.'],
      ['2ª etapa com paciente por IA', 'Estações de 10 minutos: você conversa com o paciente, pede exames e recebe a correção pelo checklist do Inep.'],
      ['Português e espanhol', 'Interface, aulas e flashcards também em espanhol, para quem se formou na Bolívia, no Paraguai ou na Argentina. As questões ficam em português, como na prova.'],
      ['Sem promessa vazia', 'Taxa de aprovação só divulgada quando puder ser conferida na lista oficial do Inep.'],
    ],
    mentoresTitulo: 'Seus mentores',
    mentoresIntro: 'Um mentor por grande área acompanha suas respostas, comenta erros e corrige as estações da 2ª etapa.',
    planosTitulo: 'Planos',
    planosIntro: 'Comece grátis. Quando quiser o curso completo, escolha o plano que acompanha a sua prova.',
    planosTituloPagina: 'Planos e preços do RX ENAMED',
    planosDescricao: 'Planos do curso RX ENAMED: gratuito, mensal, ciclo de prova de 6 meses, anual completo e a 2ª etapa do Revalida para quem se formou no exterior.',
    recomendado: 'Recomendado', assinar: 'Assinar', emBreve: 'Pagamento abre em breve', planoGratis: 'Começar grátis', verPlanos: 'Ver todos os planos',
    planosRodape: 'Preços em reais. Pagamento por PIX, cartão em até 12× ou boleto, processado pelo Mercado Pago. Cada pagamento libera o período do plano, sem cobrança automática: antes de vencer, você renova se quiser.',
    faqTitulo: 'Perguntas frequentes',
    faq: [
      ['O que é o ENAMED?', 'O Exame Nacional de Avaliação da Formação Médica, aplicado pelo Inep aos concluintes de Medicina no Brasil desde 2025. A nota também é usada no acesso à residência pelo Enare.'],
      ['Por que treinar com questões do Revalida?', 'São provas do mesmo órgão, o Inep, com o mesmo estilo de caso clínico e os mesmos protocolos do SUS. Enquanto as provas do ENAMED entram no banco, elas são o treino mais próximo da prova real. Cada questão mostra de que prova veio.'],
      ['Sou formado no exterior. O RX serve para mim?', 'Sim. O Revalida é o exame do Inep que revalida no Brasil o diploma obtido no exterior. A prova objetiva usa o mesmo estilo de questões, e o plano da 2ª etapa treina as estações de habilidades clínicas.'],
      ['A prova é em português?', 'Sim. Por isso as questões aparecem sempre em português, mesmo com a interface em espanhol: você treina lendo como vai ler no dia.'],
      ['De onde vêm as questões?', 'Dos cadernos e gabaritos definitivos publicados pelo Inep. Questões anuladas ficam marcadas e não contam no desempenho.'],
      ['Preciso instalar alguma coisa?', 'Não. O curso funciona no navegador do computador ou do celular.'],
      ['Quanto custa o curso preparatório para o ENAMED e o Revalida?', 'Há um plano gratuito, com 25 questões por dia e 1 simulado por mês. Os planos pagos vão do mensal ao anual completo, que inclui a 2ª etapa do Revalida; os valores estão na página de planos.'],
      ['O curso prepara para as duas etapas do Revalida?', 'Sim. A 1ª etapa (prova objetiva e discursiva) é treinada com as questões oficiais e os padrões de resposta do Inep. A 2ª etapa (habilidades clínicas) é treinada com estações, paciente simulado por IA e treino em dupla.'],
    ],
    rodape: 'RX ENAMED é um curso independente, sem vínculo com o Inep ou o Ministério da Educação. Questões e gabaritos oficiais do Inep. Aulas e estações em revisão médica.',
    inicio: 'Início',
  },
  es: {
    locale: 'es',
    menu: { inicio: 'El curso', planos: 'Planes', plataforma: 'Área del alumno' },
    entrar: 'Empezar gratis',
    titulo: 'Curso preparatorio ENAMED y Revalida en línea | RX ENAMED',
    descricao: 'Curso preparatorio en línea para el ENAMED y el Revalida de Brasil: preguntas oficiales del Inep comentadas, clases, simulacros y 2.ª etapa con paciente simulado por IA. Empiece gratis.',
    heroiSobre: 'Curso preparatorio para el ENAMED',
    heroiTitulo: 'Estudie lo que evalúa el Inep, como lo evalúa el Inep.',
    heroiTexto: 'Cada pregunta oficial leída y clasificada por especialidad, tema y tipo de evaluación. Una ruta que explica por qué eligió cada pregunta para usted, clases que terminan en las preguntas donde apareció el tema y la 2.ª etapa practicada con paciente simulado por IA.',
    heroiPainel: 'Rayos X del cuadernillo {ed}: las cinco áreas se alternan en cada pregunta',
    numeros: [['preguntas oficiales clasificadas'], ['ediciones procesadas'], ['clases publicadas'], ['flashcards'], ['estaciones de la 2.ª etapa']],
    difTitulo: 'Qué hace diferente el RX',
    difIntro: 'Los grandes cursos venden el mismo paquete. El RX nació para quien revalida su título y usa la IA de una forma que usted ve y entiende.',
    dif: [
      ['Rayos X del examen', 'Lo que más aparece, edición por edición, con el peso de cada especialidad, la incidencia de los temas y la dificultad. Sabe por dónde empezar.'],
      ['Una ruta que se explica', 'Cinco módulos hasta el examen y un plan por día. Cada pregunta viene con el motivo: peso en el examen, su error o la falta de datos.'],
      ['Clases unidas a las preguntas', 'Cada clase termina en las preguntas oficiales donde apareció el tema, con las trampas del examen.'],
      ['2.ª etapa con paciente por IA', 'Estaciones de 10 minutos: conversa con el paciente, pide exámenes y recibe la corrección con la lista de evaluación del Inep.'],
      ['Español y portugués', 'Interfaz, clases y flashcards en español, para quien se formó en Bolivia, Paraguay o Argentina. Las preguntas quedan en portugués, como en el examen.'],
      ['Sin promesas vacías', 'La tasa de aprobación solo se publica cuando pueda verificarse en la lista oficial del Inep.'],
    ],
    mentoresTitulo: 'Sus mentores',
    mentoresIntro: 'Un mentor por gran área acompaña sus respuestas, comenta los errores y corrige las estaciones de la 2.ª etapa.',
    planosTitulo: 'Planes',
    planosIntro: 'Empiece gratis. Cuando quiera el curso completo, elija el plan que acompaña su examen.',
    planosTituloPagina: 'Planes y precios del RX ENAMED',
    planosDescricao: 'Planes del curso RX ENAMED: gratuito, mensual, ciclo de examen de 6 meses, anual completo y la 2.ª etapa del Revalida para quien se formó en el exterior.',
    recomendado: 'Recomendado', assinar: 'Suscribirse', emBreve: 'El pago abre pronto', planoGratis: 'Empezar gratis', verPlanos: 'Ver todos los planes',
    planosRodape: 'Precios en reales brasileños. Pago con PIX, tarjeta en hasta 12 cuotas o boleto, procesado por Mercado Pago. Cada pago libera el periodo del plan, sin cobro automático: antes de vencer, renueva si quiere.',
    faqTitulo: 'Preguntas frecuentes',
    faq: [
      ['¿Qué es el ENAMED?', 'El Examen Nacional de Evaluación de la Formación Médica, aplicado por el Inep a los estudiantes de último año de Medicina en Brasil desde 2025. La nota también se usa para el acceso a la residencia por el Enare.'],
      ['¿Por qué practicar con preguntas del Revalida?', 'Son exámenes del mismo organismo, el Inep, con el mismo estilo de caso clínico y los mismos protocolos del SUS. Mientras los exámenes del ENAMED entran al banco, son la práctica más cercana al examen real. Cada pregunta muestra de qué examen viene.'],
      ['Me formé en el exterior. ¿El RX me sirve?', 'Sí. El Revalida es el examen del Inep que revalida en Brasil el título obtenido en el exterior. El examen objetivo usa el mismo estilo de preguntas, y el plan de la 2.ª etapa practica las estaciones de habilidades clínicas.'],
      ['¿El examen es en portugués?', 'Sí. Por eso las preguntas aparecen siempre en portugués, aunque la interfaz esté en español: practica leyendo como leerá el día del examen.'],
      ['¿De dónde vienen las preguntas?', 'De los cuadernillos y claves definitivas publicados por el Inep. Las preguntas anuladas quedan marcadas y no cuentan en el rendimiento.'],
      ['¿Necesito instalar algo?', 'No. El curso funciona en el navegador de la computadora o del celular.'],
      ['¿Cuánto cuesta el curso preparatorio para el ENAMED y el Revalida?', 'Hay un plan gratuito, con 25 preguntas por día y 1 simulacro por mes. Los planes pagos van del mensual al anual completo, que incluye la 2.ª etapa del Revalida; los valores están en la página de planes.'],
      ['¿El curso prepara para las dos etapas del Revalida?', 'Sí. La 1.ª etapa (examen objetivo y discursivo) se practica con las preguntas oficiales y los estándares de respuesta del Inep. La 2.ª etapa (habilidades clínicas) se practica con estaciones, paciente simulado por IA y práctica en pareja.'],
    ],
    rodape: 'RX ENAMED es un curso independiente, sin vínculo con el Inep ni con el Ministerio de Educación de Brasil. Preguntas y claves oficiales del Inep. Clases y estaciones en revisión médica.',
    inicio: 'Inicio',
  },
};
const preencher = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
const tDado = (texto, lingua) => (lingua === 'es' ? ES[texto] ?? texto : texto);

// ------------------------------------------------------------------ dados derivados

const edicoesProcessadas = banco.edicoes.filter((e) => e.questoes > 0);
const questoesPorEdicao = Object.fromEntries(edicoesProcessadas.map((e) => [e.id,
  banco.questoes.filter((q) => q.id.startsWith(`${e.id}_`)).sort((a, b) => a.numero - b.numero)]));
const ultima = edicoesProcessadas[edicoesProcessadas.length - 1];

// ------------------------------------------------------------------ moldura

function pagina({ lingua, caminho, titulo, descricao, atual, corpo, profundidade }) {
  const tx = TX[lingua];
  const sobe = '../'.repeat(profundidade);
  const outra = lingua === 'pt' ? 'es' : 'pt';
  const raizLingua = (l) => (l === 'pt' ? sobe + (lingua === 'es' ? '../' : '') : sobe + (lingua === 'pt' ? 'es/' : ''));
  const daRaiz = (l, c) => `${raizLingua(l)}${c}`;
  const absoluto = (l) => (SITE_URL ? `${SITE_URL}/${l === 'es' ? 'es/' : ''}${caminho}` : null);
  const plataforma = `${raizLingua('pt')}plataforma/index.html${lingua === 'es' ? '?lang=es' : ''}`;
  const alternativos = SITE_URL
    ? `<link rel="canonical" href="${absoluto(lingua)}">
<link rel="alternate" hreflang="pt-BR" href="${absoluto('pt')}">
<link rel="alternate" hreflang="es" href="${absoluto('es')}">
<link rel="alternate" hreflang="x-default" href="${absoluto('pt')}">` : '';
  return `<!doctype html>
<html lang="${tx.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${lingua === 'es' ? 'es_419' : 'pt_BR'}">
<meta property="og:site_name" content="RX ENAMED">
${SITE_URL ? `<meta property="og:url" content="${absoluto(lingua)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
<meta name="robots" content="index, follow, max-snippet:-1">
<meta name="theme-color" content="#2563eb">
${alternativos}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<link rel="stylesheet" href="${raizLingua('pt')}site.css">
</head>
<body>
<header class="topo"><div class="envoltorio">
  <a class="marca" href="${daRaiz(lingua, 'index.html')}"><span class="marca-simbolo" aria-hidden="true">RX</span><span>RX <em>ENAMED</em></span></a>
  <nav class="menu" aria-label="${lingua === 'es' ? 'Secciones' : 'Seções'}">
    <a href="${daRaiz(lingua, 'index.html')}"${atual === 'inicio' ? ' aria-current="page"' : ''}>${tx.menu.inicio}</a>
    <a href="${daRaiz(lingua, 'planos.html')}"${atual === 'planos' ? ' aria-current="page"' : ''}>${tx.menu.planos}</a>
    <a href="${plataforma}">${tx.menu.plataforma}</a>
  </nav>
  <nav class="idioma" aria-label="Idioma">
    <a href="${daRaiz('pt', caminho)}" hreflang="pt-BR" lang="pt-BR"${lingua === 'pt' ? ' aria-current="true"' : ''}>PT</a>
    <a href="${daRaiz('es', caminho)}" hreflang="es" lang="es"${lingua === 'es' ? ' aria-current="true"' : ''}>ES</a>
  </nav>
</div></header>
<main>
${corpo({ sobe, raizLingua, daRaiz, plataforma, outra })}
</main>
<footer class="rodape"><div class="envoltorio"><p>${tx.rodape}</p><p>© ${new Date().getFullYear()} RX ENAMED${CHECKOUT_PROPRIO ? ` · <a href="/termos">${lingua === 'es' ? 'Términos de uso' : 'Termos de Uso'}</a> · <a href="/privacidade">${lingua === 'es' ? 'Política de privacidad' : 'Política de Privacidade'}</a> · <a href="/entrar">${lingua === 'es' ? 'Entrar' : 'Entrar'}</a>` : ''}</p></div></footer>
</body>
</html>
`;
}

// ------------------------------------------------------------------ páginas

function gradePlanos(lingua, plataforma) {
  const tx = TX[lingua];
  const selo = lancamento?.ativo ? `<p class="aviso-lancamento"><strong>${esc(lancamento[lingua].selo)}</strong> ${esc(lancamento[lingua].texto)}</p>` : '';
  return `${selo}<div class="grade grade-planos">${planos.map((p) => {
    const t = p[lingua];
    const preco = textosPreco(p, lancamento, lingua);
    const botao = p.preco === 0
      ? `<a class="botao" href="${plataforma}">${tx.planoGratis}</a>`
      : CHECKOUT_PROPRIO
        ? `<a class="botao${p.destaque ? ' botao-primario' : ''}" href="/checkout?plano=${p.id}${lingua === 'es' ? '&amp;lang=es' : ''}">${tx.assinar}</a>`
      : p.checkout
        ? `<a class="botao${p.destaque ? ' botao-primario' : ''}" href="${esc(p.checkout)}" rel="noopener">${tx.assinar}</a>`
        : `<span class="botao botao-inativo" aria-disabled="true">${tx.emBreve}</span>`;
    return `<article class="cartao plano${p.destaque ? ' destaque' : ''}" id="plano-${p.id}">
    ${p.destaque ? `<span class="plano-selo">${tx.recomendado}</span>` : ''}
    <h3>${esc(t.nome)}</h3><p class="mudo pequeno">${esc(t.para)}</p>
    <p class="preco">${preco.de ? `<s>${preco.de}</s> ` : ''}<span>${preco.preco}</span></p>
    <p class="mudo pequeno">${esc(preco.periodo)}${preco.parcela ? ` · ${esc(preco.parcela)}` : ''}</p>
    <ul>${t.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <p class="plano-acao">${botao}</p></article>`;
  }).join('')}</div>`;
}

function paginaPlanos(lingua) {
  const tx = TX[lingua];
  const oferta = planos.filter((p) => p.preco > 0).map((p) => ({
    '@type': 'Offer', name: p[lingua].nome, priceCurrency: 'BRL',
    price: ((lancamento?.ativo ? p.precoFundador : p.preco) / 100).toFixed(2),
  }));
  return pagina({
    lingua, caminho: 'planos.html', titulo: `${tx.planosTituloPagina} | RX ENAMED`, descricao: tx.planosDescricao, atual: 'planos', profundidade: 0,
    corpo: ({ daRaiz, plataforma }) => `
<div class="envoltorio">
  <p class="migalhas"><a href="${daRaiz(lingua, 'index.html')}">${tx.inicio}</a> › ${tx.menu.planos}</p>
  <h1 style="font-size:clamp(1.7rem,4vw,2.5rem);margin-bottom:12px">${tx.planosTituloPagina}</h1>
  <p class="secao-intro">${tx.planosIntro}</p>
  ${gradePlanos(lingua, plataforma)}
  <p class="mudo pequeno" style="margin-top:20px">${tx.planosRodape}</p>
</div>
<div style="height:48px"></div>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Course', name: tx.titulo, provider: { '@type': 'Organization', name: 'RX ENAMED' }, offers: oferta })}</script>`,
  });
}

// Textos da página de venda (LP). Números vêm dos dados; nada de depoimento ou aprovação que não dê para conferir.
const LP = {
  pt: {
    faixaLink: 'Ver planos',
    sobre: 'Curso preparatório para ENAMED e Revalida',
    titulo: ['Do ENAMED ao Revalida:', 'sua preparação até a aprovação.'],
    texto: 'Cursos preparatórios online para o ENAMED e para as duas etapas do Revalida. Questões oficiais do Inep comentadas alternativa por alternativa, aulas por módulo, simulados com tempo de prova e a 2ª etapa treinada com paciente simulado por IA. Estude no seu ritmo, no celular ou no computador.',
    ctaGratis: 'Começar grátis',
    ctaPlanos: 'Planos a partir de {p}',
    selos: ['Sem cartão para começar', 'Funciona no celular', 'Sem fidelidade'],
    demoRotulo: 'Questão oficial do Inep · Revalida {ed}',
    demoMarcada: 'Você marcou {l}',
    demoComentario: 'Comentário RX · padrão Inep',
    numeros: ['questões oficiais do Inep para treinar', 'questões comentadas, alternativa por alternativa', 'módulos que liberam com 90%', 'estações da 2ª etapa', 'idiomas na interface'],
    metodoSobre: 'O método',
    metodoTitulo: 'Cinco passos até a prova',
    metodo: [
      ['Raio-X da prova', 'Veja o que o Inep mais cobra, área por área, e onde você está hoje.'],
      ['Curso por módulos', 'Clínica, Cirurgia, Pediatria, GO e Saúde Coletiva. O próximo módulo abre quando você chega a 90%.'],
      ['Questões comentadas', 'Depois de cada resposta, o porquê da certa e o erro de cada alternativa, pelo gabarito oficial.'],
      ['Simulado do módulo', 'Fecha o módulo com as questões que você já fez e outras novas do mesmo tema, com cronômetro.'],
      ['Formado no exterior: 2ª etapa', 'Para o Revalida: estações de 10 minutos com paciente por IA, checklist do Inep e treino em dupla por vídeo.'],
    ],
    recursosSobre: 'Por dentro da plataforma',
    recursos: [
      ['Módulos que exigem domínio', 'Cada módulo junta aulas em texto, flashcards e questões. O anel mostra o quanto falta, e o próximo módulo fica trancado até 90%. Ninguém pula etapa.'],
      ['Paciente simulado por IA, a qualquer hora', 'Você conversa com o paciente, pede exames e recebe a nota pelo checklist do Inep. Treine a estação às 2 da manhã, sem marcar horário com professor.'],
      ['Treino em dupla, com vídeo', 'Crie uma sala, mande o código para um colega e treinem juntos: um faz o candidato, o outro faz o paciente e o examinador, com roteiro, achados e cronômetro.'],
      ['Raio-X: o que cai de verdade', 'Cada questão oficial classificada por área, especialidade e tema. Você sabe por onde começar e o que deixar para depois.'],
    ],
    modulos: ['Clínica Médica', 'Cirurgia', 'Pediatria', 'GO', 'Saúde Coletiva'],
    modLiberado: 'liberado', modTrancado: 'abre com 90%',
    chat: [['p', 'Doutor, faz três horas que meu filho está com uma dor muito forte no saco, do lado esquerdo.'], ['c', 'Ele bateu ou caiu? Teve febre ou dor para urinar?'], ['p', 'Não bateu em nada. Sem febre. Começou de repente, na escola.'], ['c', 'Vou examinar. Peço o reflexo cremastérico e a posição do testículo.']],
    chatPaciente: 'Paciente (IA)', chatVoce: 'Você', chatNota: 'Nota da estação', chatTempo: '07:42 restantes',
    duplaCand: 'Candidato', duplaAtor: 'Paciente e examinador', duplaCheck: ['Apresentou-se e checou identificação', 'Perguntou sobre trauma e febre', 'Indicou cirurgia de urgência'],
    raioxRotulo: 'Especialidades que mais caem (todas as edições)',
    compSobre: 'Comparação',
    compTitulo: 'O que muda em relação aos cursos tradicionais',
    compCols: ['', 'Cursos tradicionais', 'RX ENAMED'],
    comp: [
      ['Preço', 'R$ 2.000 a R$ 9.000 por ano', 'a partir de {p} por mês'],
      ['Treino da 2ª etapa', 'com professor, em horário marcado', 'paciente por IA 24 h e treino em dupla'],
      ['Feito para', 'residência, adaptado ao ENAMED', 'ENAMED, com a 2ª etapa do Revalida para formados no exterior'],
      ['Espanhol', 'raro', 'interface, aulas e flashcards'],
      ['Aprovação divulgada', 'número da própria empresa', 'só quando puder ser conferida no Inep'],
    ],
    compNota: 'Faixa de preço dos planos anuais dos maiores cursos, levantada em outubro de 2026.',
    garantia: 'Compra pela internet tem 7 dias de arrependimento pelo Código de Defesa do Consumidor: se não gostar, devolvemos o valor.',
    faqPagamento: [['Como funciona a renovação?', 'Cada pagamento libera o período do plano: 30 dias, 6 meses ou 12 meses. Não há cobrança automática. Se renovar antes de vencer, os dias novos se somam aos que faltam.'], ['O que é a turma fundadora?', 'Os primeiros alunos pagam o preço de fundador e mantêm esse valor enquanto a assinatura estiver ativa.']],
    finalTitulo: 'Comece hoje pelo Raio-X da sua prova.',
    finalTexto: 'Grátis, sem cartão. Em 30 minutos você sabe em que área está mais forte e por onde começar.',
    barra: 'Comece grátis',
  },
  es: {
    faixaLink: 'Ver planes',
    sobre: 'Curso preparatorio para ENAMED y Revalida',
    titulo: ['Del ENAMED al Revalida:', 'su preparación hasta la aprobación.'],
    texto: 'Cursos preparatorios en línea para el ENAMED y para las dos etapas del Revalida. Preguntas oficiales del Inep comentadas alternativa por alternativa, clases por módulo, simulacros con tiempo de examen y la 2.ª etapa practicada con paciente simulado por IA. Estudie a su ritmo, en el celular o en la computadora.',
    ctaGratis: 'Empezar gratis',
    ctaPlanos: 'Planes desde {p}',
    selos: ['Sin tarjeta para empezar', 'Funciona en el celular', 'Sin permanencia'],
    demoRotulo: 'Pregunta oficial del Inep · Revalida {ed}',
    demoMarcada: 'Usted marcó {l}',
    demoComentario: 'Comentario RX · estándar Inep',
    numeros: ['preguntas oficiales del Inep para practicar', 'preguntas comentadas, alternativa por alternativa', 'módulos que se liberan con 90 %', 'estaciones de la 2.ª etapa', 'idiomas en la interfaz'],
    metodoSobre: 'El método',
    metodoTitulo: 'Cinco pasos hasta el examen',
    metodo: [
      ['Rayos X del examen', 'Vea lo que más evalúa el Inep, área por área, y dónde está usted hoy.'],
      ['Curso por módulos', 'Clínica, Cirugía, Pediatría, GO y Salud Colectiva. El siguiente módulo se abre cuando llega al 90 %.'],
      ['Preguntas comentadas', 'Después de cada respuesta, el porqué de la correcta y el error de cada alternativa, según la clave oficial.'],
      ['Simulacro del módulo', 'Cierra el módulo con las preguntas que ya hizo y otras nuevas del mismo tema, con cronómetro.'],
      ['Formado en el exterior: 2.ª etapa', 'Para el Revalida: estaciones de 10 minutos con paciente por IA, lista de evaluación del Inep y práctica en pareja por video.'],
    ],
    recursosSobre: 'Dentro de la plataforma',
    recursos: [
      ['Módulos que exigen dominio', 'Cada módulo reúne clases en texto, flashcards y preguntas. El anillo muestra cuánto falta, y el siguiente módulo queda cerrado hasta el 90 %. Nadie se salta etapas.'],
      ['Paciente simulado por IA, a cualquier hora', 'Conversa con el paciente, pide exámenes y recibe la nota con la lista de evaluación del Inep. Practique la estación a las 2 de la mañana, sin agendar con un profesor.'],
      ['Práctica en pareja, con video', 'Cree una sala, envíe el código a un colega y practiquen juntos: uno hace de candidato, el otro de paciente y examinador, con guion, hallazgos y cronómetro.'],
      ['Rayos X: lo que realmente aparece', 'Cada pregunta oficial clasificada por área, especialidad y tema. Sabe por dónde empezar y qué dejar para después.'],
    ],
    modulos: ['Clínica Médica', 'Cirugía', 'Pediatría', 'GO', 'Salud Colectiva'],
    modLiberado: 'liberado', modTrancado: 'se abre con 90 %',
    chat: [['p', 'Doctor, hace tres horas que mi hijo tiene un dolor muy fuerte en el escroto, del lado izquierdo.'], ['c', '¿Se golpeó o se cayó? ¿Tuvo fiebre o dolor al orinar?'], ['p', 'No se golpeó. Sin fiebre. Empezó de repente, en la escuela.'], ['c', 'Voy a examinarlo. Evalúo el reflejo cremastérico y la posición del testículo.']],
    chatPaciente: 'Paciente (IA)', chatVoce: 'Usted', chatNota: 'Nota de la estación', chatTempo: '07:42 restantes',
    duplaCand: 'Candidato', duplaAtor: 'Paciente y examinador', duplaCheck: ['Se presentó y verificó la identificación', 'Preguntó por trauma y fiebre', 'Indicó cirugía de urgencia'],
    raioxRotulo: 'Especialidades que más aparecen (todas las ediciones)',
    compSobre: 'Comparación',
    compTitulo: 'Qué cambia frente a los cursos tradicionales',
    compCols: ['', 'Cursos tradicionales', 'RX ENAMED'],
    comp: [
      ['Precio', 'R$ 2.000 a R$ 9.000 por año', 'desde {p} por mes'],
      ['Práctica de la 2.ª etapa', 'con profesor, en horario agendado', 'paciente por IA 24 h y práctica en pareja'],
      ['Hecho para', 'residencia, adaptado al ENAMED', 'ENAMED, con la 2.ª etapa del Revalida para formados en el exterior'],
      ['Español', 'raro', 'interfaz, clases y flashcards'],
      ['Aprobación divulgada', 'cifra de la propia empresa', 'solo cuando pueda verificarse en el Inep'],
    ],
    compNota: 'Rango de precios de los planes anuales de los cursos más grandes, relevado en octubre de 2026.',
    garantia: 'Las compras por internet tienen 7 días de arrepentimiento según el Código de Defensa del Consumidor de Brasil: si no le gusta, devolvemos el valor.',
    faqPagamento: [['¿Cómo funciona la renovación?', 'Cada pago libera el periodo del plan: 30 días, 6 meses o 12 meses. No hay cobro automático. Si renueva antes de vencer, los días nuevos se suman a los que faltan.'], ['¿Qué es el grupo fundador?', 'Los primeros alumnos pagan el precio de fundador y mantienen ese valor mientras la suscripción esté activa.']],
    finalTitulo: 'Empiece hoy por los Rayos X de su examen.',
    finalTexto: 'Gratis, sin tarjeta. En 30 minutos sabe en qué área está más fuerte y por dónde empezar.',
    barra: 'Empezar gratis',
  },
};

// Questão real mostrada no topo da página, com o comentário da equipe.
const comentarios = JSON.parse(readFileSync(`${raiz}app/dist/data/comentarios.json`, 'utf8'));
const DEMO = 'revalida_2024-2_q033';

function paginaInicial(lingua) {
  const tx = TX[lingua];
  const lp = LP[lingua];
  const qs = banco.questoes.length;
  const validas = banco.questoes.filter((q) => !q.anulada);
  const menorPreco = Math.min(...planos.filter((p) => p.preco > 0).map((p) => (lancamento?.ativo ? p.precoFundador : p.preco)));
  const aPartir = textosPreco({ preco: menorPreco, precoFundador: menorPreco, parcelas: 1, cobranca: 'mensal' }, null, lingua).preco;
  const valores = [qs, Object.keys(comentarios).length, 5, conteudo.estacoes.length, 2];
  const q = banco.questoes.find((x) => x.id === DEMO);
  const com = comentarios[DEMO]?.[lingua];
  const marcada = 'A';
  // Especialidades que mais caem, para o mini Raio-X.
  const contagem = {};
  for (const x of validas) contagem[x.especialidade] = (contagem[x.especialidade] || 0) + 1;
  const topo = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const mapa = (questoesPorEdicao[ultima.id] || []).map((x) => `<span style="background:var(--serie-${COR[x.area] || 1})"></span>`).join('');
  const fracoes = [1, 0.62, 0, 0, 0];
  return pagina({
    lingua, caminho: 'index.html', titulo: tx.titulo, descricao: tx.descricao, atual: 'inicio', profundidade: 0,
    corpo: ({ daRaiz, plataforma }) => `
${lancamento?.ativo ? `<p class="faixa-oferta"><span class="envoltorio"><strong>${esc(lancamento[lingua].selo)}</strong> ${esc(lancamento[lingua].texto)} <a href="${daRaiz(lingua, 'planos.html')}">${lp.faixaLink} →</a></span></p>` : ''}
<section class="envoltorio lp-heroi">
  <div class="lp-heroi-texto">
    <span class="sobretitulo">${lp.sobre}</span>
    <h1>${lp.titulo[0]} <span class="h1-luz">${lp.titulo[1]}</span></h1>
    <p class="lp-lead">${lp.texto}</p>
    <div class="linha-botoes">
      <a class="botao botao-primario botao-grande" href="${plataforma}">${lp.ctaGratis} →</a>
      <a class="botao botao-grande" href="${daRaiz(lingua, 'planos.html')}">${preencher(lp.ctaPlanos, { p: aPartir })}</a>
    </div>
    <ul class="selos">${lp.selos.map((x) => `<li>${x}</li>`).join('')}</ul>
  </div>
  <figure class="negatoscopio" aria-label="${esc(preencher(lp.demoRotulo, { ed: q.edicao }))}">
    <div class="scan" aria-hidden="true"></div>
    <figcaption class="demo-topo"><span>${preencher(lp.demoRotulo, { ed: q.edicao })}</span><span class="demo-tag">${esc(tDado(q.especialidade, lingua))}</span></figcaption>
    <p class="demo-enunciado" lang="pt-BR">${esc(q.enunciado.split(/(?<=\.)\s/).slice(0, 2).join(' '))} …</p>
    <ol class="demo-alts" lang="pt-BR">${q.alternativas.map((a, i) => {
      const l = 'ABCD'[i];
      return `<li class="${l === q.gabarito ? 'certa' : ''}"><span class="letra">${l}</span><span>${esc(a)}</span></li>`;
    }).join('')}</ol>
    ${com ? `<div class="demo-comentario"><span class="demo-com-rotulo">${lp.demoComentario}</span><p>${esc(com.resumo)}</p></div>` : ''}
  </figure>
</section>

<section class="lp-numeros"><div class="envoltorio">
  ${valores.map((v, i) => `<div><strong>${fmt(v, lingua)}</strong><span>${lp.numeros[i]}</span></div>`).join('')}
</div></section>

<section class="secao"><div class="envoltorio">
  <span class="sobretitulo">${lp.metodoSobre}</span>
  <h2 class="lp-h2">${lp.metodoTitulo}</h2>
  <ol class="passos">${lp.metodo.map(([t, d], i) => `<li><span class="passo-n">${String(i + 1).padStart(2, '0')}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}</ol>
</div></section>

<section class="secao"><div class="envoltorio">
  <span class="sobretitulo">${lp.recursosSobre}</span>
  <div class="recursos">
    <article class="recurso">
      <div class="recurso-texto"><h2 class="lp-h2">${lp.recursos[0][0]}</h2><p>${lp.recursos[0][1]}</p></div>
      <div class="mock mock-modulos" aria-hidden="true">${lp.modulos.map((m, i) => `<div class="mod" style="--c:var(--serie-${i + 1});--f:${fracoes[i]}">
        <span class="mod-n">Módulo ${i + 1}</span>
        ${i < 2 ? `<span class="anel"><span>${Math.round(fracoes[i] * 100)}%</span></span>` : '<span class="cadeado-lp"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>'}
        <strong>${m}</strong><span class="mod-st">${i < 2 ? lp.modLiberado : lp.modTrancado}</span></div>`).join('')}</div>
    </article>
    <article class="recurso recurso-inverso">
      <div class="recurso-texto"><h2 class="lp-h2">${lp.recursos[1][0]}</h2><p>${lp.recursos[1][1]}</p></div>
      <div class="mock celular" aria-hidden="true">
        <div class="celular-topo"><span>${lp.chatPaciente}</span><span class="cronometro">${lp.chatTempo}</span></div>
        <div class="chat">${lp.chat.map(([quem, txt]) => `<p class="bolha bolha-${quem}"><span>${quem === 'p' ? lp.chatPaciente : lp.chatVoce}</span>${esc(txt)}</p>`).join('')}</div>
        <div class="nota"><span>${lp.chatNota}</span><strong>8,7</strong></div>
      </div>
    </article>
    <article class="recurso">
      <div class="recurso-texto"><h2 class="lp-h2">${lp.recursos[2][0]}</h2><p>${lp.recursos[2][1]}</p></div>
      <div class="mock mock-dupla" aria-hidden="true">
        <div class="videos"><div class="video"><span class="av" style="background:var(--serie-1)">AN</span><span>${lp.duplaCand}</span></div><div class="video"><span class="av" style="background:var(--serie-5)">BE</span><span>${lp.duplaAtor}</span></div></div>
        <ul class="checklist">${lp.duplaCheck.map((c, i) => `<li class="${i < 2 ? 'ok' : ''}">${c}</li>`).join('')}</ul>
      </div>
    </article>
    <article class="recurso recurso-inverso">
      <div class="recurso-texto"><h2 class="lp-h2">${lp.recursos[3][0]}</h2><p>${lp.recursos[3][1]}</p></div>
      <div class="mock mock-raiox" aria-hidden="true">
        <span class="mock-rotulo">${preencher(tx.heroiPainel, { ed: `Revalida ${ultima.edicao}` })}</span>
        <div class="mapa">${mapa}</div>
        <span class="mock-rotulo">${lp.raioxRotulo}</span>
        <ul class="barras">${topo.map(([esp, n]) => `<li><span>${esc(tDado(esp, lingua))}</span><span class="barra"><i style="width:${(n / topo[0][1]) * 100}%"></i></span><b>${n}</b></li>`).join('')}</ul>
      </div>
    </article>
  </div>
</div></section>

<section class="secao"><div class="envoltorio">
  <span class="sobretitulo">${lp.compSobre}</span>
  <h2 class="lp-h2">${lp.compTitulo}</h2>
  <div class="tabela-rolagem comparativo"><table>
    <thead><tr>${lp.compCols.map((c, i) => `<th${i === 2 ? ' class="col-rx"' : ''}>${c}</th>`).join('')}</tr></thead>
    <tbody>${lp.comp.map(([a, b, c]) => `<tr><th scope="row">${a}</th><td>${b}</td><td class="col-rx">${preencher(c, { p: aPartir })}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="mudo pequeno" style="margin-top:10px">${lp.compNota}</p>
</div></section>

<section class="secao"><div class="envoltorio">
  <span class="sobretitulo">${tx.mentoresTitulo}</span>
  <h2 class="lp-h2">${tx.mentoresIntro}</h2>
  <div class="grade">${conteudo.mentores.map((m) => {
    const titulo = lingua === 'es' ? m.es?.titulo ?? m.titulo : m.titulo;
    const bordao = (lingua === 'es' ? m.es?.bordoes : m.bordoes)?.[0] ?? m.bordoes[0];
    const iniciais = m.nome.replace(/^Dra?\.\s*/, '').split(' ').map((x) => x[0]).slice(0, 2).join('');
    return `<article class="cartao mentor"><span class="avatar" style="background:var(--serie-${COR[m.area]})" aria-hidden="true">${iniciais}</span>
      <div><h3>${esc(m.nome)}</h3><span class="mudo pequeno">${esc(titulo)} · ${esc(tDado(m.area, lingua))}</span><q>${esc(bordao)}</q></div></article>`;
  }).join('')}</div>
</div></section>

<section class="secao" id="planos"><div class="envoltorio">
  <span class="sobretitulo">${tx.planosTitulo}</span>
  <h2 class="lp-h2">${tx.planosIntro}</h2>
  ${gradePlanos(lingua, plataforma)}
  <p class="garantia">${lp.garantia}</p>
</div></section>

<section class="secao"><div class="envoltorio">
  <h2 class="lp-h2">${tx.faqTitulo}</h2>
  ${[...tx.faq, ...lp.faqPagamento.slice(0, lancamento?.ativo ? 2 : 1)].map(([p, r]) => `<details class="faq"><summary>${p}</summary><p>${r}</p></details>`).join('')}
</div></section>

<section class="cta-final"><div class="envoltorio">
  <h2>${lp.finalTitulo}</h2>
  <p>${lp.finalTexto}</p>
  <a class="botao botao-primario botao-grande" href="${plataforma}">${lp.ctaGratis} →</a>
</div></section>
<div class="barra-cta" aria-hidden="true"><a class="botao botao-primario" href="${plataforma}" tabindex="-1">${lp.barra} →</a><a class="botao" href="${daRaiz(lingua, 'planos.html')}" tabindex="-1">${preencher(lp.ctaPlanos, { p: aPartir })}</a></div>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'EducationalOrganization', '@id': '#org', name: 'RX ENAMED', description: tx.descricao, ...(SITE_URL ? { url: SITE_URL } : {}) },
    { '@type': 'WebSite', name: 'RX ENAMED', inLanguage: lingua === 'es' ? 'es' : 'pt-BR', publisher: { '@id': '#org' }, ...(SITE_URL ? { url: SITE_URL } : {}) },
    {
      '@type': 'Course', name: tx.titulo, description: tx.descricao, inLanguage: ['pt-BR', 'es'],
      provider: { '@id': '#org' }, educationalLevel: lingua === 'es' ? 'Graduación en Medicina' : 'Graduação em Medicina',
      about: ['ENAMED', 'Revalida', lingua === 'es' ? 'Examen médico del Inep' : 'Exame médico do Inep'],
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online', courseWorkload: 'PT60H' },
      offers: planos.filter((p) => p.preco > 0).map((p) => ({ '@type': 'Offer', name: p[lingua].nome, price: (p.preco / 100).toFixed(2), priceCurrency: 'BRL', category: 'Paid' })),
    },
    { '@type': 'FAQPage', mainEntity: tx.faq.map(([pergunta, resposta]) => ({ '@type': 'Question', name: pergunta, acceptedAnswer: { '@type': 'Answer', text: resposta } })) },
  ],
}).replace(/</g, '\\u003c')}</script>`,
  });
}

// ------------------------------------------------------------------ escrita

rmSync(saida, { recursive: true, force: true });
const paginas = [];
const escrever = (lingua, caminho, html) => {
  const destino = `${saida}/${lingua === 'es' ? 'es/' : ''}${caminho}`;
  mkdirSync(destino.slice(0, destino.lastIndexOf('/')), { recursive: true });
  writeFileSync(destino, html);
  paginas.push(`${lingua === 'es' ? 'es/' : ''}${caminho}`);
};
for (const lingua of ['pt', 'es']) {
  escrever(lingua, 'index.html', paginaInicial(lingua));
  escrever(lingua, 'planos.html', paginaPlanos(lingua));
}
cpSync(`${raiz}site/site.css`, `${saida}/site.css`);
cpSync(`${raiz}app/dist`, `${saida}/plataforma`, { recursive: true });
// No site a área do aluno é uma página completa (no visualizador de artefatos o esqueleto vem de fora).
const app = readFileSync(`${raiz}app/dist/index.html`, 'utf8');
writeFileSync(`${saida}/plataforma/index.html`, `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${CHECKOUT_PROPRIO ? '<meta name="rx-servidor" content="1">\n' : ''}<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%232563eb'/%3E%3Ctext x='16' y='21' font-size='13' font-family='Arial' font-weight='700' fill='white' text-anchor='middle'%3ERX%3C/text%3E%3C/svg%3E">
</head>
<body>
${app}
</body>
</html>
`);

if (SITE_URL) {
  writeFileSync(`${saida}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas.map((p) => `  <url><loc>${SITE_URL}/${p.replace(/index\.html$/, '')}</loc></url>`).join('\n')}
</urlset>
`);
  writeFileSync(`${saida}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}
const arquivos = (p) => readdirSync(p, { withFileTypes: true }).reduce((n, d) => n + (d.isDirectory() ? arquivos(`${p}/${d.name}`) : 1), 0);
console.log(`site/dist: ${paginas.length} páginas (pt e es) + plataforma · ${arquivos(saida)} arquivos${SITE_URL ? ' · sitemap.xml' : ' · sem sitemap (defina SITE_URL)'}`);
