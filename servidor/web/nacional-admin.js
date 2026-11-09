// Aba "Simulado nacional" do admin: criar edições, acompanhar participantes e ver o ranking por faculdade.
import { $, api, dataHora, esc } from './comum.js';

const EXAME = { enamed: 'ENAMED', revalida: 'Revalida' };
const pct = (x) => (x === null || x === undefined ? '—' : `${Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const situacao = (s) => (Date.now() < new Date(s.inicio) ? 'Em breve' : Date.now() > new Date(s.fim) ? 'Encerrado' : 'Aberto');
const local = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

export async function nacionalAdmin(conteudo, abrirGaveta, fecharGaveta) {
  const { simulados } = await api('/admin/nacional');
  const recarregar = () => nacionalAdmin(conteudo, abrirGaveta, fecharGaveta);
  const sabado = new Date(); sabado.setDate(sabado.getDate() + ((6 - sabado.getDay() + 7) % 7 || 7)); sabado.setHours(8, 0, 0, 0);
  const domingo = new Date(sabado); domingo.setDate(domingo.getDate() + 1); domingo.setHours(23, 59, 0, 0);
  conteudo.innerHTML = `
    <div class="fac-cabecalho"><div><h1 style="font-family:var(--f-display);margin-bottom:4px">Simulado nacional</h1>
      <p class="rx-mudo pequeno">Gratuito para quem tem conta. O servidor corrige pelo gabarito oficial e monta o ranking geral e por faculdade (faculdades com 3+ participantes aparecem no ranking público).</p></div></div>
    <section class="rx-cartao" style="margin-bottom:18px"><h2 style="margin-top:0">Nova edição</h2>
      <form id="nac-form" class="fac-form">
        <label class="rx-campo fac-largo"><span>Nome</span><input name="nome" required minlength="3" value="Simulado Nacional ENAMED ${new Date().getFullYear()} · 1ª edição"></label>
        <label class="rx-campo"><span>Exame</span><select name="exame"><option value="enamed">ENAMED (banco ENAMED e Revalida)</option><option value="revalida">Revalida 1ª etapa</option></select></label>
        <label class="rx-campo"><span>Questões</span><input name="quantidade" type="number" min="10" max="120" value="100"></label>
        <label class="rx-campo"><span>Abre em</span><input name="inicio" type="datetime-local" value="${local(sabado)}"></label>
        <label class="rx-campo"><span>Fecha em</span><input name="fim" type="datetime-local" value="${local(domingo)}"></label>
        <label class="rx-campo"><span>Tempo de prova (minutos)</span><input name="duracaoMin" type="number" min="10" max="600" value="300"></label>
        <p class="rx-mudo pequeno fac-largo">O caderno sai sorteado do banco oficial, com o mesmo peso de cada grande área que as provas do Inep. Dentro da janela, cada aluno faz uma vez, no tempo definido.</p>
        <p class="rx-erro rx-oculto fac-largo" id="nac-erro"></p>
        <button class="botao botao-primario fac-largo">Criar edição</button>
      </form></section>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Edição</th><th>Janela</th><th>Situação</th><th>Questões</th><th>Iniciaram</th><th>Entregaram</th><th>Média</th><th></th></tr></thead>
      <tbody>${simulados.map((s) => `<tr class="clicavel" data-id="${s.id}"><td><strong>${esc(s.nome)}</strong><br><span class="rx-mudo pequeno">${EXAME[s.exame]} · ${s.duracao_min} min${s.publicado ? '' : ' · oculto'}</span></td>
        <td>${dataHora(s.inicio)}<br>${dataHora(s.fim)}</td><td>${situacao(s)}</td><td>${s.questoes}</td><td>${s.iniciados}</td><td>${s.entregues}</td><td>${pct(s.media)}</td><td><span class="rx-mudo">Ver</span></td></tr>`).join('')
        || '<tr><td colspan="8" class="rx-mudo">Nenhuma edição criada.</td></tr>'}</tbody></table></div>`;
  $('#nac-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    try {
      await api('/admin/nacional', { metodo: 'POST', corpo: { ...f, quantidade: Number(f.quantidade), duracaoMin: Number(f.duracaoMin), inicio: new Date(f.inicio).toISOString(), fim: new Date(f.fim).toISOString() } });
      recarregar();
    } catch (err) { const el = $('#nac-erro'); el.textContent = err.message; el.classList.remove('rx-oculto'); }
  });
  for (const tr of conteudo.querySelectorAll('tr[data-id]')) tr.addEventListener('click', () => detalhe(tr.dataset.id, abrirGaveta, fecharGaveta, recarregar));
}

async function detalhe(id, abrirGaveta, fecharGaveta, recarregar) {
  const { simulado: s, ranking, porFaculdade } = await api(`/admin/nacional/${id}`);
  abrirGaveta(`<aside class="rx-gaveta" role="dialog" aria-label="Simulado nacional">
    <button class="botao" id="fechar" style="float:right">Fechar</button>
    <p class="rx-mudo pequeno" style="margin:0">${EXAME[s.exame]} · ${s.questoes} questões · ${s.duracao_min} min · ${situacao(s)}</p>
    <h2>${esc(s.nome)}</h2>
    <div class="rx-kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="rx-kpi"><span>Participantes no tempo</span><strong>${ranking.participantes}</strong></div>
      <div class="rx-kpi"><span>Média nacional</span><strong>${pct(ranking.media)}</strong></div>
      <div class="rx-kpi"><span>Faculdades</span><strong>${porFaculdade.filter((f) => f.faculdade).length}</strong></div></div>
    <p><a class="botao" href="/api/admin/nacional/${s.id}?formato=csv">Baixar planilha de participantes</a>
      <button class="botao" id="nac-visibilidade">${s.publicado ? 'Ocultar dos alunos' : 'Mostrar aos alunos'}</button></p>
    <h3>Ranking por faculdade</h3>
    <table class="rx-tabela"><thead><tr><th>Faculdade</th><th>Participantes</th><th>Média</th><th>Melhor</th></tr></thead><tbody>
      ${porFaculdade.map((f) => `<tr><td>${esc(f.nome)}</td><td>${f.participantes}</td><td>${pct(f.media)}</td><td>${pct(f.melhor)}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">Nenhuma entrega ainda.</td></tr>'}</tbody></table>
    <h3>Top 20</h3>
    <table class="rx-tabela"><thead><tr><th>#</th><th>Aluno</th><th>Faculdade</th><th>Nota</th></tr></thead><tbody>
      ${ranking.top.map((x) => `<tr><td>${x.posicao}</td><td>${esc(x.nome)}</td><td>${esc(x.faculdade)}</td><td>${pct(x.nota)}</td></tr>`).join('') || '<tr><td colspan="4" class="rx-mudo">—</td></tr>'}</tbody></table>
  </aside>`);
  $('#fechar').addEventListener('click', fecharGaveta);
  $('#nac-visibilidade').addEventListener('click', async () => { await api(`/admin/nacional/${s.id}`, { metodo: 'PUT', corpo: { publicado: !s.publicado } }); fecharGaveta(); recarregar(); });
}
