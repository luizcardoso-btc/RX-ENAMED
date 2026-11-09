// Relatório da turma (coordenação): usado na página pública do link e na aba Turmas do admin.
import { esc } from './comum.js';

const pct = (x) => (x === null || x === undefined ? '—' : `${Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const milhar = (n) => Math.round(n || 0).toLocaleString('pt-BR');
const dataCurta = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

export function htmlRelatorio(r) {
  const maxSemana = Math.max(1, ...r.semanas.map((s) => s.questoes));
  return `
  <header class="rel-cab"><div><span class="rx-mudo pequeno">Relatório da turma · Rx Med</span><h1>${esc(r.nome)}</h1>
    <p class="rx-mudo pequeno">Gerado em ${new Date(r.geradoEm).toLocaleString('pt-BR')} · ${milhar(r.alunos)} alunos cadastrados com esta faculdade · ${milhar(r.autorizaram)} autorizaram mostrar o desempenho individual</p></div>
    <button class="botao rx-nao-imprimir" type="button" data-imprimir>Salvar em PDF</button></header>
  <div class="rx-kpis">
    <div class="rx-kpi"><span>Alunos</span><strong>${milhar(r.alunos)}</strong><small>${r.porEtapa.map((e) => `${esc(e.etapa)}: ${e.alunos}`).join(' · ')}</small></div>
    <div class="rx-kpi"><span>Ativos</span><strong>${milhar(r.ativos7)}</strong><small>na última semana · ${milhar(r.ativos30)} em 30 dias</small></div>
    <div class="rx-kpi"><span>Questões resolvidas</span><strong>${milhar(r.resolvidas)}</strong><small>questões oficiais do Inep</small></div>
    <div class="rx-kpi"><span>Acerto da turma</span><strong>${pct(r.acerto)}</strong><small>última resposta de cada questão</small></div>
    <div class="rx-kpi"><span>Alunos em risco</span><strong${r.emRisco ? ' style="color:var(--aviso)"' : ''}>${milhar(r.emRisco)}</strong><small>parados há 14+ dias ou acerto &lt; 50%</small></div>
  </div>
  <section class="rx-cartao rel-bloco"><h2>Acerto por grande área</h2>
    ${r.areas.length ? `<table class="rx-tabela"><thead><tr><th>Área</th><th>Acerto</th><th></th><th>Questões</th><th>Alunos</th></tr></thead><tbody>
      ${r.areas.map((a) => `<tr><td>${esc(a.area)}</td><td><strong>${pct(a.acerto)}</strong></td><td style="width:40%"><span class="rel-barra"><i style="width:${a.acerto}%;${a.acerto < 50 ? 'background:var(--aviso)' : ''}"></i></span></td><td>${milhar(a.resolvidas)}</td><td>${a.alunos}</td></tr>`).join('')}
    </tbody></table><p class="rx-mudo pequeno">Da área mais fraca para a mais forte. Abaixo de 50% em laranja.</p>` : '<p class="rx-mudo">Ainda não há questões resolvidas.</p>'}
  </section>
  <section class="rx-cartao rel-bloco"><h2>Evolução nas últimas 8 semanas</h2>
    <div class="rel-semanas">${r.semanas.map((s) => `<div><span class="rel-coluna" style="height:${Math.round((s.questoes / maxSemana) * 100)}%"></span><strong>${milhar(s.questoes)}</strong><small>${s.semana === 0 ? 'esta' : `${s.semana}`} · ${pct(s.acerto)}</small></div>`).join('')}</div>
    <p class="rx-mudo pequeno">Questões respondidas pela turma por semana e o acerto de cada semana.</p>
  </section>
  ${r.nacionais.length ? `<section class="rx-cartao rel-bloco"><h2>Simulado nacional</h2><table class="rx-tabela"><thead><tr><th>Edição</th><th>Participantes da faculdade</th><th>Média da faculdade</th><th>Média nacional</th></tr></thead><tbody>
    ${r.nacionais.map((n) => `<tr><td>${esc(n.nome)}</td><td>${n.participantes}</td><td><strong>${pct(n.mediaFaculdade)}</strong></td><td>${pct(n.mediaGeral)}</td></tr>`).join('')}</tbody></table></section>` : ''}
  <section class="rx-cartao rel-bloco"><h2>Alunos que autorizaram o acompanhamento</h2>
    ${r.individuais.length ? `<table class="rx-tabela"><thead><tr><th>Aluno</th><th>Etapa</th><th>Questões</th><th>Acerto</th><th>Simulados</th><th>Última atividade</th><th>Atenção</th></tr></thead><tbody>
      ${r.individuais.map((a) => `<tr><td>${esc(a.nome)}</td><td>${esc(a.etapa)}</td><td>${milhar(a.resolvidas)}</td><td>${pct(a.acerto)}</td><td>${a.simulados}</td><td>${dataCurta(a.ultimaAtividade)}</td><td>${a.risco.length ? `<span class="rel-risco">${esc(a.risco.join('; '))}</span>` : '<span class="rx-mudo">—</span>'}</td></tr>`).join('')}
    </tbody></table>` : '<p class="rx-mudo">Nenhum aluno autorizou mostrar o desempenho individual. Os números acima são da turma toda, sem identificar ninguém.</p>'}
    <p class="rx-mudo pequeno">Só aparece aqui quem marcou, no cadastro, a autorização para a coordenação ver o próprio desempenho (LGPD). E-mail e telefone nunca são mostrados.</p>
  </section>`;
}

/** Liga o botão "Salvar em PDF" (impressão do navegador). */
export function ligarImpressao(raiz = document) {
  for (const b of raiz.querySelectorAll('[data-imprimir]')) b.addEventListener('click', () => window.print());
}
