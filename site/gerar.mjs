// Gera o site público da Rx Med em site/dist/, em português (raiz) e espanhol (/es/):
//   index.html               a marca Rx Med: os dois cursos, a plataforma por dentro, planos e perguntas
//   enamed.html              curso Rx Med ENAMED
//   revalida.html            curso Rx Med Revalida (1ª etapa teórica e 2ª etapa prática)
//   planos.html              todos os planos e preços (de conteudo/planos.json)
//   img/                     telas reais da plataforma (site/img)
//   plataforma/              área do aluno (o app de estudo, copiado de app/dist)
//   sitemap.xml, robots.txt  só com SITE_URL definido (endereço final do site)
// Uso: node app/build.mjs && node site/gerar.mjs        (SITE_URL=https://seu-dominio node site/gerar.mjs)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const raiz = new URL('..', import.meta.url).pathname;
const saida = `${raiz}site/dist`;
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
// Com o servidor próprio (servidor/), os botões dos planos levam ao checkout da Rx Med: CHECKOUT_PROPRIO=1 node site/gerar.mjs
const CHECKOUT_PROPRIO = process.env.CHECKOUT_PROPRIO === '1';

if (!existsSync(`${raiz}app/dist/index.html`)) throw new Error('Rode antes: node app/build.mjs');
const banco = JSON.parse(readFileSync(`${raiz}app/public/data/questoes.json`, 'utf8'));
const conteudo = JSON.parse(readFileSync(`${raiz}app/dist/data/conteudo.json`, 'utf8'));
const comentarios = JSON.parse(readFileSync(`${raiz}app/dist/data/comentarios.json`, 'utf8'));
const { textosPreco } = await import(`${raiz}app/src/planos.js`);
const { lancamento, planos } = conteudo.planos;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n, lingua) => n.toLocaleString(lingua === 'es' ? 'es' : 'pt-BR');
const preencher = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

// ------------------------------------------------------------------ números (sempre dos dados)

const N = {
  comentadas: Object.keys(comentarios).length,
  edicoes: banco.edicoes.filter((e) => e.questoes > 0).length,
  estacoes: conteudo.estacoes.length,
  oficiais: conteudo.estacoes.filter((e) => e.origem === 'oficial').length,
  flashcards: conteudo.cartoes.length,
  aulas: conteudo.aulas.length,
  anos: (() => { const a = banco.edicoes.filter((e) => e.questoes > 0).map((e) => e.ano); return [Math.min(...a), Math.max(...a)]; })(),
};
const plano = (id) => planos.find((p) => p.id === id);
const valorMes = (p) => {
  const v = lancamento?.ativo ? p.precoFundador : p.preco;
  return Math.round(v / ({ mensal: 1, semestral: 6, anual: 12 }[p.cobranca] || 1));
};
const reais = (centavos, lingua) => textosPreco({ preco: centavos, precoFundador: centavos, parcelas: 1, cobranca: 'mensal' }, null, lingua).preco;

// ------------------------------------------------------------------ textos

const TX = {
  pt: {
    locale: 'pt-BR', og: 'pt_BR',
    menu: { inicio: 'Início', enamed: 'ENAMED', revalida: 'Revalida', planos: 'Planos' },
    entrar: 'Entrar', comecar: 'Começar grátis', pular: 'Pular para o conteúdo',
    rodape: {
      texto: 'Preparatório médico com questões oficiais do Inep comentadas, em português e espanhol.',
      cursos: 'Cursos', plataforma: 'Plataforma', inst: 'Institucional',
      raiox: 'Raio-X da prova', banco: 'Banco de questões', estacoes: 'Estações da 2ª etapa', area: 'Área do aluno',
      termos: 'Termos de uso', privacidade: 'Política de privacidade', planos: 'Planos e preços',
      aviso: 'A Rx Med é um curso independente, sem vínculo com o Inep ou o Ministério da Educação. Questões e gabaritos oficiais do Inep; comentários, aulas e estações autorais em revisão médica.',
    },
    janela: 'Plataforma Rx Med',
    // planos
    planos: {
      recomendado: 'Mais escolhido', completo: 'Mais completo', assinar: 'Assinar', emBreve: 'Pagamento abre em breve', gratis: 'Criar conta grátis',
      curso: { gratis: 'Todos os cursos', mensal: 'ENAMED · Revalida 1ª etapa', ciclo: 'ENAMED · Revalida', 'segunda-etapa': 'Revalida 2ª etapa', anual: 'Revalida 1ª e 2ª etapa' },
      rodape: 'Preços em reais. Pagamento por PIX, cartão em até 12× ou boleto, processado pelo Mercado Pago. Cada pagamento libera o período do plano, sem cobrança automática: antes de vencer, você renova se quiser. Você tem 7 dias para desistir e receber o valor de volta.',
      titulo: 'Planos e preços', descricao: 'Planos da Rx Med para o ENAMED e o Revalida: gratuito, mensal, ciclo de prova, 2ª etapa e anual completo.',
      intro: 'Comece grátis. Quando quiser o curso completo, escolha o plano que acompanha a sua prova.',
      porCurso: [['ENAMED', ['gratis', 'mensal', 'ciclo']], ['Revalida', ['gratis', 'mensal', 'ciclo', 'segunda-etapa', 'anual']]],
    },
    faqTitulo: 'Perguntas frequentes',
    // página inicial
    inicio: {
      titulo: 'Rx Med: preparatório para o ENAMED e o Revalida',
      descricao: 'Cursos online para o ENAMED e para as duas etapas do Revalida: questões oficiais do Inep comentadas, curso por módulos, cronograma, simulados e estações da 2ª etapa com paciente simulado. Comece grátis.',
      selo: 'ENAMED e Revalida · questões oficiais do Inep',
      h1: 'Do ENAMED ao Revalida, <span>com dados oficiais.</span>',
      sub: 'Uma plataforma que mostra o que cai na sua prova, escolhe o que estudar hoje e comenta cada alternativa das questões oficiais. Para o Revalida, também as estações da 2ª etapa com paciente simulado.',
      verCursos: 'Ver os cursos',
      legenda: 'Tela real da plataforma: o painel do aluno com o desafio do dia, o progresso no banco e as áreas resolvidas.',
      numeros: ['questões oficiais comentadas', 'edições, de {a} a {b}', 'estações da 2ª etapa, {o} oficiais', 'flashcards de revisão espaçada', 'plataforma nos dois idiomas'],
      cursosOlho: 'Cursos', cursosTitulo: 'Dois cursos, uma conta', cursosTexto: 'Escolha a sua prova. Os dois cursos usam a mesma plataforma, e você vê o que assinar.',
      enamed: {
        sobre: 'Para estudantes do 5º e 6º ano e recém-formados no Brasil que vão fazer o ENAMED.',
        grupos: [['Curso', ['6 módulos: as 5 grandes áreas e SUS', 'Aulas em texto, flashcards e simulado por módulo']],
          ['Treino', ['Banco oficial com comentário em cada alternativa', 'Desafio diário, trilha e cronograma semanal', 'Simulados no tempo da prova']]],
        botao: 'Conhecer o ENAMED',
      },
      revalida: {
        sobre: 'Para médicos formados no exterior, nas duas etapas do Revalida, em português e espanhol.',
        grupos: [['1ª etapa · teórica', ['Todas as provas oficiais de {a} a {b} comentadas', 'Simulados por edição e Raio-X por área']],
          ['2ª etapa · prática', ['Estações com paciente simulado e cronômetro', 'Correção pelo checklist (PEP) do Inep', 'Treino em dupla com um colega']]],
        botao: 'Conhecer o Revalida',
      },
      aPartir: 'a partir de', mes: '/mês',
      tourOlho: 'Por dentro da plataforma', tourTitulo: 'Veja como é estudar na Rx Med',
      tourTexto: 'As telas abaixo são da plataforma do aluno, com um perfil de exemplo depois de um mês de estudo.',
      passosOlho: 'Como funciona', passosTitulo: 'Cinco passos até a prova',
      passos: [['Raio-X', 'Veja como a sua prova é montada e o que mais cai.'], ['Plano', 'Informe a data da prova e as suas horas; o cronograma se monta.'],
        ['Desafio do dia', 'Questões escolhidas pelo peso na prova e pelos seus erros.'], ['Revisão', 'Erros e flashcards voltam no dia certo.'], ['Simulado', 'Prova inteira no tempo real e relatório por área.']],
      difOlho: 'Diferença', difTitulo: 'O que muda em relação aos cursos tradicionais', difCols: ['Curso tradicional', 'Rx Med'],
      dif: [['O que estudar hoje', 'Cronograma fixo, igual para todos', 'Desafio e cronograma montados com os seus erros'],
        ['Questões', 'Gabarito, às vezes um comentário geral', 'Comentário em cada alternativa, com o gabarito oficial'],
        ['Prioridade', 'Todos os temas com o mesmo peso', 'Peso de cada tema nas provas do Inep'],
        ['2ª etapa', 'Treino só em encontros marcados', 'Paciente simulado a qualquer hora e treino em dupla'],
        ['Idioma', 'Só português', 'Português e espanhol']],
      mentoresOlho: 'Mentores virtuais', mentoresTitulo: 'Uma voz por grande área',
      mentoresTexto: 'Cada área tem um mentor virtual da equipe Rx Med, que comenta os seus erros e as estações. São personagens do curso, com conteúdo revisado pela equipe médica.',
      planosOlho: 'Planos', planosTitulo: 'Comece grátis e escolha o plano da sua prova', verPlanos: 'Comparar todos os planos',
      faq: [['As questões são mesmo oficiais?', 'Sim. São os cadernos e os gabaritos definitivos publicados pelo Inep, do Revalida de {a} a {b} e do ENAMED. Questões anuladas aparecem marcadas e não contam no desempenho.'],
        ['Posso estudar pelo celular?', 'Sim. A plataforma funciona no navegador do celular, do tablet e do computador, sem instalar nada, e o progresso fica salvo na sua conta.'],
        ['O plano gratuito tem prazo?', 'Não. Ele continua liberado: Raio-X completo, 25 questões oficiais por dia, 1 simulado por mês e 1 estação da 2ª etapa por área.'],
        ['A plataforma tem versão em espanhol?', 'Sim. Interface, aulas, flashcards e mentores têm versão em espanhol. As questões ficam em português, como na prova do Inep.']],
      chamadaTitulo: 'Comece hoje pelo Raio-X da sua prova.', chamadaTexto: 'Crie a conta grátis em um minuto. Sem cartão de crédito.', chamadaBotao: 'Criar conta grátis',
    },
    tour: {
      painel: ['Painel e desafio diário', 'Abra e saiba o que fazer hoje', 'O painel mostra o desafio do dia, escolhido pelo peso de cada tema na prova e pelos seus erros. Fazer o desafio todos os dias mantém a sequência e dá bônus aos 7, 15 e 30 dias.', ['Progresso no banco e taxa de acerto', 'Questões resolvidas por grande área', 'Revisões espaçadas do dia'], 'início'],
      questao: ['Questões comentadas', 'Cada alternativa explica o porquê', 'Ao responder, você vê o gabarito oficial, o raciocínio do caso e o motivo de cada alternativa errada. O mentor da área deixa uma dica, e você pode anotar o que quer lembrar.', ['{c} questões oficiais comentadas', 'Filtros por prova, área, tema e palavra', 'Erradas vão para a revisão espaçada'], 'questões'],
      modulo: ['Curso por módulos', 'Teoria, flashcards e questões no mesmo módulo', 'Cada grande área é um módulo com aulas em texto, flashcards e as questões oficiais do tema. Com 90% do módulo feito, o simulado dele é liberado.', ['6 módulos, incluindo SUS e diretrizes', 'Aulas ligadas às questões que caem', 'Refazer só as que errou'], 'curso · clínica médica'],
      desempenho: ['Desempenho e metas', 'Saiba quanto falta e onde melhorar', 'Metas do mês, acerto e questões por semana e a projeção de nota pela distribuição de temas das provas do Inep.', ['Projeção de acerto na prova', 'Evolução semanal em gráficos', 'Acerto por área e especialidade'], 'desempenho'],
      cronograma: ['Cronograma', 'Sua semana montada com os seus dados', 'Diga quantas horas e em que dias você estuda. O cronograma distribui desafios, aulas e revisões, começando pela área mais fraca, e traz de volta o que ficou para trás.', ['Contagem regressiva até a prova', 'Atividades por dia, com tempo estimado', 'Ajuste a qualquer momento'], 'cronograma'],
      raiox: ['Raio-X da prova', 'O que o Inep cobra, questão por questão', 'Cada questão oficial foi classificada por especialidade, tema e tipo de cobrança. O Raio-X mostra como o caderno é montado e quais temas mais caem.', ['Mapa das 100 questões por área', 'Temas mais frequentes por edição', 'Gratuito para todos'], 'raio-x'],
      estacao: ['2ª etapa do Revalida', 'Estações com paciente simulado', 'Converse com o paciente, peça exame físico e exames, registre a hipótese e a conduta dentro do tempo. No fim, a nota sai pelo checklist do Inep, item por item.', ['Estações oficiais do Inep e autorais', 'Critério cumprido, parcial ou não feito', 'Treino em dupla: um é médico, o outro é ator'], 'prática · dor torácica'],
      'estacao-nota': ['Resultado da estação', 'Nota item por item', 'Veja o que contou ponto, o que faltou para pontuar tudo e a orientação do mentor da área.', ['Nota de 0 a 10', 'Critérios do PEP com pontuação', 'Refazer a estação depois de revisar'], 'prática · resultado'],
    },
    enamed: {
      titulo: 'Curso ENAMED online com questões oficiais comentadas | Rx Med',
      descricao: 'Curso preparatório para o ENAMED: 6 módulos, questões oficiais do Inep comentadas, desafio diário, cronograma e simulados. Comece grátis.',
      selo: 'Rx Med ENAMED', h1: 'O ENAMED com um plano <span>feito com os seus erros.</span>',
      sub: 'Curso por módulos, questões oficiais comentadas e uma trilha diária que prioriza o que mais cai e o que você mais erra.',
      fatos: ['módulos', 'questões comentadas', 'flashcards', 'aulas em texto'], verPlanos: 'Ver planos',
      modOlho: 'O curso', modTitulo: 'Seis módulos, um por grande área e um de SUS',
      modTexto: 'Estude na ordem que preferir. Cada módulo junta aulas, flashcards e as questões oficiais do tema; com 90% feito, o simulado do módulo é liberado.',
      modulos: [['Clínica Médica', 'Cardiologia, endocrinologia, infectologia, pneumologia e mais.'], ['Cirurgia', 'Trauma, abdome agudo, cirurgia geral e urologia.'],
        ['Pediatria', 'Neonatologia, puericultura, imunização e emergências.'], ['Ginecologia e Obstetrícia', 'Pré-natal, parto, oncologia ginecológica e planejamento familiar.'],
        ['Medicina de Família', 'Atenção primária, prevenção, epidemiologia e violência.'], ['SUS e diretrizes', 'Princípios, leis, financiamento e políticas de saúde.']],
      modulo: 'Módulo', tourOlho: 'Na plataforma', tourTitulo: 'Do primeiro dia até a prova', planosTitulo: 'Planos do ENAMED',
      faqTitulo: 'Sobre o curso ENAMED',
      faq: [['O que é o ENAMED?', 'O Exame Nacional de Avaliação da Formação Médica, aplicado pelo Inep aos concluintes de Medicina no Brasil desde 2025. A nota também é usada no acesso à residência pelo Enare.'],
        ['Por que há questões do Revalida no curso do ENAMED?', 'As duas provas são do Inep, com o mesmo estilo de caso clínico e as mesmas cinco grandes áreas. As edições do Revalida ampliam o treino; cada questão mostra de que prova veio.'],
        ['Preciso seguir os módulos em ordem?', 'Não. Todos estão abertos. O cronograma sugere começar pela área em que você está mais fraco.'],
        ['Quanto tempo por dia preciso?', 'Você escolhe. O cronograma se ajusta às horas e aos dias que você informar.']],
      chamadaTitulo: 'Comece pelo Raio-X do ENAMED.', chamadaTexto: 'Conta grátis, sem cartão de crédito.',
    },
    revalida: {
      titulo: 'Curso Revalida online: 1ª e 2ª etapa | Rx Med',
      descricao: 'Curso preparatório para o Revalida: todas as provas oficiais do Inep comentadas para a 1ª etapa e estações com paciente simulado para a 2ª etapa. Em português e espanhol.',
      selo: 'Rx Med Revalida · 1ª e 2ª etapa', h1: 'As duas etapas do Revalida <span>em um só lugar.</span>',
      sub: 'A 1ª etapa com todas as provas oficiais comentadas. A 2ª etapa com estações de paciente simulado, corrigidas pelo checklist do Inep. Em português e espanhol.',
      fatos: ['edições oficiais', 'questões comentadas', 'estações', 'idiomas'], verPlanos: 'Ver planos',
      etapa1: ['1ª etapa · teórica', 'Banco oficial comentado', 'As provas do Revalida de {a} a {b}, com comentário em cada alternativa.', ['Simulados por edição, no tempo real', 'Raio-X por área e tema', 'Curso com aulas e flashcards', 'Trilha diária e revisão dos erros']],
      etapa2: ['2ª etapa · prática', 'Estações com paciente simulado', '{e} estações, {o} delas oficiais do Inep, nas cinco grandes áreas.', ['Conversa com o paciente e pedido de exames', 'Nota pelo checklist (PEP) do Inep', 'Treino em dupla: médico e ator', 'Devolutiva do mentor da área']],
      t1Olho: '1ª etapa', t1Titulo: 'Prova teórica: treine com o que o Inep já cobrou',
      t2Olho: '2ª etapa', t2Titulo: 'Prova prática: como funciona uma estação',
      passos: [['1 · Leia', 'Instruções e tarefas', 'O caso e as tarefas, como no impresso da prova.'], ['2 · Atenda', 'Paciente e examinador', 'Pergunte, peça exame físico e exames e registre a conduta dentro de 10 minutos.'], ['3 · Corrija', 'Checklist do Inep', 'Cada item marcado como cumprido, parcial ou não feito, com a nota final.']],
      planosTitulo: 'Planos do Revalida', planosTexto: 'Comece grátis e escolha o plano da sua etapa.',
      faqTitulo: 'Sobre o curso Revalida',
      faq: [['A plataforma tem versão em espanhol?', 'Sim: interface, aulas, flashcards e mentores. As questões e as estações ficam em português, como na prova.'],
        ['Como funciona o paciente simulado?', 'Você escreve as perguntas e os pedidos como faria na prova. O paciente responde pelo caso da estação, e o examinador entrega os resultados de exame físico e exames.'],
        ['Posso treinar a 2ª etapa com um colega?', 'Sim. No treino em dupla, um faz o papel de médico e o outro de ator, com o roteiro separado, cronômetro e nota no fim.'],
        ['O curso cobre a prova discursiva?', 'Sim. A 1ª etapa inclui questões discursivas com o padrão de resposta do Inep.']],
      chamadaTitulo: 'Treine uma estação da 2ª etapa grátis.', chamadaTexto: 'Uma estação por área no plano gratuito.',
    },
  },
  es: {
    locale: 'es', og: 'es_419',
    menu: { inicio: 'Inicio', enamed: 'ENAMED', revalida: 'Revalida', planos: 'Planes' },
    entrar: 'Entrar', comecar: 'Empezar gratis', pular: 'Ir al contenido',
    rodape: {
      texto: 'Preparatorio médico con preguntas oficiales del Inep comentadas, en portugués y español.',
      cursos: 'Cursos', plataforma: 'Plataforma', inst: 'Institucional',
      raiox: 'Rayos X del examen', banco: 'Banco de preguntas', estacoes: 'Estaciones de la 2.ª etapa', area: 'Área del alumno',
      termos: 'Términos de uso', privacidade: 'Política de privacidad', planos: 'Planes y precios',
      aviso: 'Rx Med es un curso independiente, sin vínculo con el Inep ni con el Ministerio de Educación de Brasil. Preguntas y claves oficiales del Inep; comentarios, clases y estaciones propias en revisión médica.',
    },
    janela: 'Plataforma Rx Med',
    planos: {
      recomendado: 'El más elegido', completo: 'El más completo', assinar: 'Suscribirse', emBreve: 'El pago abre pronto', gratis: 'Crear cuenta gratis',
      curso: { gratis: 'Todos los cursos', mensal: 'ENAMED · Revalida 1.ª etapa', ciclo: 'ENAMED · Revalida', 'segunda-etapa': 'Revalida 2.ª etapa', anual: 'Revalida 1.ª y 2.ª etapa' },
      rodape: 'Precios en reales brasileños. Pago con PIX, tarjeta en hasta 12 cuotas o boleto, procesado por Mercado Pago. Cada pago libera el periodo del plan, sin cobro automático: antes de vencer, renueva si quiere. Tiene 7 días para desistir y recibir el dinero de vuelta.',
      titulo: 'Planes y precios', descricao: 'Planes de Rx Med para el ENAMED y el Revalida: gratuito, mensual, ciclo de examen, 2.ª etapa y anual completo.',
      intro: 'Empiece gratis. Cuando quiera el curso completo, elija el plan que acompaña su examen.',
      porCurso: [['ENAMED', ['gratis', 'mensal', 'ciclo']], ['Revalida', ['gratis', 'mensal', 'ciclo', 'segunda-etapa', 'anual']]],
    },
    faqTitulo: 'Preguntas frecuentes',
    inicio: {
      titulo: 'Rx Med: preparatorio para el ENAMED y el Revalida',
      descricao: 'Cursos en línea para el ENAMED y las dos etapas del Revalida de Brasil: preguntas oficiales del Inep comentadas, curso por módulos, cronograma, simulacros y estaciones de la 2.ª etapa con paciente simulado. Empiece gratis.',
      selo: 'ENAMED y Revalida · preguntas oficiales del Inep',
      h1: 'Del ENAMED al Revalida, <span>con datos oficiales.</span>',
      sub: 'Una plataforma que muestra lo que aparece en su examen, elige qué estudiar hoy y comenta cada alternativa de las preguntas oficiales. Para el Revalida, también las estaciones de la 2.ª etapa con paciente simulado.',
      verCursos: 'Ver los cursos',
      legenda: 'Pantalla real de la plataforma: el panel del alumno con el desafío del día, el progreso en el banco y las áreas resueltas.',
      numeros: ['preguntas oficiales comentadas', 'ediciones, de {a} a {b}', 'estaciones de la 2.ª etapa, {o} oficiales', 'flashcards de repaso espaciado', 'plataforma en dos idiomas'],
      cursosOlho: 'Cursos', cursosTitulo: 'Dos cursos, una cuenta', cursosTexto: 'Elija su examen. Los dos cursos usan la misma plataforma, y usted ve lo que contrate.',
      enamed: {
        sobre: 'Para estudiantes de 5.º y 6.º año y recién graduados en Brasil que van a rendir el ENAMED.',
        grupos: [['Curso', ['6 módulos: las 5 grandes áreas y SUS', 'Clases en texto, flashcards y simulacro por módulo']],
          ['Práctica', ['Banco oficial con comentario en cada alternativa', 'Desafío diario, ruta y cronograma semanal', 'Simulacros con el tiempo del examen']]],
        botao: 'Conocer el ENAMED',
      },
      revalida: {
        sobre: 'Para médicos formados en el exterior, en las dos etapas del Revalida, en portugués y español.',
        grupos: [['1.ª etapa · teórica', ['Todos los exámenes oficiales de {a} a {b} comentados', 'Simulacros por edición y Rayos X por área']],
          ['2.ª etapa · práctica', ['Estaciones con paciente simulado y cronómetro', 'Corrección con la lista de evaluación (PEP) del Inep', 'Práctica en pareja con un colega']]],
        botao: 'Conocer el Revalida',
      },
      aPartir: 'desde', mes: '/mes',
      tourOlho: 'Dentro de la plataforma', tourTitulo: 'Así se estudia en Rx Med',
      tourTexto: 'Las pantallas de abajo son de la plataforma del alumno, con un perfil de ejemplo después de un mes de estudio.',
      passosOlho: 'Cómo funciona', passosTitulo: 'Cinco pasos hasta el examen',
      passos: [['Rayos X', 'Vea cómo se arma su examen y qué aparece más.'], ['Plan', 'Indique la fecha del examen y sus horas; el cronograma se arma solo.'],
        ['Desafío del día', 'Preguntas elegidas por el peso en el examen y por sus errores.'], ['Repaso', 'Errores y flashcards vuelven en el día justo.'], ['Simulacro', 'Examen completo con el tiempo real e informe por área.']],
      difOlho: 'Diferencia', difTitulo: 'Qué cambia frente a los cursos tradicionales', difCols: ['Curso tradicional', 'Rx Med'],
      dif: [['Qué estudiar hoy', 'Cronograma fijo, igual para todos', 'Desafío y cronograma armados con sus errores'],
        ['Preguntas', 'Clave, a veces un comentario general', 'Comentario en cada alternativa, con la clave oficial'],
        ['Prioridad', 'Todos los temas con el mismo peso', 'Peso de cada tema en los exámenes del Inep'],
        ['2.ª etapa', 'Práctica solo en encuentros programados', 'Paciente simulado a cualquier hora y práctica en pareja'],
        ['Idioma', 'Solo portugués', 'Portugués y español']],
      mentoresOlho: 'Mentores virtuales', mentoresTitulo: 'Una voz por gran área',
      mentoresTexto: 'Cada área tiene un mentor virtual del equipo Rx Med, que comenta sus errores y las estaciones. Son personajes del curso, con contenido revisado por el equipo médico.',
      planosOlho: 'Planes', planosTitulo: 'Empiece gratis y elija el plan de su examen', verPlanos: 'Comparar todos los planes',
      faq: [['¿Las preguntas son realmente oficiales?', 'Sí. Son los cuadernillos y las claves definitivas publicados por el Inep, del Revalida de {a} a {b} y del ENAMED. Las preguntas anuladas aparecen marcadas y no cuentan en el rendimiento.'],
        ['¿Puedo estudiar desde el celular?', 'Sí. La plataforma funciona en el navegador del celular, la tableta y la computadora, sin instalar nada, y el progreso queda guardado en su cuenta.'],
        ['¿El plan gratuito tiene plazo?', 'No. Sigue liberado: Rayos X completo, 25 preguntas oficiales por día, 1 simulacro por mes y 1 estación de la 2.ª etapa por área.'],
        ['¿La plataforma está en español?', 'Sí. Interfaz, clases, flashcards y mentores están en español. Las preguntas quedan en portugués, como en el examen del Inep.']],
      chamadaTitulo: 'Empiece hoy por los Rayos X de su examen.', chamadaTexto: 'Cree la cuenta gratis en un minuto. Sin tarjeta de crédito.', chamadaBotao: 'Crear cuenta gratis',
    },
    tour: {
      painel: ['Panel y desafío diario', 'Abra y sepa qué hacer hoy', 'El panel muestra el desafío del día, elegido por el peso de cada tema en el examen y por sus errores. Hacer el desafío todos los días mantiene la racha y da bonos a los 7, 15 y 30 días.', ['Progreso en el banco y tasa de acierto', 'Preguntas resueltas por gran área', 'Repasos espaciados del día'], 'inicio'],
      questao: ['Preguntas comentadas', 'Cada alternativa explica el porqué', 'Al responder, ve la clave oficial, el razonamiento del caso y el motivo de cada alternativa incorrecta. El mentor del área deja un consejo, y usted puede anotar lo que quiere recordar.', ['{c} preguntas oficiales comentadas', 'Filtros por examen, área, tema y palabra', 'Las incorrectas van al repaso espaciado'], 'preguntas'],
      modulo: ['Curso por módulos', 'Teoría, flashcards y preguntas en el mismo módulo', 'Cada gran área es un módulo con clases en texto, flashcards y las preguntas oficiales del tema. Con el 90 % del módulo hecho, se libera su simulacro.', ['6 módulos, incluido SUS y directrices', 'Clases unidas a las preguntas que aparecen', 'Rehacer solo las que falló'], 'curso · clínica médica'],
      desempenho: ['Rendimiento y metas', 'Sepa cuánto falta y dónde mejorar', 'Metas del mes, acierto y preguntas por semana y la proyección de nota según la distribución de temas de los exámenes del Inep.', ['Proyección de acierto en el examen', 'Evolución semanal en gráficos', 'Acierto por área y especialidad'], 'rendimiento'],
      cronograma: ['Cronograma', 'Su semana armada con sus datos', 'Indique cuántas horas y qué días estudia. El cronograma reparte desafíos, clases y repasos, empezando por el área más débil, y trae de vuelta lo que quedó pendiente.', ['Cuenta regresiva hasta el examen', 'Actividades por día, con tiempo estimado', 'Ajuste en cualquier momento'], 'cronograma'],
      raiox: ['Rayos X del examen', 'Lo que evalúa el Inep, pregunta por pregunta', 'Cada pregunta oficial fue clasificada por especialidad, tema y tipo de evaluación. Los Rayos X muestran cómo se arma el cuadernillo y qué temas aparecen más.', ['Mapa de las 100 preguntas por área', 'Temas más frecuentes por edición', 'Gratis para todos'], 'rayos x'],
      estacao: ['2.ª etapa del Revalida', 'Estaciones con paciente simulado', 'Converse con el paciente, pida examen físico y exámenes, registre la hipótesis y la conducta dentro del tiempo. Al final, la nota sale de la lista de evaluación del Inep, ítem por ítem.', ['Estaciones oficiales del Inep y propias', 'Criterio cumplido, parcial o no hecho', 'Práctica en pareja: uno es médico, el otro actor'], 'práctica · dolor torácico'],
      'estacao-nota': ['Resultado de la estación', 'Nota ítem por ítem', 'Vea qué sumó puntos, qué faltó para el puntaje completo y la orientación del mentor del área.', ['Nota de 0 a 10', 'Criterios del PEP con puntaje', 'Rehacer la estación después de repasar'], 'práctica · resultado'],
    },
    enamed: {
      titulo: 'Curso ENAMED en línea con preguntas oficiales comentadas | Rx Med',
      descricao: 'Curso preparatorio para el ENAMED: 6 módulos, preguntas oficiales del Inep comentadas, desafío diario, cronograma y simulacros. Empiece gratis.',
      selo: 'Rx Med ENAMED', h1: 'El ENAMED con un plan <span>hecho con sus errores.</span>',
      sub: 'Curso por módulos, preguntas oficiales comentadas y una ruta diaria que prioriza lo que más aparece y lo que usted más falla.',
      fatos: ['módulos', 'preguntas comentadas', 'flashcards', 'clases en texto'], verPlanos: 'Ver planes',
      modOlho: 'El curso', modTitulo: 'Seis módulos, uno por gran área y uno de SUS',
      modTexto: 'Estudie en el orden que prefiera. Cada módulo reúne clases, flashcards y las preguntas oficiales del tema; con el 90 % hecho, se libera el simulacro del módulo.',
      modulos: [['Clínica Médica', 'Cardiología, endocrinología, infectología, neumología y más.'], ['Cirugía', 'Trauma, abdomen agudo, cirugía general y urología.'],
        ['Pediatría', 'Neonatología, puericultura, inmunización y emergencias.'], ['Ginecología y Obstetricia', 'Control prenatal, parto, oncología ginecológica y planificación familiar.'],
        ['Medicina Familiar', 'Atención primaria, prevención, epidemiología y violencia.'], ['SUS y directrices', 'Principios, leyes, financiamiento y políticas de salud.']],
      modulo: 'Módulo', tourOlho: 'En la plataforma', tourTitulo: 'Del primer día hasta el examen', planosTitulo: 'Planes del ENAMED',
      faqTitulo: 'Sobre el curso ENAMED',
      faq: [['¿Qué es el ENAMED?', 'El Examen Nacional de Evaluación de la Formación Médica, aplicado por el Inep a los estudiantes de último año de Medicina en Brasil desde 2025. La nota también se usa para el acceso a la residencia por el Enare.'],
        ['¿Por qué hay preguntas del Revalida en el curso del ENAMED?', 'Los dos exámenes son del Inep, con el mismo estilo de caso clínico y las mismas cinco grandes áreas. Las ediciones del Revalida amplían la práctica; cada pregunta muestra de qué examen viene.'],
        ['¿Tengo que seguir los módulos en orden?', 'No. Todos están abiertos. El cronograma sugiere empezar por el área en la que está más débil.'],
        ['¿Cuánto tiempo por día necesito?', 'Usted elige. El cronograma se ajusta a las horas y días que indique.']],
      chamadaTitulo: 'Empiece por los Rayos X del ENAMED.', chamadaTexto: 'Cuenta gratis, sin tarjeta de crédito.',
    },
    revalida: {
      titulo: 'Curso Revalida en línea: 1.ª y 2.ª etapa | Rx Med',
      descricao: 'Curso preparatorio para el Revalida de Brasil: todos los exámenes oficiales del Inep comentados para la 1.ª etapa y estaciones con paciente simulado para la 2.ª etapa. En español y portugués.',
      selo: 'Rx Med Revalida · 1.ª y 2.ª etapa', h1: 'Las dos etapas del Revalida <span>en un solo lugar.</span>',
      sub: 'La 1.ª etapa con todos los exámenes oficiales comentados. La 2.ª etapa con estaciones de paciente simulado, corregidas con la lista de evaluación del Inep. En español y portugués.',
      fatos: ['ediciones oficiales', 'preguntas comentadas', 'estaciones', 'idiomas'], verPlanos: 'Ver planes',
      etapa1: ['1.ª etapa · teórica', 'Banco oficial comentado', 'Los exámenes del Revalida de {a} a {b}, con comentario en cada alternativa.', ['Simulacros por edición, con el tiempo real', 'Rayos X por área y tema', 'Curso con clases y flashcards', 'Ruta diaria y repaso de errores']],
      etapa2: ['2.ª etapa · práctica', 'Estaciones con paciente simulado', '{e} estaciones, {o} de ellas oficiales del Inep, en las cinco grandes áreas.', ['Conversación con el paciente y pedido de exámenes', 'Nota con la lista de evaluación (PEP) del Inep', 'Práctica en pareja: médico y actor', 'Devolución del mentor del área']],
      t1Olho: '1.ª etapa', t1Titulo: 'Examen teórico: practique con lo que el Inep ya evaluó',
      t2Olho: '2.ª etapa', t2Titulo: 'Examen práctico: cómo funciona una estación',
      passos: [['1 · Lea', 'Instrucciones y tareas', 'El caso y las tareas, como en el impreso del examen.'], ['2 · Atienda', 'Paciente y examinador', 'Pregunte, pida examen físico y exámenes y registre la conducta en 10 minutos.'], ['3 · Corrija', 'Lista del Inep', 'Cada ítem marcado como cumplido, parcial o no hecho, con la nota final.']],
      planosTitulo: 'Planes del Revalida', planosTexto: 'Empiece gratis y elija el plan de su etapa.',
      faqTitulo: 'Sobre el curso Revalida',
      faq: [['¿La plataforma está en español?', 'Sí: interfaz, clases, flashcards y mentores. Las preguntas y las estaciones quedan en portugués, como en el examen.'],
        ['¿Cómo funciona el paciente simulado?', 'Escribe las preguntas y los pedidos como lo haría en el examen. El paciente responde según el caso de la estación, y el examinador entrega los resultados del examen físico y de los exámenes.'],
        ['¿Puedo practicar la 2.ª etapa con un colega?', 'Sí. En la práctica en pareja, uno hace de médico y el otro de actor, con el guion separado, cronómetro y nota al final.'],
        ['¿El curso cubre el examen discursivo?', 'Sí. La 1.ª etapa incluye preguntas discursivas con el estándar de respuesta del Inep.']],
      chamadaTitulo: 'Practique una estación de la 2.ª etapa gratis.', chamadaTexto: 'Una estación por área en el plan gratuito.',
    },
  },
};

const SIMBOLO = '<svg class="marca-simbolo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="12" fill="#102B38" stroke="#24495A"/><g fill="none" stroke-width="8" transform="translate(6 6) scale(.81)"><path d="M10 58V14H27A10 10 0 0 1 27 34H10" stroke="#fff"/><path d="M23 34L48 58" stroke="#fff"/><path d="M28 58L60 8" stroke="#19A987"/></g></svg>';
const ICONE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23102B38'/%3E%3Cg fill='none' stroke-width='8' transform='translate(6 6) scale(.81)'%3E%3Cpath d='M10 58V14H27A10 10 0 0 1 27 34H10' stroke='white'/%3E%3Cpath d='M23 34L48 58' stroke='white'/%3E%3Cpath d='M28 58L60 8' stroke='%2319A987'/%3E%3C/g%3E%3C/svg%3E";

// ------------------------------------------------------------------ moldura

function pagina({ lingua, caminho, titulo, descricao, atual, classe = '', corpo, dados }) {
  const tx = TX[lingua];
  const base = lingua === 'es' ? '../' : '';                 // da página até a raiz do site
  const link = (l, c) => `${base}${l === 'es' ? 'es/' : ''}${c}`;
  const ctx = {
    link: (c) => link(lingua, c),
    img: (n) => `${base}img/${n}.webp`,
    plataforma: `${base}plataforma/index.html${lingua === 'es' ? '?lang=es' : ''}`,
    entrar: CHECKOUT_PROPRIO ? '/entrar' : `${base}plataforma/index.html${lingua === 'es' ? '?lang=es' : ''}`,
  };
  const absoluto = (l) => `${SITE_URL}/${l === 'es' ? 'es/' : ''}${caminho === 'index.html' ? '' : caminho}`;
  const alternativos = SITE_URL ? `<link rel="canonical" href="${absoluto(lingua)}">
<link rel="alternate" hreflang="pt-BR" href="${absoluto('pt')}">
<link rel="alternate" hreflang="es" href="${absoluto('es')}">
<link rel="alternate" hreflang="x-default" href="${absoluto('pt')}">
<meta property="og:url" content="${absoluto(lingua)}">` : '';
  const item = (id, c) => `<a href="${ctx.link(c)}"${atual === id ? ' aria-current="page"' : ''}>${tx.menu[id]}</a>`;
  const r = tx.rodape;
  return `<!doctype html>
<html lang="${tx.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${tx.og}">
<meta property="og:site_name" content="Rx Med">
<meta name="twitter:card" content="summary">
<meta name="robots" content="index, follow, max-snippet:-1">
<meta name="theme-color" content="#102B38">
<link rel="icon" href="${ICONE}">
${alternativos}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="${base}site.css">
</head>
<body${classe ? ` class="${classe}"` : ''}>
<a class="pular" href="#conteudo">${tx.pular}</a>
<header class="topo"><div class="envoltorio">
  <a class="marca" href="${ctx.link('index.html')}">${SIMBOLO}<span>Rx <em>Med</em></span></a>
  <nav class="menu" aria-label="${lingua === 'es' ? 'Secciones' : 'Seções'}">${item('inicio', 'index.html')}${item('enamed', 'enamed.html')}${item('revalida', 'revalida.html')}${item('planos', 'planos.html')}</nav>
  <nav class="idioma" aria-label="Idioma">
    <a href="${link('pt', caminho)}" hreflang="pt-BR" lang="pt-BR"${lingua === 'pt' ? ' aria-current="true"' : ''}>PT</a>
    <a href="${link('es', caminho)}" hreflang="es" lang="es"${lingua === 'es' ? ' aria-current="true"' : ''}>ES</a>
  </nav>
  <div class="topo-acoes"><a class="botao botao-pequeno entrar" href="${ctx.entrar}">${tx.entrar}</a><a class="botao botao-primario botao-pequeno" href="${ctx.plataforma}">${tx.comecar}</a></div>
</div></header>
<main id="conteudo" class="envoltorio">
${corpo(ctx)}
</main>
<footer class="rodape"><div class="envoltorio">
  <div class="rodape-colunas">
    <div><a class="marca" href="${ctx.link('index.html')}">${SIMBOLO}<span>Rx <em>Med</em></span></a><p style="margin-top:12px;max-width:22rem">${r.texto}</p></div>
    <div><h4>${r.cursos}</h4><a href="${ctx.link('enamed.html')}">Rx Med ENAMED</a><a href="${ctx.link('revalida.html')}">Rx Med Revalida</a><a href="${ctx.link('planos.html')}">${r.planos}</a></div>
    <div><h4>${r.plataforma}</h4><a href="${ctx.plataforma}">${r.area}</a><a href="${ctx.link('index.html')}#plataforma">${r.raiox}</a><a href="${ctx.link('revalida.html')}#segunda-etapa">${r.estacoes}</a></div>
    <div><h4>${r.inst}</h4>${CHECKOUT_PROPRIO ? `<a href="/termos">${r.termos}</a><a href="/privacidade">${r.privacidade}</a><a href="/entrar">${tx.entrar}</a>` : `<a href="${ctx.plataforma}">${tx.entrar}</a>`}</div>
  </div>
  <p class="rodape-fim">© ${new Date().getFullYear()} Rx Med · ${r.aviso}</p>
</div></footer>
${dados ? `<script type="application/ld+json">${JSON.stringify(dados).replace(/</g, '\\u003c')}</script>` : ''}
</body>
</html>
`;
}

// Textos de um plano que mudam conforme o curso em que ele aparece (mesmo plano, mesmo preço e mesmo checkout).
const TEXTO_CURSO = {
  revalida: {
    ciclo: {
      pt: { nome: 'Ciclo de prova', para: 'Até a prova do Revalida, 6 meses', itens: ['Tudo do mensal', 'Simulados por edição do Revalida', 'Treino em dupla com colega', 'Mentores por área', `Sai ${reais(6 * plano('mensal').preco - plano('ciclo').preco, 'pt')} mais barato que 6 meses no mensal`] },
      es: { nome: 'Ciclo de examen', para: 'Hasta el examen del Revalida, 6 meses', itens: ['Todo lo del mensual', 'Simulacros por edición del Revalida', 'Práctica en pareja con un colega', 'Mentores por área', `Sale ${reais(6 * plano('mensal').preco - plano('ciclo').preco, 'es')} más barato que 6 meses en el mensual`] },
    },
  },
};

// ------------------------------------------------------------------ peças

const lista = (itens) => `<ul class="lista-check">${itens.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const cab = (olho, titulo, texto) => `<div class="secao-cab">${olho ? `<span class="olho">${olho}</span>` : ''}<h2>${titulo}</h2>${texto ? `<p>${texto}</p>` : ''}</div>`;
const janela = (ctx, tx, img, rota, alt) => `<div class="janela"><div class="barra"><i></i><i></i><i></i><span>${tx.janela} · ${esc(rota)}</span></div><img src="${ctx.img(img)}" alt="${esc(alt)}" width="1600" height="1000" loading="lazy" decoding="async"></div>`;
function tour(ctx, lingua, id, inverso = false, etiqueta = '') {
  const tx = TX[lingua];
  const [olho, titulo, texto, itens, rota] = tx.tour[id];
  return `<div class="tour${inverso ? ' inverso' : ''}"><div class="tour-texto"><span class="olho">${olho}</span><h3>${titulo}</h3><p>${texto}</p>${lista(itens.map((i) => preencher(i, { c: fmt(N.comentadas, lingua) })))}${etiqueta ? `<span class="etiqueta">${etiqueta}</span>` : ''}</div>${janela(ctx, tx, id, rota, `${olho}: ${titulo}`)}</div>`;
}
const faq = (itens, lingua) => `<div class="faq">${itens.map(([q, a], i) => `<details class="cartao"${i === 0 ? ' open' : ''}><summary>${q}</summary><p>${preencher(a, { a: N.anos[0], b: N.anos[1] })}</p></details>`).join('')}</div>`;
const chamada = (titulo, texto, botao, ctx) => `<section class="chamada"><div><h2>${titulo}</h2><p class="mudo" style="margin-top:8px">${texto}</p></div><a class="botao botao-primario" href="${ctx.plataforma}">${botao}</a></section>`;
const faqDados = (itens, lingua) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: itens.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: preencher(a, { a: N.anos[0], b: N.anos[1] }) } })) });

function cartaoPlano(p, lingua, ctx, { comCurso = false, destaque = p.destaque, curso = '' } = {}) {
  const tx = TX[lingua].planos;
  // No bloco do Revalida, o mesmo plano de 6 meses aparece com o texto da prova do Revalida.
  const t = { ...p[lingua], ...(TEXTO_CURSO[curso]?.[p.id]?.[lingua] || {}) };
  const preco = textosPreco(p, lancamento, lingua);
  const botao = p.preco === 0
    ? `<a class="botao" href="${ctx.plataforma}">${tx.gratis}</a>`
    : CHECKOUT_PROPRIO
      ? `<a class="botao${destaque ? ' botao-primario' : ''}" href="/checkout?plano=${p.id}${lingua === 'es' ? '&amp;lang=es' : ''}">${tx.assinar}</a>`
      : p.checkout
        ? `<a class="botao${destaque ? ' botao-primario' : ''}" href="${esc(p.checkout)}" rel="noopener">${tx.assinar}</a>`
        : `<span class="botao botao-inativo" aria-disabled="true">${tx.emBreve}</span>`;
  const selo = destaque ? `<span class="plano-selo">${p.id === 'anual' ? tx.completo : tx.recomendado}</span>` : '';
  return `<article class="cartao plano${destaque ? ' destaque' : ''}" id="plano-${p.id}">${selo}
    ${comCurso ? `<span class="plano-curso">${tx.curso[p.id] || ''}</span>` : ''}
    <h3>${esc(t.nome)}</h3><p class="mudo pequeno">${esc(t.para)}</p>
    <p class="preco">${preco.de ? `<s>${preco.de}</s> ` : ''}${preco.preco}</p>
    <p class="mudo pequeno">${esc(preco.periodo)}${preco.parcela ? ` · ${esc(preco.parcela)}` : ''}</p>
    <ul>${t.itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <p class="plano-acao">${botao}</p></article>`;
}
const avisoLancamento = (lingua) => (lancamento?.ativo ? `<p class="aviso-lancamento"><strong>${esc(lancamento[lingua].selo)}</strong> ${esc(lancamento[lingua].texto)}</p>` : '');
const gradePlanos = (ids, lingua, ctx, opcoes = {}) => `${avisoLancamento(lingua)}<div class="grade-planos" style="--colunas:${ids.length}">${ids.map((id) => cartaoPlano(plano(id), lingua, ctx, { ...opcoes, destaque: (opcoes.destaques || []).includes(id) || (!opcoes.destaques && plano(id).destaque) })).join('')}</div>`;

// ------------------------------------------------------------------ páginas

function paginaInicial(lingua) {
  const tx = TX[lingua];
  const L = tx.inicio;
  const anos = { a: N.anos[0], b: N.anos[1] };
  const grupos = (gs) => gs.map(([t, itens]) => `<div class="grupo"><strong>${t}</strong>${lista(itens.map((i) => preencher(i, anos)))}</div>`).join('');
  const precoEnamed = reais(valorMes(plano('ciclo')), lingua);
  const precoRevalida = reais(valorMes(plano('ciclo')), lingua);
  const cores = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)'];
  const ordemMentores = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia e Obstetrícia', 'Medicina de Família e Comunidade / Saúde Coletiva'];
  const mentores = ordemMentores.map((a) => conteudo.mentores.find((m) => m.area === a)).filter(Boolean);
  return pagina({
    lingua, caminho: 'index.html', titulo: L.titulo, descricao: L.descricao, atual: 'inicio',
    dados: [{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Rx Med', ...(SITE_URL ? { url: `${SITE_URL}/` } : {}) }, faqDados(L.faq, lingua)],
    corpo: (ctx) => `
<section class="heroi-centro"><span class="selo">${L.selo}</span>
  <h1>${L.h1}</h1><p class="sub">${L.sub}</p>
  <div class="linha-botoes"><a class="botao botao-primario" href="${ctx.plataforma}">${tx.comecar}</a><a class="botao" href="#cursos">${L.verCursos} ↓</a></div>
  <div class="vitrine">${janela(ctx, tx, 'painel', tx.tour.painel[4], L.legenda).replace(' loading="lazy"', ' fetchpriority="high"')}<div class="celular"><img src="${ctx.img('celular-painel')}" alt="" width="600" height="1200" loading="lazy"></div></div>
  <p class="legenda">${L.legenda}</p>
</section>
<section class="numeros">${[fmt(N.comentadas, lingua), N.edicoes, N.estacoes, N.flashcards, 'PT · ES'].map((v, i) => `<div><strong>${v}</strong><span>${preencher(L.numeros[i], { ...anos, o: N.oficiais })}</span></div>`).join('')}</section>
<section class="secao" id="cursos">${cab(L.cursosOlho, L.cursosTitulo, L.cursosTexto)}
  <div class="cursos">
    <article class="cartao curso"><h3><small>Rx Med</small>ENAMED</h3><p class="mudo">${L.enamed.sobre}</p>${grupos(L.enamed.grupos)}
      <div class="curso-rodape"><span class="mono">${L.aPartir}<b>${precoEnamed}${L.mes}</b></span><a class="botao botao-primario" href="${ctx.link('enamed.html')}">${L.enamed.botao}</a></div></article>
    <article class="cartao curso curso-revalida"><h3><small>Rx Med · ${lingua === 'es' ? '1.ª y 2.ª etapa' : '1ª e 2ª etapa'}</small>Revalida</h3><p class="mudo">${L.revalida.sobre}</p>${grupos(L.revalida.grupos)}
      <div class="curso-rodape"><span class="mono">${L.aPartir}<b>${precoRevalida}${L.mes}</b></span><a class="botao" href="${ctx.link('revalida.html')}">${L.revalida.botao}</a></div></article>
  </div>
</section>
<section class="secao" id="plataforma">${cab(L.tourOlho, L.tourTitulo, L.tourTexto)}
  ${tour(ctx, lingua, 'questao', false, 'Revalida 2011 · 58')}${tour(ctx, lingua, 'estacao', true)}
</section>
<section class="secao">${cab(L.passosOlho, L.passosTitulo)}
  <div class="grade grade-5">${L.passos.map(([t, d], i) => `<div class="cartao bloco"><span class="n">0${i + 1}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>
<section class="secao">${cab(L.difOlho, L.difTitulo)}
  <table class="tabela"><thead><tr><th scope="col"></th><th scope="col">${L.difCols[0]}</th><th scope="col">${L.difCols[1]}</th></tr></thead>
  <tbody>${L.dif.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="rx">${c}</td></tr>`).join('')}</tbody></table></section>
<section class="secao">${cab(L.mentoresOlho, L.mentoresTitulo, L.mentoresTexto)}
  <div class="grade grade-5">${mentores.map((m, i) => {
    const [t1, ...resto] = m.nome.split(' ');
    const iniciais = m.nome.replace(/^Dra?\.\s*/, '').split(' ').map((p) => p[0]).slice(0, 2).join('');
    return `<div class="cartao mentor"><b style="background:${cores[i]}">${esc(iniciais)}</b><strong>${esc(`${t1} ${resto[0]}`)}</strong><span>${esc(lingua === 'es' ? (m.es?.titulo || m.titulo) : m.titulo)}</span></div>`;
  }).join('')}</div></section>
<section class="secao">${cab(L.planosOlho, L.planosTitulo)}
  ${gradePlanos(['gratis', 'mensal', 'ciclo', 'segunda-etapa', 'anual'], lingua, ctx, { comCurso: true })}
  <p style="margin-top:20px"><a href="${ctx.link('planos.html')}">${L.verPlanos} →</a></p></section>
<section class="secao">${cab(tx.faqTitulo, '')}${faq(L.faq, lingua)}</section>
${chamada(L.chamadaTitulo, L.chamadaTexto, L.chamadaBotao, ctx)}`,
  });
}

function paginaEnamed(lingua) {
  const tx = TX[lingua];
  const L = tx.enamed;
  return pagina({
    lingua, caminho: 'enamed.html', titulo: L.titulo, descricao: L.descricao, atual: 'enamed',
    dados: [{ '@context': 'https://schema.org', '@type': 'Course', name: 'Rx Med ENAMED', description: L.descricao, inLanguage: [tx.locale], provider: { '@type': 'Organization', name: 'Rx Med' } }, faqDados(L.faq, lingua)],
    corpo: (ctx) => `
<p class="migalhas"><a href="${ctx.link('index.html')}">Rx Med</a> › ENAMED</p>
<section class="heroi"><div><span class="selo">${L.selo}</span><h1>${L.h1}</h1><p class="sub">${L.sub}</p>
  <div class="linha-botoes"><a class="botao botao-primario" href="${ctx.plataforma}">${tx.comecar}</a><a class="botao" href="#planos">${L.verPlanos}</a></div>
  <div class="fatos">${[6, fmt(N.comentadas, lingua), N.flashcards, N.aulas].map((v, i) => `<div><strong>${v}</strong><span>${L.fatos[i]}</span></div>`).join('')}</div></div>
  ${janela(ctx, tx, 'curso', lingua === 'es' ? 'curso' : 'curso', L.selo).replace(' loading="lazy"', '')}</section>
<section class="secao">${cab(L.modOlho, L.modTitulo, L.modTexto)}
  <div class="grade">${L.modulos.map(([t, d], i) => `<div class="cartao bloco"><span class="n">${L.modulo} ${i + 1}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>
<section class="secao">${cab(L.tourOlho, L.tourTitulo)}${tour(ctx, lingua, 'questao')}</section>
<section class="secao" id="planos">${cab(TX[lingua].inicio.planosOlho, L.planosTitulo)}${gradePlanos(['gratis', 'mensal', 'ciclo'], lingua, ctx)}<p class="mudo pequeno" style="margin-top:20px">${tx.planos.rodape}</p></section>
<section class="secao">${cab(tx.faqTitulo, L.faqTitulo)}${faq(L.faq, lingua)}</section>
${chamada(L.chamadaTitulo, L.chamadaTexto, tx.inicio.chamadaBotao, ctx)}`,
  });
}

function paginaRevalida(lingua) {
  const tx = TX[lingua];
  const L = tx.revalida;
  const anos = { a: N.anos[0], b: N.anos[1], e: N.estacoes, o: N.oficiais };
  const etapa = ([selo, titulo, texto, itens], id) => `<div class="cartao etapa"${id ? ` id="${id}"` : ''}><span class="selo">${selo}</span><h3>${titulo}</h3><p class="mudo">${preencher(texto, anos)}</p>${lista(itens)}</div>`;
  return pagina({
    lingua, caminho: 'revalida.html', titulo: L.titulo, descricao: L.descricao, atual: 'revalida', classe: 'curso-revalida',
    dados: [{ '@context': 'https://schema.org', '@type': 'Course', name: 'Rx Med Revalida', description: L.descricao, inLanguage: ['pt-BR', 'es'], provider: { '@type': 'Organization', name: 'Rx Med' } }, faqDados(L.faq, lingua)],
    corpo: (ctx) => `
<p class="migalhas"><a href="${ctx.link('index.html')}">Rx Med</a> › Revalida</p>
<section class="heroi"><div><span class="selo">${L.selo}</span><h1>${L.h1}</h1><p class="sub">${L.sub}</p>
  <div class="linha-botoes"><a class="botao botao-primario" href="${ctx.plataforma}">${tx.comecar}</a><a class="botao" href="#planos">${L.verPlanos}</a></div>
  <div class="fatos">${[N.edicoes, fmt(N.comentadas, lingua), N.estacoes, 'PT · ES'].map((v, i) => `<div><strong>${v}</strong><span>${L.fatos[i]}</span></div>`).join('')}</div></div>
  ${janela(ctx, tx, 'estacao', tx.tour.estacao[4], tx.tour.estacao[1]).replace(' loading="lazy"', '')}</section>
<section class="secao"><div class="grade grade-2">${etapa(L.etapa1)}${etapa(L.etapa2)}</div></section>
<section class="secao" id="segunda-etapa">${cab(L.t2Olho, L.t2Titulo)}
  <div class="grade">${L.passos.map(([n, t, d]) => `<div class="cartao bloco"><span class="n">${n}</span><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
  ${tour(ctx, lingua, 'estacao-nota', true)}</section>
<section class="secao" id="planos">${cab(tx.inicio.planosOlho, L.planosTitulo, L.planosTexto)}${gradePlanos(['gratis', 'mensal', 'ciclo', 'segunda-etapa', 'anual'], lingua, ctx, { destaques: ['anual'], curso: 'revalida' })}<p class="mudo pequeno" style="margin-top:20px">${tx.planos.rodape}</p></section>
<section class="secao">${cab(tx.faqTitulo, L.faqTitulo)}${faq(L.faq, lingua)}</section>
${chamada(L.chamadaTitulo, L.chamadaTexto, tx.inicio.chamadaBotao, ctx)}`,
  });
}

function paginaPlanos(lingua) {
  const tx = TX[lingua];
  const P = tx.planos;
  const oferta = planos.filter((p) => p.preco > 0).map((p) => ({ '@type': 'Offer', name: p[lingua].nome, priceCurrency: 'BRL', price: ((lancamento?.ativo ? p.precoFundador : p.preco) / 100).toFixed(2) }));
  return pagina({
    lingua, caminho: 'planos.html', titulo: `${P.titulo} | Rx Med`, descricao: P.descricao, atual: 'planos',
    dados: { '@context': 'https://schema.org', '@type': 'Product', name: 'Rx Med', offers: oferta },
    corpo: (ctx) => `
<p class="migalhas"><a href="${ctx.link('index.html')}">Rx Med</a> › ${tx.menu.planos}</p>
<div class="secao-cab" style="margin-top:20px"><h1 style="font-size:clamp(1.9rem,4.5vw,2.8rem)">${P.titulo}</h1><p>${P.intro}</p></div>
${P.porCurso.map(([curso, ids]) => `<section class="secao${curso === 'Revalida' ? ' curso-revalida' : ''}" style="margin-top:56px">${cab('Rx Med', curso)}${gradePlanos(ids, lingua, ctx, curso === 'Revalida' ? { destaques: ['anual'], curso: 'revalida' } : {})}</section>`).join('')}
<p class="mudo pequeno" style="margin-top:24px">${P.rodape}</p>`,
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
  escrever(lingua, 'enamed.html', paginaEnamed(lingua));
  escrever(lingua, 'revalida.html', paginaRevalida(lingua));
  escrever(lingua, 'planos.html', paginaPlanos(lingua));
}
cpSync(`${raiz}site/site.css`, `${saida}/site.css`);
cpSync(`${raiz}site/img`, `${saida}/img`, { recursive: true });
cpSync(`${raiz}app/dist`, `${saida}/plataforma`, { recursive: true });
// Com servidor próprio, as estações completas (roteiro do paciente e PEP) nunca ficam em arquivo público.
if (CHECKOUT_PROPRIO) rmSync(`${saida}/plataforma/data/estacoes-local.json`, { force: true });
// No site a área do aluno é uma página completa (no visualizador de artefatos o esqueleto vem de fora).
const app = readFileSync(`${raiz}app/dist/index.html`, 'utf8');
writeFileSync(`${saida}/plataforma/index.html`, `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${CHECKOUT_PROPRIO ? '<meta name="rx-servidor" content="1">\n' : ''}<link rel="icon" href="${ICONE}">
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
