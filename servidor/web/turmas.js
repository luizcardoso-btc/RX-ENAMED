// Aba "Turmas" do admin: relatório de cada faculdade e link de leitura para a coordenação.
import { $, api, data, esc } from './comum.js';
import { htmlRelatorio, ligarImpressao } from './relatorio-turma.js';

export async function turmas(conteudo) {
  const { turmas: lista } = await api('/admin/turmas');
  conteudo.innerHTML = `
    <div class="fac-cabecalho"><div><h1 style="font-family:var(--f-display);margin-bottom:4px">Turmas</h1>
      <p class="rx-mudo pequeno">Faculdades com alunos cadastrados. Abra o relatório para mostrar à coordenação ou gere um link de leitura (sem login) para a escola parceira.</p></div></div>
    <div class="rx-cartao rx-rolagem"><table class="rx-tabela"><thead><tr><th>Faculdade</th><th>Alunos</th><th>Até o 4º ano</th><th>Internato</th><th>Autorizaram</th><th>Links ativos</th></tr></thead>
      <tbody>${lista.map((t) => `<tr class="clicavel" data-fac="${esc(t.faculdade)}"><td><strong>${esc(t.nome)}</strong></td><td>${t.alunos}</td><td>${t.ate_quarto}</td><td>${t.internato}</td><td>${t.autorizaram}</td><td>${t.links}</td></tr>`).join('')
        || '<tr><td colspan="6" class="rx-mudo">Nenhum aluno informou a faculdade ainda. O cadastro e o simulado nacional pedem essa informação.</td></tr>'}</tbody></table></div>
    <div id="turma"></div>`;
  for (const tr of conteudo.querySelectorAll('tr[data-fac]')) tr.addEventListener('click', () => abrir(tr.dataset.fac));
}

async function abrir(faculdade) {
  const alvo = $('#turma');
  alvo.innerHTML = '<p class="rx-mudo">Montando o relatório…</p>';
  const { relatorio, links } = await api(`/admin/turmas/${encodeURIComponent(faculdade)}`);
  alvo.innerHTML = `<div style="margin-top:24px">${htmlRelatorio(relatorio)}</div>
    <section class="rx-cartao rx-nao-imprimir"><h2 style="margin-top:0">Link para a coordenação</h2>
      <p class="rx-mudo pequeno">A coordenação abre o relatório sem login. O link mostra os números da turma e, por nome, só quem autorizou. Revogue quando a parceria acabar.</p>
      <div class="rx-linha" style="align-items:end"><label class="rx-campo" style="max-width:160px"><span>Validade (dias)</span><input id="link-dias" type="number" min="1" max="365" value="90"></label><button class="botao botao-primario" id="link-novo">Gerar link</button></div>
      <p id="link-gerado" class="rx-oculto"></p>
      <ul class="fac-historico">${links.map((l) => `<li>Criado em ${data(l.criado_em)} · vale até ${data(l.expira_em)} · ${l.revogado_em ? `revogado em ${data(l.revogado_em)}` : new Date(l.expira_em) < new Date() ? 'expirado' : `<button class="botao botao-pequeno" data-revogar="${l.id}">Revogar</button>`}</li>`).join('') || '<li class="rx-mudo">Nenhum link gerado.</li>'}</ul>
    </section>`;
  ligarImpressao(alvo);
  alvo.scrollIntoView({ behavior: 'smooth' });
  $('#link-novo').addEventListener('click', async () => {
    const r = await api(`/admin/turmas/${encodeURIComponent(faculdade)}/link`, { metodo: 'POST', corpo: { dias: Number($('#link-dias').value) } });
    const el = $('#link-gerado');
    el.innerHTML = `Copie e envie à coordenação (aparece só agora): <br><input class="rx-copia" readonly value="${esc(r.link)}" style="width:100%">`;
    el.classList.remove('rx-oculto');
    el.querySelector('input').select();
  });
  for (const b of alvo.querySelectorAll('[data-revogar]')) b.addEventListener('click', async () => {
    if (!confirm('Revogar este link? A coordenação perde o acesso na hora.')) return;
    await api(`/admin/turmas/links/${b.dataset.revogar}/revogar`, { metodo: 'POST', corpo: {} });
    abrir(faculdade);
  });
}
