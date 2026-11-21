// Aba "Questões" do admin: fila de revisão médica das questões autorais e importadas.
// Só as aprovadas vão para os alunos (o servidor entrega em /api/questoes/extras).
import { $, api, dataHora, esc } from './comum.js';

const ROTULO = { pendente: 'Pendentes', aprovada: 'Aprovadas', corrigir: 'Para corrigir', reprovada: 'Reprovadas' };
const CHAVE = 'rx-revisor';
const lembrar = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; } };
const guardar = (v) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem armazenamento */ } };

export async function questoesRx(conteudo, estado = {}) {
  const status = estado.status || 'pendente';
  const area = estado.area || '';
  const pagina = estado.pagina || 1;
  const r = await api(`/admin/questoes-rx?${new URLSearchParams({ status, pagina, ...(area ? { area } : {}) })}`);
  const rev = lembrar();
  const paginas = Math.max(1, Math.ceil(r.filtradas / r.porPagina));
  conteudo.innerHTML = `
    <h1 style="font-family:var(--f-display)">Revisão de questões <small class="rx-mudo">${r.total}</small></h1>
    <p class="rx-mudo">Questões autorais RX (e importadas) só chegam aos alunos depois de aprovadas por um médico.
      Na aprovação você pode corrigir o gabarito; em "Para corrigir" ou "Reprovar", escreva o motivo.</p>
    <div class="rx-filtros">
      ${Object.entries(ROTULO).map(([k, v]) => `<button class="botao ${k === status ? 'botao-primario' : ''}" data-status="${k}">${v} (${r.contagem[k]})</button>`).join('')}
      <label class="rx-campo"><span>Área</span><select id="area"><option value="">Todas</option>${r.areas.map((a) => `<option ${a === area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <a class="botao" href="/api/admin/questoes-rx.csv">Exportar decisões</a>
    </div>
    <div class="rx-filtros">
      <label class="rx-campo"><span>Médico revisor</span><input id="revisor" value="${esc(rev.revisor || '')}" placeholder="Dr(a). Nome completo"></label>
      <label class="rx-campo" style="max-width:160px"><span>CRM</span><input id="crm" value="${esc(rev.crm || '')}" placeholder="CRM/UF 000000"></label>
    </div>
    ${r.questoes.map((q) => cartao(q)).join('') || `<p class="rx-mudo">Nenhuma questão nesta lista.</p>`}
    ${paginas > 1 ? `<div class="rx-filtros"><button class="botao" id="ant" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button><span class="rx-mudo">Página ${pagina} de ${paginas}</span><button class="botao" id="prox" ${pagina >= paginas ? 'disabled' : ''}>Próxima</button></div>` : ''}`;

  const recarregar = (mud) => questoesRx(conteudo, { status, area, pagina, ...mud });
  for (const b of conteudo.querySelectorAll('[data-status]')) b.addEventListener('click', () => recarregar({ status: b.dataset.status, pagina: 1 }));
  $('#area').addEventListener('change', (e) => recarregar({ area: e.target.value, pagina: 1 }));
  $('#ant')?.addEventListener('click', () => recarregar({ pagina: pagina - 1 }));
  $('#prox')?.addEventListener('click', () => recarregar({ pagina: pagina + 1 }));
  for (const f of conteudo.querySelectorAll('form[data-id]')) {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const acao = e.submitter?.value;
      const revisor = $('#revisor').value.trim();
      const crm = $('#crm').value.trim();
      if (revisor.length < 3) { alert('Preencha o nome do médico revisor no topo da página.'); return; }
      guardar({ revisor, crm });
      const dados = Object.fromEntries(new FormData(f));
      try {
        await api(`/admin/questoes-rx/${encodeURIComponent(f.dataset.id)}`, { metodo: 'POST', corpo: { acao, revisor, crm, gabarito: dados.gabarito, observacao: dados.observacao } });
        f.closest('section').remove();
        // Atualiza os contadores sem recarregar a lista.
        const novo = { aprovar: 'aprovada', corrigir: 'corrigir', reprovar: 'reprovada' }[acao];
        r.contagem[status] -= 1; r.contagem[novo] += 1;
        for (const b of conteudo.querySelectorAll('[data-status]')) b.textContent = `${ROTULO[b.dataset.status]} (${r.contagem[b.dataset.status]})`;
      } catch (err) { alert(err.message); }
    });
  }
}

function cartao(q) {
  const letras = 'ABCDE'.slice(0, q.alternativas.length).split('');
  const rv = q.revisaoRx;
  const gab = rv?.gabarito || q.gabarito;
  return `<section class="rx-cartao" style="margin-bottom:16px">
    <p class="rx-mudo pequeno">${esc(q.id)} · ${esc(q.area)} · ${esc(q.especialidade)}${q.tema ? ` · ${esc(q.tema)}` : ''} · ${esc(q.tipo || '')} · ${esc(q.dificuldade || '')} · origem: ${esc(q.origem)}</p>
    <p style="white-space:pre-line">${esc(q.enunciado)}</p>
    <ol type="A">${q.alternativas.map((a, i) => `<li${letras[i] === q.gabarito ? ' style="font-weight:700;color:var(--certo)"' : ''}>${esc(a)}</li>`).join('')}</ol>
    <details><summary>Comentário</summary><p style="white-space:pre-line">${esc(q.comentario || '—')}</p></details>
    ${rv ? `<p class="rx-mudo pequeno">Última decisão: ${esc(ROTULO[rv.status] || rv.status)} por ${esc(rv.revisor)}${rv.crm ? ` (${esc(rv.crm)})` : ''} em ${dataHora(rv.revisado_em)}${rv.observacao ? ` · ${esc(rv.observacao)}` : ''}</p>` : ''}
    <form class="rx-linha" data-id="${esc(q.id)}">
      <label class="rx-campo" style="max-width:120px"><span>Gabarito</span><select name="gabarito">${letras.map((l) => `<option ${l === gab ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="rx-campo" style="flex:1"><span>Observação</span><input name="observacao" placeholder="obrigatória para corrigir ou reprovar"></label>
      <button class="botao botao-primario" value="aprovar">Aprovar</button>
      <button class="botao" value="corrigir">Para corrigir</button>
      <button class="botao" value="reprovar">Reprovar</button>
    </form>
  </section>`;
}
