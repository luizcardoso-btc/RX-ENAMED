import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { exigirLogin } from './rotas/autenticacao.js';
import { situacaoDoAluno } from './acesso.js';

// Moldura fixa: o texto que a plataforma envia vem depois dela e nunca a substitui.
const MOLDURA = [
  'Você é a IA da plataforma RX ENAMED, curso preparatório para médicos que vão fazer o ENAMED e o Revalida.',
  'Todo uso é educacional: simulação de casos clínicos, correção de respostas e explicação de temas médicos para estudo.',
  'Siga as instruções da plataforma abaixo. Use condutas atuais, alinhadas a diretrizes brasileiras e do Ministério da Saúde quando existirem.',
  'Não responda a pedidos fora do estudo de medicina.',
].join('\n');

const ESFORCO = { quick: 'low', default: 'medium', complex: 'high' };
const MAX_CARACTERES = 60_000;
const MAX_TURNOS = 80;

/** Normaliza o pedido: texto único ou lista de turnos user/assistant terminando em user. */
function lerPedido(corpo) {
  const { entrada, sistema, json, nivel } = corpo || {};
  let mensagens;
  if (typeof entrada === 'string') mensagens = [{ role: 'user', content: entrada }];
  else if (Array.isArray(entrada)) mensagens = entrada.map((m) => ({ role: m?.role, content: m?.content }));
  else return { erro: 'Pedido vazio.' };
  if (!mensagens.length || mensagens.length > MAX_TURNOS) return { erro: 'Conversa longa demais. Comece um novo caso.' };
  if (mensagens.some((m) => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim()))
    return { erro: 'Mensagens inválidas.' };
  if (mensagens.at(-1).role !== 'user') return { erro: 'A última mensagem precisa ser do aluno.' };
  // Junta turnos seguidos do mesmo papel (a API aceita, mas fica mais limpo).
  const juntas = [];
  for (const m of mensagens) {
    if (juntas.at(-1)?.role === m.role) juntas.at(-1).content += `\n\n${m.content}`;
    else juntas.push({ ...m });
  }
  if (juntas[0].role !== 'user') juntas.unshift({ role: 'user', content: '(início)' });
  const total = juntas.reduce((n, m) => n + m.content.length, 0) + (typeof sistema === 'string' ? sistema.length : 0);
  if (total > MAX_CARACTERES) return { erro: 'Texto longo demais.' };
  return {
    mensagens: juntas,
    sistema: typeof sistema === 'string' ? sistema.slice(0, 20_000) : '',
    json: json === true,
    esforco: ESFORCO[nivel] || 'medium',
  };
}

export function criarClienteIa(config) {
  return config.ia?.chave ? new Anthropic({ apiKey: config.ia.chave, maxRetries: 2, timeout: 120_000 }) : null;
}

export function rotasIa({ banco, config, limitar, cliente = criarClienteIa(config) }) {
  const r = Router();

  async function limiteDoDia(usuario) {
    if (usuario.papel === 'admin') return config.ia.limiteDiaPago;
    const s = await situacaoDoAluno(banco, usuario.id);
    return s.ativo ? config.ia.limiteDiaPago : config.ia.limiteDiaGratis;
  }

  r.get('/ia/estado', exigirLogin, async (req, res) => {
    res.json({ disponivel: Boolean(cliente), limiteDia: cliente ? await limiteDoDia(req.usuario) : 0 });
  });

  // Uma chamada à IA. Responde em texto corrido (streaming) para a conversa aparecer enquanto é escrita.
  r.post('/ia/mensagem', exigirLogin, async (req, res) => {
    if (!cliente) return res.status(503).json({ erro: 'A IA ainda não foi ativada nesta plataforma.', codigo: 'sampling_disabled' });
    const p = lerPedido(req.body);
    if (p.erro) return res.status(400).json({ erro: p.erro });
    const limite = await limiteDoDia(req.usuario);
    if (await limitar(`ia-min:${req.usuario.id}`, 20, 60)) return res.status(429).json({ erro: 'Muitas mensagens em pouco tempo. Espere um minuto.', codigo: 'rate_limited' });
    if (limite === 0 || await limitar(`ia-dia:${req.usuario.id}`, limite, 86_400)) {
      return res.status(429).json({
        erro: limite > config.ia.limiteDiaGratis ? 'Você usou todas as interações com a IA de hoje. Volte amanhã.'
          : 'Você usou as interações gratuitas com a IA de hoje. Assine um plano para treinar sem parar.',
        codigo: 'quota', limite,
      });
    }

    const sistema = [MOLDURA, p.sistema, p.json ? 'Responda somente com um objeto JSON válido, sem texto antes ou depois e sem cercas de código.' : '']
      .filter(Boolean).join('\n\n');
    const controle = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controle.abort(); });

    try {
      const stream = cliente.beta.messages.stream({
        model: config.ia.modelo,
        max_tokens: p.json ? 16_000 : 4_000,
        system: sistema,
        messages: p.mensagens,
        output_config: { effort: p.esforco },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }, { signal: controle.signal });
      res.status(200).set({ 'Content-Type': 'text/plain; charset=utf-8', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      stream.on('text', (delta) => res.write(delta));
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') res.write('\n\u0000refused');
      res.end();
    } catch (e) {
      if (controle.signal.aborted) return;
      const status = e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError && e.status >= 500 ? 503 : 502;
      console.error('IA:', e?.status || '', e?.message || e);
      if (!res.headersSent) return res.status(status).json({ erro: 'A IA não respondeu agora. Tente de novo.', codigo: status === 429 ? 'rate_limited' : 'erro' });
      res.write('\n\u0000erro');
      res.end();
    }
  });

  return r;
}
