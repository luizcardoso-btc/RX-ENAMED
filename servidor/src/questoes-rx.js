// Banco de questões autorais e importadas que dependem de revisão médica (importar/banco_externo.json,
// gerado por importar_questoes.py). O servidor guarda a decisão do revisor; só as aprovadas vão para os alunos.
import { existsSync, readFileSync } from 'node:fs';

export function carregarQuestoesRx(arquivo) {
  if (!arquivo || !existsSync(arquivo)) return { lista: [], porId: new Map() };
  const dados = JSON.parse(readFileSync(arquivo, 'utf8'));
  const lista = (dados.questoes || []).map(({ impressao, ...q }) => q);
  return { lista, porId: new Map(lista.map((q) => [q.id, q])) };
}

/** Versão que vai para o aluno: gabarito corrigido pelo revisor, marca de origem e de revisão. */
export function questaoParaAluno(q, rev) {
  return {
    id: q.id, exame: q.fonte === 'inedita' ? 'Inédita RX' : q.exame, edicao: q.fonte === 'inedita' ? '' : q.edicao,
    ano: q.ano, numero: q.numero, fonte: q.fonte, area: q.area, especialidade: q.especialidade, tema: q.tema || '',
    tipo: q.tipo || '', dificuldade: q.dificuldade || '', classificacao: 'revisada', gabarito: rev.gabarito || q.gabarito,
    anulada: false, caso_clinico: q.caso_clinico, enunciado: q.enunciado, alternativas: q.alternativas, figuras: [],
    comentario: q.comentario, origem: q.origem, revisao: { por: rev.revisor, crm: rev.crm || '', em: rev.revisado_em },
  };
}
