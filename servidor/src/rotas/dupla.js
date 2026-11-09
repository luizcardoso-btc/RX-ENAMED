import { temRecurso } from '../acesso.js';
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { exigirLogin } from './autenticacao.js';
import { partePublica, parteCandidato, parteAtor, parteCorrecao, impressoPorChave, corrigir, NIVEIS } from '../../../compartilhado/estacoes.js';

// Treino em dupla: um faz o MÉDICO (candidato) e o outro o ATOR (paciente simulado e examinador).
// O médico nunca recebe o roteiro, os impressos não liberados nem o PEP enquanto a estação não termina.
// A conversa acontece numa chamada de vídeo externa (Google Meet); aqui ficam cronômetro, impressos, checklist e nota.

const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';
const novoCodigo = () => Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join('');
const limparCodigo = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
const PAPEIS = ['medico', 'ator'];

export function meetValido(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'https:' || u.hostname !== 'meet.google.com') return null;
    if (!/^\/[a-z]{3,4}-[a-z]{3,4}-[a-z]{3,4}$|^\/lookup\/[\w-]+$|^\/new$/.test(u.pathname)) return null;
    return `https://meet.google.com${u.pathname}`;
  } catch {
    return null;
  }
}

export function rotasDupla({ banco, limitar, acervo }) {
  const r = Router();

  async function salaDo(req, res) {
    const codigo = limparCodigo(req.params.codigo);
    const s = await banco.um('SELECT * FROM pratica_salas WHERE codigo = $1 AND expira_em > now()', [codigo]);
    if (!s) { res.status(404).json({ erro: 'Sala não encontrada ou expirada. Crie uma nova.' }); return null; }
    return s;
  }
  const papelDe = (s, usuario) => (s.medico_id === usuario.id ? 'medico' : s.ator_id === usuario.id ? 'ator' : null);

  async function nomes(s) {
    const ids = [s.medico_id, s.ator_id].filter(Boolean);
    if (!ids.length) return {};
    const linhas = await banco.varios('SELECT id, nome FROM usuarios WHERE id = ANY($1::uuid[])', [ids]);
    const primeiro = (id) => (linhas.find((l) => l.id === id)?.nome || '').split(' ')[0] || null;
    return { medico: s.medico_id ? primeiro(s.medico_id) : null, ator: s.ator_id ? primeiro(s.ator_id) : null };
  }

  /** O que cada papel pode ver da sala. */
  async function visao(s, usuario, desde = 0) {
    const papel = papelDe(s, usuario);
    const e = s.estacao_id ? acervo.porId.get(s.estacao_id) : null;
    const encerrada = s.estado === 'encerrada';
    const eventos = await banco.varios(`SELECT id, tipo, dados, criado_em, autor_id FROM pratica_sala_eventos
      WHERE codigo = $1 AND id > $2 ORDER BY id LIMIT 200`, [s.codigo, Number(desde) || 0]);
    const base = {
      codigo: s.codigo, estado: s.estado, papel, modoProva: s.modo_prova, meetUrl: s.meet_url || '', minutos: s.minutos,
      iniciadaEm: s.iniciada_em, encerradaEm: s.encerrada_em, agora: new Date().toISOString(),
      participantes: await nomes(s), criador: s.criador_id === usuario.id,
      estacao: e ? (papel === 'ator' || encerrada || !s.modo_prova ? parteCandidato(e) : s.estado === 'aguardando' ? partePublica(e) : parteCandidato(e)) : null,
      liberados: e ? s.liberados.map((k) => impressoPorChave(e, k)).filter(Boolean) : [],
      eventos: eventos.map((x) => ({ id: Number(x.id), tipo: x.tipo, dados: x.dados, criadoEm: x.criado_em, meu: x.autor_id === usuario.id })),
    };
    // Médico em modo prova: antes de iniciar, só vê área e título; o impresso da porta chega ao iniciar.
    if (papel === 'medico' && s.modo_prova && s.estado === 'aguardando' && e) base.estacao = { ...partePublica(e), titulo: 'Estação sorteada', tema: '' };
    // Na dupla, o médico não recebe a lista de tópicos do roteiro nem os nomes dos impressos: precisa perguntar e pedir.
    if (papel === 'medico' && base.estacao) base.estacao = { ...base.estacao, topicos: undefined, pedidos: undefined, abertura: undefined };
    if (papel === 'ator' && e) base.reservado = parteAtor(e);
    if (papel === 'ator' || encerrada) base.avaliacao = s.avaliacao;
    if (encerrada && e) {
      base.resultado = s.resultado;
      if (papel === 'medico' || papel === 'ator') base.correcao = parteCorrecao(e);
    }
    // Sem modo prova (estudo), o médico também vê o PEP desde o início.
    if (!s.modo_prova && papel === 'medico' && e) base.pep = e.pep;
    return base;
  }

  async function evento(codigo, autorId, tipo, dados = {}) {
    await banco.consulta('INSERT INTO pratica_sala_eventos (codigo, autor_id, tipo, dados) VALUES ($1, $2, $3, $4)', [codigo, autorId, tipo, JSON.stringify(dados)]);
    await banco.consulta('UPDATE pratica_salas SET atualizada_em = now() WHERE codigo = $1', [codigo]);
  }

  function estacaoValida(id) {
    if (id === 'aleatoria') {
      const lista = acervo.publicadas;
      return lista[randomInt(lista.length)] || null;
    }
    const e = acervo.porId.get(String(id || ''));
    return e && e.status === 'publicada' ? e : null;
  }

  r.post('/dupla/salas', exigirLogin, async (req, res) => {
    // Quem cria a sala precisa do treino em dupla no plano; o colega convidado entra pelo código, mesmo no gratuito.
    if (!(await temRecurso(banco, req.usuario, 'dupla'))) return res.status(403).json({ erro: 'O treino em dupla faz parte dos planos Ciclo de prova, 2ª etapa e Anual.', codigo: 'plano', recurso: 'dupla' });
    const papel = PAPEIS.includes(req.body?.papel) ? req.body.papel : 'medico';
    const meet = meetValido(req.body?.meetUrl);
    if (meet === null) return res.status(400).json({ erro: 'Cole um link do Google Meet (https://meet.google.com/abc-defg-hij).' });
    let estacao = null;
    if (req.body?.estacaoId) {
      estacao = estacaoValida(req.body.estacaoId);
      if (!estacao) return res.status(400).json({ erro: 'Estação inválida.' });
    }
    if (await limitar(`dupla-criar:${req.usuario.id}`, 20, 3600)) return res.status(429).json({ erro: 'Muitas salas em pouco tempo.' });
    await banco.consulta("DELETE FROM pratica_salas WHERE expira_em < now() - interval '1 day'");
    const minutos = Math.min(20, Math.max(5, Number(req.body?.minutos) || 10));
    for (let i = 0; i < 5; i += 1) {
      const codigo = novoCodigo();
      const ok = await banco.um(`INSERT INTO pratica_salas (codigo, criador_id, medico_id, ator_id, estacao_id, modo_prova, meet_url, minutos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (codigo) DO NOTHING RETURNING codigo`,
      [codigo, req.usuario.id, papel === 'medico' ? req.usuario.id : null, papel === 'ator' ? req.usuario.id : null,
        estacao?.id || null, req.body?.modoProva !== false, meet || null, minutos]);
      if (ok) {
        await evento(codigo, req.usuario.id, 'sala_criada', { papel });
        const s = await banco.um('SELECT * FROM pratica_salas WHERE codigo = $1', [codigo]);
        return res.status(201).json(await visao(s, req.usuario));
      }
    }
    res.status(503).json({ erro: 'Não foi possível criar a sala agora. Tente de novo.' });
  });

  r.post('/dupla/salas/:codigo/entrar', exigirLogin, async (req, res) => {
    const s = await salaDo(req, res);
    if (!s) return;
    if (await limitar(`dupla-entrar:${req.usuario.id}`, 40, 600)) return res.status(429).json({ erro: 'Muitas tentativas. Espere um pouco.' });
    if (papelDe(s, req.usuario)) return res.json(await visao(s, req.usuario));
    const livre = !s.medico_id ? 'medico' : !s.ator_id ? 'ator' : null;
    if (!livre) return res.status(409).json({ erro: 'A sala já tem médico e ator.' });
    const campo = livre === 'medico' ? 'medico_id' : 'ator_id';
    const ok = await banco.um(`UPDATE pratica_salas SET ${campo} = $2, atualizada_em = now() WHERE codigo = $1 AND ${campo} IS NULL RETURNING *`, [s.codigo, req.usuario.id]);
    if (!ok) return res.status(409).json({ erro: 'Outra pessoa entrou antes. Tente de novo.' });
    await evento(s.codigo, req.usuario.id, 'entrou', { papel: livre });
    res.json(await visao(ok, req.usuario));
  });

  r.get('/dupla/salas/:codigo', exigirLogin, async (req, res) => {
    const s = await salaDo(req, res);
    if (!s) return;
    if (!papelDe(s, req.usuario)) return res.status(403).json({ erro: 'Você não está nesta sala. Entre pelo código.' });
    res.json(await visao(s, req.usuario, req.query.desde));
  });

  r.post('/dupla/salas/:codigo/acao', exigirLogin, async (req, res) => {
    const s = await salaDo(req, res);
    if (!s) return;
    const papel = papelDe(s, req.usuario);
    if (!papel) return res.status(403).json({ erro: 'Você não está nesta sala.' });
    if (await limitar(`dupla-acao:${req.usuario.id}`, 240, 60)) return res.status(429).json({ erro: 'Muitas ações em pouco tempo.' });
    const { tipo } = req.body || {};
    const e = s.estacao_id ? acervo.porId.get(s.estacao_id) : null;
    const erro = (status, msg) => res.status(status).json({ erro: msg });

    if (tipo === 'mensagem') {
      const texto = String(req.body.texto || '').trim().slice(0, 500);
      if (!texto) return erro(400, 'Mensagem vazia.');
      await evento(s.codigo, req.usuario.id, 'mensagem', { papel, texto });
    } else if (tipo === 'configurar') {
      if (s.estado !== 'aguardando') return erro(409, 'A estação já começou.');
      if (papel !== 'ator' && !(s.criador_id === req.usuario.id)) return erro(403, 'Só o ator ou quem criou a sala configura.');
      const mudancas = [];
      const valores = [s.codigo];
      if (req.body.estacaoId !== undefined) {
        const nova = estacaoValida(req.body.estacaoId);
        if (!nova) return erro(400, 'Estação inválida.');
        valores.push(nova.id); mudancas.push(`estacao_id = $${valores.length}`);
      }
      if (req.body.meetUrl !== undefined) {
        const meet = meetValido(req.body.meetUrl);
        if (meet === null) return erro(400, 'Cole um link do Google Meet (https://meet.google.com/abc-defg-hij).');
        valores.push(meet || null); mudancas.push(`meet_url = $${valores.length}`);
      }
      if (req.body.minutos !== undefined) { valores.push(Math.min(20, Math.max(5, Number(req.body.minutos) || 10))); mudancas.push(`minutos = $${valores.length}`); }
      if (req.body.modoProva !== undefined) { valores.push(req.body.modoProva !== false); mudancas.push(`modo_prova = $${valores.length}`); }
      if (req.body.trocarPapeis === true) mudancas.push('medico_id = ator_id, ator_id = medico_id');
      if (!mudancas.length) return erro(400, 'Nada para mudar.');
      await banco.consulta(`UPDATE pratica_salas SET ${mudancas.join(', ')}, liberados = '[]', avaliacao = '{}' WHERE codigo = $1`, valores);
      await evento(s.codigo, req.usuario.id, 'configurada', { trocouPapeis: req.body.trocarPapeis === true });
    } else if (tipo === 'iniciar') {
      if (papel !== 'ator') return erro(403, 'Quem inicia é o ator.');
      if (s.estado !== 'aguardando') return erro(409, 'A estação já começou.');
      if (!s.medico_id || !s.ator_id) return erro(409, 'Espere o colega entrar na sala.');
      if (!e) return erro(409, 'Escolha a estação antes de iniciar.');
      await banco.consulta(`UPDATE pratica_salas SET estado = 'em_andamento', iniciada_em = now(), expira_em = now() + interval '6 hours' WHERE codigo = $1`, [s.codigo]);
      await evento(s.codigo, req.usuario.id, 'iniciada', {});
    } else if (tipo === 'liberar') {
      if (papel !== 'ator') return erro(403, 'Só o ator libera impressos.');
      if (s.estado !== 'em_andamento') return erro(409, 'A estação não está em andamento.');
      const imp = e && impressoPorChave(e, req.body.chave);
      if (!imp) return erro(400, 'Impresso inexistente.');
      if (!s.liberados.includes(imp.chave)) {
        await banco.consulta('UPDATE pratica_salas SET liberados = liberados || $2::jsonb WHERE codigo = $1', [s.codigo, JSON.stringify([imp.chave])]);
        await evento(s.codigo, req.usuario.id, 'impresso', { rotulo: imp.rotulo });
      }
    } else if (tipo === 'avaliar') {
      if (papel !== 'ator') return erro(403, 'Só o ator avalia.');
      if (s.estado === 'encerrada') return erro(409, 'A estação já foi encerrada.');
      const criterio = e?.pep.find((c) => c.id === req.body.criterioId);
      if (!criterio) return erro(400, 'Critério inexistente.');
      const nivel = req.body.nivel === null ? null : String(req.body.nivel);
      if (nivel !== null && !NIVEIS[nivel]) return erro(400, 'Nível inválido.');
      if (nivel === 'parcial' && criterio.pontos.parcial === null) return erro(400, 'Este critério não admite parcial.');
      await banco.consulta(`UPDATE pratica_salas SET avaliacao = CASE WHEN $3::text IS NULL THEN avaliacao - $2 ELSE avaliacao || jsonb_build_object($2::text, $3::text) END,
        atualizada_em = now() WHERE codigo = $1`, [s.codigo, criterio.id, nivel]);
    } else if (tipo === 'encerrar') {
      if (s.estado === 'encerrada') return res.json(await visao(s, req.usuario));
      if (papel !== 'ator' && s.estado === 'em_andamento') {
        // O médico pode encerrar quando o tempo acabou (o ator pode estar distraído).
        const fim = new Date(s.iniciada_em).getTime() + s.minutos * 60_000;
        if (Date.now() < fim) return erro(403, 'Quem encerra antes do tempo é o ator.');
      }
      if (!e) return erro(409, 'Nenhuma estação escolhida.');
      const c = corrigir(e, s.avaliacao);
      await banco.consulta(`UPDATE pratica_salas SET estado = 'encerrada', encerrada_em = now(), resultado = $2 WHERE codigo = $1`, [s.codigo, JSON.stringify(c)]);
      if (s.medico_id && s.estado === 'em_andamento') {
        await banco.consulta(`INSERT INTO pratica_resultados (usuario_id, estacao_id, estacao_versao, area, modo, avaliado_por, avaliador_id, sala_codigo, nota, itens, criticos)
          VALUES ($1, $2, $3, $4, 'dupla', 'ator', $5, $6, $7, $8, $9)`,
        [s.medico_id, e.id, e.versao, e.area, s.ator_id, s.codigo, c.nota, JSON.stringify(c.itens), JSON.stringify(c.criticos)]);
      }
      await evento(s.codigo, req.usuario.id, 'encerrada', { nota: c.nota });
    } else if (tipo === 'nova_rodada') {
      if (s.estado !== 'encerrada') return erro(409, 'Encerre a estação atual antes.');
      await banco.consulta(`UPDATE pratica_salas SET estado = 'aguardando', estacao_id = NULL, liberados = '[]', avaliacao = '{}', resultado = NULL,
        iniciada_em = NULL, encerrada_em = NULL, medico_id = CASE WHEN $2 THEN ator_id ELSE medico_id END, ator_id = CASE WHEN $2 THEN medico_id ELSE ator_id END,
        expira_em = now() + interval '6 hours' WHERE codigo = $1`, [s.codigo, req.body.trocarPapeis === true]);
      await evento(s.codigo, req.usuario.id, 'nova_rodada', { trocouPapeis: req.body.trocarPapeis === true });
    } else {
      return erro(400, 'Ação desconhecida.');
    }
    const atual = await banco.um('SELECT * FROM pratica_salas WHERE codigo = $1', [s.codigo]);
    res.json(await visao(atual, req.usuario));
  });

  r.post('/dupla/salas/:codigo/sair', exigirLogin, async (req, res) => {
    const s = await salaDo(req, res);
    if (!s) return;
    const papel = papelDe(s, req.usuario);
    if (!papel) return res.json({ ok: true });
    if (s.estado === 'em_andamento') return res.status(409).json({ erro: 'Encerre a estação antes de sair.' });
    await banco.consulta(`UPDATE pratica_salas SET ${papel === 'medico' ? 'medico_id' : 'ator_id'} = NULL WHERE codigo = $1`, [s.codigo]);
    await evento(s.codigo, req.usuario.id, 'saiu', { papel });
    res.json({ ok: true });
  });

  return r;
}
