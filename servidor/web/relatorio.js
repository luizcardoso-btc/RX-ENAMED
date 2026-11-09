// Página do link da coordenação: /relatorio/<token>.
import { $, esc } from './comum.js';
import { htmlRelatorio, ligarImpressao } from './relatorio-turma.js';

const token = location.pathname.split('/').pop();
try {
  const r = await fetch(`/api/relatorio/${encodeURIComponent(token)}`, { credentials: 'omit' });
  const json = await r.json();
  if (!r.ok) throw new Error(json.erro || 'Não foi possível abrir o relatório.');
  $('#conteudo').innerHTML = `${htmlRelatorio(json.relatorio)}<p class="rx-mudo pequeno">Este link vale até ${new Date(json.expiraEm).toLocaleDateString('pt-BR')}. Dúvidas: fale com a equipe Rx Med.</p>`;
  ligarImpressao();
} catch (e) {
  $('#conteudo').innerHTML = `<section class="rx-cartao" style="max-width:520px"><h1 style="margin-top:0">Relatório indisponível</h1><p>${esc(e.message)}</p></section>`;
}
