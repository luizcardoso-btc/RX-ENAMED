import { $, api, reais, esc, mostrarErro, idioma } from './comum.js';

const T = {
  pt: { acesso: (m) => (m === 1 ? 'Acesso por 1 mês' : `Acesso por ${m} meses`), parcelas: (n, v) => `ou ${n}× de ${v} sem juros`, logado: (n, e) => `Comprando como <strong>${n}</strong> (${e}). <a href="#" id="trocar">Trocar de conta</a>`,
    aguardandoPix: 'Escaneie o QR code ou copie o código no app do seu banco. A liberação é automática assim que o pagamento cai.', copiar: 'Copiar', copiado: 'Copiado!', expira: 'O código vale por 30 minutos.',
    boleto: 'Boleto gerado. A compensação leva até 3 dias úteis; o acesso libera sozinho quando o banco confirmar.', abrirBoleto: 'Abrir boleto', codigo: 'Linha digitável',
    sucesso: 'Pagamento aprovado! Seu acesso já está liberado.', irPlataforma: 'Ir para a área do aluno', processando: 'Processando…', planoInvalido: 'Plano não encontrado.',
    cpf: 'Informe um CPF válido.', semChave: 'O pagamento com cartão ainda não está configurado. Use PIX ou boleto.', analise: 'Pagamento em análise. Avisaremos por e-mail e o acesso libera sozinho quando for aprovado.' },
  es: { acesso: (m) => (m === 1 ? 'Acceso por 1 mes' : `Acceso por ${m} meses`), parcelas: (n, v) => `o ${n}× de ${v} sin intereses`, logado: (n, e) => `Comprando como <strong>${n}</strong> (${e}). <a href="#" id="trocar">Cambiar de cuenta</a>`,
    aguardandoPix: 'Escanee el código QR o copie el código en la app de su banco. El acceso se libera solo cuando se acredita el pago.', copiar: 'Copiar', copiado: '¡Copiado!', expira: 'El código vale por 30 minutos.',
    boleto: 'Boleto generado. La acreditación tarda hasta 3 días hábiles; el acceso se libera solo.', abrirBoleto: 'Abrir boleto', codigo: 'Línea digitable',
    sucesso: '¡Pago aprobado! Su acceso ya está liberado.', irPlataforma: 'Ir al área del alumno', processando: 'Procesando…', planoInvalido: 'Plan no encontrado.',
    cpf: 'Informe un CPF válido.', semChave: 'El pago con tarjeta aún no está configurado. Use PIX o boleto.', analise: 'Pago en análisis. El acceso se libera solo cuando se apruebe.' },
}[idioma];
const TEXTOS_ES = { conta: 'Su cuenta', criarConta: 'Crear cuenta', jaTenho: 'Ya tengo cuenta', nome: 'Nombre completo', senha: 'Contraseña (mínimo 10 caracteres, con letras y número o símbolo)', continuar: 'Continuar',
  pagamento: 'Pago', temCupom: '¿Tiene un cupón de descuento?', cupom: 'Cupón', aplicar: 'Aplicar', pixSub: 'aprobación inmediata', cartao: 'Tarjeta', boletoSub: 'hasta 3 días hábiles', gerarPix: 'Generar PIX', gerarBoleto: 'Generar boleto',
  rodape: 'Pagos procesados por Mercado Pago. Los datos de la tarjeta van directo a Mercado Pago, cifrados; RX ENAMED no los almacena. Tiene 7 días para desistir y recibir el dinero de vuelta.' };
if (idioma === 'es') { document.documentElement.lang = 'es'; for (const el of document.querySelectorAll('[data-t]')) if (TEXTOS_ES[el.dataset.t]) el.textContent = TEXTOS_ES[el.dataset.t]; }

const plataforma = `/plataforma/index.html${idioma === 'es' ? '?lang=es' : ''}`;
let config; let plano; let usuario; let metodo = 'pix'; let brickCartao = null; let consulta = null;
let cupomAplicado = null; // { cupom, valorCentavos, descontoCentavos }

// Link de afiliado (?ref=CODIGO): guardado por 30 dias neste navegador e enviado com o pedido.
const params = new URLSearchParams(location.search);
try {
  if (params.get('ref')) localStorage.setItem('rx-ref', JSON.stringify({ codigo: params.get('ref').slice(0, 40), ate: Date.now() + 30 * 86400000 }));
} catch { /* navegador sem armazenamento */ }
const refGuardado = () => { try { const r = JSON.parse(localStorage.getItem('rx-ref')); return r && r.ate > Date.now() ? r.codigo : null; } catch { return null; } };
const valorAtual = () => cupomAplicado?.valorCentavos ?? plano.valorCentavos;

const formatarCpf = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
$('#cpf').addEventListener('input', (e) => { e.target.value = formatarCpf(e.target.value); });

function desenharResumo() {
  const valor = valorAtual();
  const parcela = plano.parcelasMax > 1 ? T.parcelas(plano.parcelasMax, reais(Math.round(valor / plano.parcelasMax))) : '';
  const nome = idioma === 'es' ? plano.nomeEs : plano.nome;
  const itens = idioma === 'es' ? plano.itensEs : plano.itens;
  $('#resumo').innerHTML = `
    <span class="sobretitulo">RX ENAMED</span>
    <h1>${esc(nome)}</h1>
    <p class="rx-mudo">${esc(idioma === 'es' ? plano.paraEs : plano.para)}</p>
    ${cupomAplicado ? `<p class="rx-mudo" style="margin:12px 0 0"><s>${reais(plano.valorCentavos)}</s> · ${esc(cupomAplicado.cupom)} −${reais(cupomAplicado.descontoCentavos)}</p>` : ''}
    <p class="rx-preco">${reais(valor)}</p>
    <p class="rx-mudo">${esc(parcela)}</p>
    <ul>${itens.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    <div class="rx-selos"><span>${esc(T.acesso(plano.duracaoMeses))}</span><span>PIX, ${idioma === 'es' ? 'tarjeta' : 'cartão'} ${idioma === 'es' ? 'o' : 'ou'} boleto</span><span>${idioma === 'es' ? '7 días de garantía' : '7 dias de garantia'}</span></div>`;
  $('#sub-cartao').textContent = idioma === 'es' ? `hasta ${plano.parcelasMax}×` : `até ${plano.parcelasMax}×`;
}

function mostrarPasso(id) {
  for (const p of ['passo-conta', 'passo-pagamento', 'passo-aguardando', 'passo-sucesso']) $(`#${p}`).classList.toggle('rx-oculto', p !== id && !(id === 'passo-pagamento' && p === 'passo-conta'));
}

function contaLogada() {
  $('#conta-form').classList.add('rx-oculto');
  const el = $('#conta-logada');
  el.classList.remove('rx-oculto');
  el.innerHTML = `<p>${T.logado(esc(usuario.nome), esc(usuario.email))}</p>`;
  $('#trocar').addEventListener('click', async (e) => { e.preventDefault(); await api('/sair', { metodo: 'POST', corpo: {} }); location.reload(); });
  mostrarPasso('passo-pagamento');
  escolherMetodo(metodo);
}

// Passo 1: criar conta ou entrar.
let modoConta = 'cadastro';
for (const b of document.querySelectorAll('[data-modo]')) {
  b.addEventListener('click', () => {
    modoConta = b.dataset.modo;
    for (const x of document.querySelectorAll('[data-modo]')) x.setAttribute('aria-pressed', String(x === b));
    $('#campo-nome').classList.toggle('rx-oculto', modoConta === 'entrar');
    $('#campo-aceite').classList.toggle('rx-oculto', modoConta === 'entrar');
    $('#form-conta [name=senha]').autocomplete = modoConta === 'entrar' ? 'current-password' : 'new-password';
  });
}
$('#form-conta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  mostrarErro($('#erro-conta'), '');
  try {
    await api(modoConta === 'cadastro' ? '/cadastro' : '/entrar', { metodo: 'POST', corpo: { ...Object.fromEntries(f), aceite: f.get('aceite') === 'on' } });
    usuario = (await api('/eu')).usuario;
    contaLogada();
  } catch (err) { mostrarErro($('#erro-conta'), err.message); }
});

// Passo 2: forma de pagamento.
for (const b of document.querySelectorAll('[data-metodo]')) b.addEventListener('click', () => escolherMetodo(b.dataset.metodo));
function escolherMetodo(m) {
  metodo = m;
  for (const x of document.querySelectorAll('[data-metodo]')) x.setAttribute('aria-pressed', String(x.dataset.metodo === m));
  for (const id of ['pix', 'cartao', 'boleto']) $(`#metodo-${id}`).classList.toggle('rx-oculto', id !== m);
  $('#campo-cpf').classList.toggle('rx-oculto', m === 'cartao'); // no cartão, o CPF vai no formulário do Mercado Pago
  mostrarErro($('#erro-pagamento'), '');
  if (m === 'cartao') montarCartao();
}

const cpfDigitado = () => $('#cpf').value.replace(/\D/g, '');
async function pagar(corpo) {
  mostrarErro($('#erro-pagamento'), '');
  try {
    const r = await api('/checkout/pagar', { metodo: 'POST', corpo: { plano: plano.id, cupom: cupomAplicado?.cupom || undefined, ref: refGuardado() || undefined, ...corpo } });
    tratarPedido(r.pedido);
  } catch (err) {
    mostrarErro($('#erro-pagamento'), err.message);
    throw err;
  }
}

async function gerar(botao, m) {
  if (cpfDigitado().length !== 11) return mostrarErro($('#erro-pagamento'), T.cpf);
  const texto = botao.textContent;
  botao.disabled = true;
  botao.textContent = T.processando;
  try { await pagar({ metodo: m, cpf: cpfDigitado() }); } catch { /* mensagem já exibida */ } finally { botao.disabled = false; botao.textContent = texto; }
}
$('#gerar-pix').addEventListener('click', (e) => gerar(e.target, 'pix'));
$('#gerar-boleto').addEventListener('click', (e) => gerar(e.target, 'boleto'));

// Cupom: o servidor confere e devolve o preço. Mudou o valor, o formulário do cartão é refeito.
async function aplicarCupom(codigo) {
  const st = $('#cupom-status');
  try {
    const r = await api('/checkout/cupom', { metodo: 'POST', corpo: { plano: plano.id, cupom: codigo } });
    cupomAplicado = { cupom: r.cupom, valorCentavos: r.valorCentavos, descontoCentavos: r.descontoCentavos };
    st.textContent = `✓ ${r.cupom}: −${reais(r.descontoCentavos)}`;
  } catch (err) {
    cupomAplicado = null;
    st.textContent = err.message;
  }
  desenharResumo();
  if (brickCartao) { await brickCartao.unmount(); brickCartao = null; if (metodo === 'cartao') montarCartao(); }
}
$('#aplicar-cupom').addEventListener('click', () => { const c = $('#cupom').value.trim(); if (c) aplicarCupom(c); });

// Cartão: formulário seguro do Mercado Pago (Card Payment Brick) com o visual do RX.
async function montarCartao() {
  if (brickCartao) return;
  if (!config.chavePublica || !window.MercadoPago) return mostrarErro($('#erro-pagamento'), T.semChave);
  const mp = new window.MercadoPago(config.chavePublica, { locale: idioma === 'es' ? 'es-AR' : 'pt-BR' });
  brickCartao = await mp.bricks().create('cardPayment', 'cartao-brick', {
    initialization: { amount: valorAtual() / 100, payer: { email: usuario.email } },
    customization: {
      paymentMethods: { maxInstallments: plano.parcelasMax, types: { excluded: ['debit_card'] } },
      visual: {
        hidePaymentButton: false,
        style: { theme: 'dark', customVariables: {
          baseColor: '#2563eb', textPrimaryColor: '#e9eef8', textSecondaryColor: '#a8b4c9', inputBackgroundColor: '#121a28',
          formBackgroundColor: '#0b111b', borderRadiusMedium: '10px', borderRadiusLarge: '14px', fontSizeMedium: '15px',
        } },
        texts: { formSubmit: idioma === 'es' ? 'Pagar' : 'Pagar agora' },
      },
    },
    callbacks: {
      onReady: () => {},
      onError: (e) => console.error('Mercado Pago', e),
      onSubmit: (d) => pagar({
        metodo: 'cartao', cpf: d.payer?.identification?.number || cpfDigitado(),
        cartao: { token: d.token, metodoPagamento: d.payment_method_id, emissor: d.issuer_id, parcelas: d.installments },
      }),
    },
  });
}

function tratarPedido(p) {
  if (p.status === 'aprovado') return sucesso();
  if (p.status === 'recusado') return;
  const el = $('#passo-aguardando');
  if (p.metodo === 'pix' && p.pagamento.pixCopiaECola) {
    el.innerHTML = `<div class="rx-pix">
      <p>${T.aguardandoPix}</p>
      ${p.pagamento.pixQrBase64 ? `<img alt="QR code PIX" src="data:image/png;base64,${esc(p.pagamento.pixQrBase64)}">` : ''}
      <div class="rx-copia rx-campo"><input readonly value="${esc(p.pagamento.pixCopiaECola)}" aria-label="PIX copia e cola"><button class="botao" id="copiar">${T.copiar}</button></div>
      <p class="rx-mudo">${T.expira} <span class="ponto-vivo"></span></p></div>`;
    $('#copiar').addEventListener('click', async (e) => { await navigator.clipboard.writeText(p.pagamento.pixCopiaECola); e.target.textContent = T.copiado; });
  } else if (p.metodo === 'boleto') {
    el.innerHTML = `<p>${T.boleto}</p>
      <label class="rx-campo"><span>${T.codigo}</span><input readonly value="${esc(p.pagamento.boletoCodigo || '')}"></label>
      <a class="botao botao-primario rx-botao-largo" href="${esc(p.pagamento.boletoUrl)}" target="_blank" rel="noopener">${T.abrirBoleto}</a>`;
  } else {
    el.innerHTML = `<p>${T.analise}</p>`;
  }
  $('#passo-pagamento').classList.add('rx-oculto');
  el.classList.remove('rx-oculto');
  clearInterval(consulta);
  consulta = setInterval(async () => {
    const r = await api(`/pedidos/${p.id}`).catch(() => null);
    if (r?.pedido.status === 'aprovado') sucesso();
  }, 4000);
}

function sucesso() {
  clearInterval(consulta);
  $('#passo-pagamento').classList.add('rx-oculto');
  $('#passo-aguardando').classList.add('rx-oculto');
  const el = $('#passo-sucesso');
  el.innerHTML = `<div class="rx-ok"><h2 style="margin-top:0">✓ ${T.sucesso}</h2><a class="botao botao-primario" href="${plataforma}">${T.irPlataforma} →</a></div>`;
  el.classList.remove('rx-oculto');
}

(async () => {
  config = await api('/checkout/config');
  const id = new URLSearchParams(location.search).get('plano') || 'ciclo';
  plano = config.planos.find((p) => p.id === id);
  if (!plano) { $('#resumo').innerHTML = `<p>${T.planoInvalido} <a href="/planos.html">Ver planos</a></p>`; $('#fluxo').classList.add('rx-oculto'); return; }
  desenharResumo();
  if (!config.pagamentosAtivos) {
    $('#fluxo').innerHTML = `<p>${idioma === 'es' ? 'Los pagos se habilitarán en breve. Cree su cuenta gratuita mientras tanto.' : 'Os pagamentos serão liberados em breve. Enquanto isso, crie sua conta grátis e comece a estudar.'}</p><a class="botao botao-primario" href="/entrar">${idioma === 'es' ? 'Crear cuenta gratis' : 'Criar conta grátis'}</a>`;
    return;
  }
  if (params.get('cupom')) { $('#cupom').value = params.get('cupom'); $('#cupom-box').open = true; await aplicarCupom(params.get('cupom')); }
  usuario = (await api('/eu')).usuario;
  if (usuario) contaLogada();
})();
