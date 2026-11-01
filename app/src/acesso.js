// Limites do plano gratuito: questões respondidas por dia (fora de simulados) e simulados iniciados por mês.
// Os números vêm de conteudo/planos.json (limitesGratis). Quem tem acesso completo (dono do artefato ou assinatura ativa) não tem limite.
// Atenção: a contagem fica no navegador do aluno; o bloqueio de verdade depende de login e pagamento no servidor.
import { inicioDoDia } from './util.js';

export const LIMITES_PADRAO = { questoesDia: 25, simuladosMes: 1 };

export function questoesHoje(progresso, agora = Date.now()) {
  const inicio = inicioDoDia(agora);
  let n = 0;
  for (const lista of Object.values(progresso.respostas)) for (const r of lista) if (r.t >= inicio && r.origem !== 'simulado') n += 1;
  return n;
}

export const inicioDoMes = (agora = Date.now()) => {
  const d = new Date(agora);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export function simuladosNoMes(progresso, agora = Date.now()) {
  const inicio = inicioDoMes(agora);
  const vistos = new Set((progresso.simuladosIniciados || []).filter((t) => t >= inicio));
  for (const s of progresso.simulados) if ((s.inicio ?? s.fim) >= inicio) vistos.add(s.inicio ?? s.fim);
  if (progresso.simuladoAtivo?.inicio >= inicio) vistos.add(progresso.simuladoAtivo.inicio);
  return vistos.size;
}

export function situacaoAcesso(progresso, limites = LIMITES_PADRAO, completo = false, agora = Date.now()) {
  if (completo) return { completo: true, limites, podeResponder: true, podeSimular: true, questoesRestantes: Infinity, simuladosRestantes: Infinity };
  const questoesRestantes = Math.max(0, limites.questoesDia - questoesHoje(progresso, agora));
  const simuladosRestantes = Math.max(0, limites.simuladosMes - simuladosNoMes(progresso, agora));
  return { completo: false, limites, questoesRestantes, simuladosRestantes, podeResponder: questoesRestantes > 0, podeSimular: simuladosRestantes > 0 };
}
