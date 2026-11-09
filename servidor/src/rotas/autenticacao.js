import { Router } from 'express';
import {
  hashSenha, conferirSenha, precisaRefazer, tempoDeSenhaFalsa, problemaDaSenha, novoToken, hashToken, emailValido,
  novoSegredoTotp, conferirTotp, uriTotp, novosCodigosRecuperacao,
} from '../seguranca.js';
import { situacaoDoAluno } from '../acesso.js';
import { COOKIE_INDICACAO, codigoDoAluno } from '../indicacao.js';

const SEXOS = ['masculino', 'feminino'];
const ETAPAS = ['1', '2', '3', '4', '5', '6', 'formado', 'exterior'];

const DIAS_SESSAO = 30;
const MAX_FALHAS = 8;            // erros de senha seguidos antes de bloquear a conta
const BLOQUEIO_MIN = 15;         // primeiro bloqueio; dobra a cada novo bloqueio, até 24 h
const nomeCookie = (config) => (config.producao ? '__Host-rx_sessao' : 'rx_sessao');

export function lerCookie(req, nome) {
  const c = req.headers.cookie || '';
  for (const parte of c.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) {
      try { return decodeURIComponent(v.join('=')); } catch { return null; }
    }
  }
  return null;
}

/** Carrega req.usuario e req.sessao a partir do cookie. A sessão vale 30 dias e é renovada com o uso. */
export function carregarUsuario(banco, config) {
  return async (req, _res, next) => {
    req.usuario = null;
    req.sessao = null;
    const token = lerCookie(req, nomeCookie(config));
    if (token && token.length < 100) {
      const linha = await banco.um(
        `SELECT u.id, u.nome, u.email, u.papel, u.cpf, u.totp_ativo, u.etapa, s.token_hash, s.mfa_ok, s.ultimo_uso
           FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = $1 AND s.expira_em > now() AND u.excluido_em IS NULL`, [hashToken(token)]);
      if (linha) {
        const { token_hash: th, mfa_ok: mfa, ultimo_uso: uso, ...usuario } = linha;
        req.usuario = usuario;
        req.sessao = { hash: th, mfaOk: mfa };
        if (Date.now() - new Date(uso) > 3600000) banco.consulta('UPDATE sessoes SET ultimo_uso = now() WHERE token_hash = $1', [th]).catch(() => {});
      }
    }
    next();
  };
}

export const exigirLogin = (req, res, next) => (req.usuario ? next() : res.status(401).json({ erro: 'Entre na sua conta para continuar.' }));

/** Admin: papel de admin, e (em produção) verificação em duas etapas ativada e confirmada nesta sessão. */
export function exigirAdmin(config) {
  return (req, res, next) => {
    if (req.usuario?.papel !== 'admin') return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
    if (req.usuario.totp_ativo && !req.sessao.mfaOk) return res.status(403).json({ erro: 'Confirme o código de duas etapas.', codigo: '2fa_verificar' });
    if (config.exigir2faAdmin && !req.usuario.totp_ativo) return res.status(403).json({ erro: 'Ative a verificação em duas etapas para usar o painel.', codigo: '2fa_obrigatorio' });
    next();
  };
}

export function rotasAutenticacao({ banco, config, correio, limitar }) {
  const r = Router();
  const cookie = nomeCookie(config);
  const opcoesCookie = { httpOnly: true, secure: config.producao, sameSite: 'lax', path: '/' };
  const limite = (chave, max, seg, msg = 'Muitas tentativas. Espere alguns minutos e tente de novo.') => async (req, res, next) =>
    ((await limitar(chave(req), max, seg)) ? res.status(429).json({ erro: msg }) : next());

  const abrirSessao = async (req, res, usuarioId, mfaOk = false) => {
    const token = novoToken();
    await banco.consulta(
      `INSERT INTO sessoes (token_hash, usuario_id, expira_em, mfa_ok, ip, agente) VALUES ($1, $2, now() + interval '${DIAS_SESSAO} days', $3, $4, $5)`,
      [hashToken(token), usuarioId, mfaOk, req.ip, String(req.get('user-agent') || '').slice(0, 200)]);
    await banco.consulta('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [usuarioId]);
    res.cookie(cookie, token, { ...opcoesCookie, maxAge: DIAS_SESSAO * 86400000 });
  };

  r.post('/cadastro', limite((q) => `cadastro|${q.ip}`, 5, 3600, 'Muitos cadastros a partir desta conexão. Tente mais tarde.'), async (req, res) => {
    const nome = String(req.body?.nome || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (nome.length < 2 || /[<>]/.test(nome)) return res.status(400).json({ erro: 'Informe seu nome.' });
    if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    const problema = problemaDaSenha(senha, email);
    if (problema) return res.status(400).json({ erro: problema });
    if (req.body?.confirmacao !== undefined && req.body.confirmacao !== senha) return res.status(400).json({ erro: 'As senhas não conferem.' });
    // Ficha do aluno: celular (DDD + número, ou internacional com +), sexo e etapa da formação.
    const digitos = String(req.body?.telefone || '').replace(/\D/g, '');
    const telefone = String(req.body?.telefone || '').trim().startsWith('+') ? `+${digitos}` : digitos;
    if (digitos.length < 10 || digitos.length > 15) return res.status(400).json({ erro: 'Informe um celular válido, com DDD.' });
    const sexo = String(req.body?.sexo || '');
    if (!SEXOS.includes(sexo)) return res.status(400).json({ erro: 'Informe o sexo.' });
    const etapa = String(req.body?.etapa || '');
    if (!ETAPAS.includes(etapa)) return res.status(400).json({ erro: 'Informe em que ano da faculdade ou do internato você está.' });
    if (req.body?.aceite !== true) return res.status(400).json({ erro: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.' });
    if (await banco.um('SELECT 1 FROM usuarios WHERE lower(email) = $1', [email])) {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Entre com sua senha.' });
    }
    const papel = config.emailsAdmin.includes(email) ? 'admin' : 'aluno';
    // Indicação: o link /i/CODIGO deixou um cookie com quem indicou.
    const idIndicador = lerCookie(req, COOKIE_INDICACAO);
    const indicador = /^[0-9a-f-]{36}$/i.test(idIndicador || '') ? await banco.um('SELECT id FROM usuarios WHERE id = $1 AND excluido_em IS NULL', [idIndicador]) : null;
    const origem = indicador ? 'indicacao' : String(req.body?.origem || '').replace(/[^\w.:-]/g, '').slice(0, 60) || null;
    const u = await banco.um(`INSERT INTO usuarios (nome, email, senha_hash, papel, aceite_termos_em, indicado_por, origem, telefone, sexo, etapa)
      VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8, $9) RETURNING id`,
      [nome, email, await hashSenha(senha), papel, indicador?.id || null, origem, telefone, sexo, etapa]);
    if (indicador) res.clearCookie(COOKIE_INDICACAO, { path: '/' });
    await codigoDoAluno(banco, { id: u.id, nome });
    await abrirSessao(req, res, u.id);
    correio?.({ modelo: 'boasVindas', para: email, usuarioId: u.id, chave: `boas-vindas:${u.id}`, dados: { nome } }).catch((e) => console.error('e-mail', e.message));
    res.status(201).json({ ok: true });
  });

  r.post('/entrar', limite((q) => `entrar|${q.ip}`, 30, 900), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    const senha = String(req.body?.senha || '').slice(0, 200);
    const u = await banco.um('SELECT id, senha_hash, falhas_login, bloqueado_ate, totp_ativo FROM usuarios WHERE lower(email) = $1 AND excluido_em IS NULL', [email]);
    if (!u) {
      await tempoDeSenhaFalsa(senha);
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
      return res.status(429).json({ erro: 'Conta bloqueada por excesso de tentativas. Tente mais tarde ou redefina a senha.' });
    }
    if (!(await conferirSenha(senha, u.senha_hash))) {
      const falhas = u.falhas_login + 1;
      const bloqueios = Math.floor(falhas / MAX_FALHAS);
      const minutos = Math.min(BLOQUEIO_MIN * 2 ** Math.max(0, bloqueios - 1), 1440);
      await banco.consulta(`UPDATE usuarios SET falhas_login = $2, bloqueado_ate = CASE WHEN $2 % ${MAX_FALHAS} = 0 THEN now() + make_interval(mins => $3) ELSE bloqueado_ate END WHERE id = $1`,
        [u.id, falhas, minutos]);
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }
    await banco.consulta('UPDATE usuarios SET falhas_login = 0, bloqueado_ate = NULL WHERE id = $1', [u.id]);
    if (precisaRefazer(u.senha_hash)) await banco.consulta('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [u.id, await hashSenha(senha)]);
    await abrirSessao(req, res, u.id, false);
    res.json({ ok: true, precisa2fa: u.totp_ativo });
  });

  r.post('/sair', async (req, res) => {
    const token = lerCookie(req, cookie);
    if (token) await banco.consulta('DELETE FROM sessoes WHERE token_hash = $1', [hashToken(token)]);
    res.clearCookie(cookie, opcoesCookie);
    res.json({ ok: true });
  });

  // Encerra a sessão em todos os aparelhos (útil se a senha vazou ou o celular foi perdido).
  r.post('/sair-de-todos', exigirLogin, async (req, res) => {
    await banco.consulta('DELETE FROM sessoes WHERE usuario_id = $1', [req.usuario.id]);
    res.clearCookie(cookie, opcoesCookie);
    res.json({ ok: true });
  });

  r.get('/eu', async (req, res) => {
    if (!req.usuario) return res.json({ usuario: null, acesso: { ativo: false, plano: 'gratis' } });
    const { id, nome, email, papel, totp_ativo: totp, etapa } = req.usuario;
    res.json({ usuario: { id, nome, email, papel, etapa: etapa || null, totpAtivo: totp, precisa2fa: totp && !req.sessao.mfaOk }, acesso: await situacaoDoAluno(banco, id) });
  });

  // ---- Recuperação de senha: sempre responde igual, para não revelar quais e-mails têm conta.
  r.post('/senha/esqueci', limite((q) => `esqueci|${q.ip}`, 5, 900, 'Muitos pedidos. Espere 15 minutos.'), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = emailValido(email) ? await banco.um('SELECT id, nome, email FROM usuarios WHERE lower(email) = $1 AND excluido_em IS NULL', [email]) : null;
    if (u && !(await limitar(`esqueci-email|${u.id}`, 3, 3600))) {
      const token = novoToken();
      await banco.consulta(`INSERT INTO redefinicoes_senha (token_hash, usuario_id, expira_em) VALUES ($1, $2, now() + interval '1 hour')`, [hashToken(token), u.id]);
      await correio?.({ modelo: 'redefinirSenha', para: u.email, usuarioId: u.id, dados: { nome: u.nome, link: `${config.urlBase}/redefinir-senha?token=${token}` } });
    }
    res.json({ ok: true, mensagem: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.' });
  });

  r.post('/senha/redefinir', limite((q) => `redefinir|${q.ip}`, 10, 900), async (req, res) => {
    const token = String(req.body?.token || '').slice(0, 100);
    const senha = String(req.body?.senha || '');
    const pedido = await banco.um(`SELECT r.usuario_id, u.email FROM redefinicoes_senha r JOIN usuarios u ON u.id = r.usuario_id
                                    WHERE r.token_hash = $1 AND r.usado_em IS NULL AND r.expira_em > now()`, [hashToken(token)]);
    if (!pedido) return res.status(400).json({ erro: 'Link inválido ou vencido. Peça um novo.' });
    const problema = problemaDaSenha(senha, pedido.email);
    if (problema) return res.status(400).json({ erro: problema });
    await banco.transacao(async (t) => {
      await t.consulta('UPDATE usuarios SET senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL WHERE id = $1', [pedido.usuario_id, await hashSenha(senha)]);
      await t.consulta('UPDATE redefinicoes_senha SET usado_em = now() WHERE token_hash = $1', [hashToken(token)]);
      await t.consulta('DELETE FROM sessoes WHERE usuario_id = $1', [pedido.usuario_id]); // derruba todas as sessões antigas
    });
    await abrirSessao(req, res, pedido.usuario_id);
    res.json({ ok: true });
  });

  // ---- Verificação em duas etapas (aplicativo autenticador). Obrigatória para admin em produção.
  r.post('/2fa/iniciar', exigirLogin, async (req, res) => {
    if (req.usuario.totp_ativo) return res.status(400).json({ erro: 'A verificação em duas etapas já está ativa.' });
    const segredo = novoSegredoTotp();
    await banco.consulta('UPDATE usuarios SET totp_pendente = $2 WHERE id = $1', [req.usuario.id, segredo]);
    res.json({ segredo, uri: uriTotp(segredo, req.usuario.email) });
  });
  r.post('/2fa/ativar', exigirLogin, limite((q) => `2fa|${q.usuario.id}`, 10, 900), async (req, res) => {
    const u = await banco.um('SELECT totp_pendente FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!u.totp_pendente || !conferirTotp(u.totp_pendente, req.body?.codigo)) return res.status(400).json({ erro: 'Código inválido. Confira o horário do celular e tente o código atual.' });
    const codigos = novosCodigosRecuperacao();
    await banco.consulta(`UPDATE usuarios SET totp_segredo = totp_pendente, totp_pendente = NULL, totp_ativo = true, totp_recuperacao = $2 WHERE id = $1`,
      [req.usuario.id, codigos.map(hashToken)]);
    await banco.consulta('UPDATE sessoes SET mfa_ok = true WHERE token_hash = $1', [req.sessao.hash]);
    await banco.consulta('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [req.usuario.id, req.sessao.hash]);
    res.json({ ok: true, codigosRecuperacao: codigos });
  });
  r.post('/2fa/verificar', exigirLogin, limite((q) => `2fa|${q.usuario.id}`, 10, 900), async (req, res) => {
    const u = await banco.um('SELECT totp_segredo, totp_recuperacao FROM usuarios WHERE id = $1 AND totp_ativo', [req.usuario.id]);
    if (!u) return res.status(400).json({ erro: 'A verificação em duas etapas não está ativa.' });
    const codigo = String(req.body?.codigo || '').trim().toLowerCase();
    let ok = conferirTotp(u.totp_segredo, codigo);
    if (!ok && u.totp_recuperacao.includes(hashToken(codigo))) {
      ok = true; // código de recuperação: vale uma vez só
      await banco.consulta('UPDATE usuarios SET totp_recuperacao = array_remove(totp_recuperacao, $2) WHERE id = $1', [req.usuario.id, hashToken(codigo)]);
    }
    if (!ok) return res.status(400).json({ erro: 'Código inválido.' });
    await banco.consulta('UPDATE sessoes SET mfa_ok = true WHERE token_hash = $1', [req.sessao.hash]);
    res.json({ ok: true });
  });

  // ---- LGPD: o titular pode baixar seus dados e excluir a conta.
  r.get('/eu/dados', exigirLogin, async (req, res) => {
    const id = req.usuario.id;
    const dados = {
      conta: await banco.um('SELECT nome, email, cpf, telefone, sexo, etapa, pais, criado_em, ultimo_acesso, aceite_termos_em FROM usuarios WHERE id = $1', [id]),
      acessos: await banco.varios('SELECT plano_id, inicio, fim, status, origem FROM matriculas WHERE usuario_id = $1', [id]),
      pagamentos: await banco.varios('SELECT plano_id, valor_centavos, desconto_centavos, metodo, parcelas, status, criado_em, pago_em FROM pedidos WHERE usuario_id = $1', [id]),
      emails: await banco.varios('SELECT modelo, assunto, criado_em FROM emails WHERE usuario_id = $1', [id]),
      sessoes: await banco.varios('SELECT criada_em, ultimo_uso, ip, agente FROM sessoes WHERE usuario_id = $1', [id]),
      progresso: (await banco.um('SELECT dados FROM progresso WHERE usuario_id = $1', [id]))?.dados ?? null,
    };
    res.attachment('meus-dados-rx-enamed.json').json(dados);
  });
  r.post('/eu/excluir', exigirLogin, limite((q) => `excluir|${q.usuario.id}`, 5, 3600), async (req, res) => {
    const u = await banco.um('SELECT senha_hash, papel FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!(await conferirSenha(String(req.body?.senha || ''), u.senha_hash))) return res.status(400).json({ erro: 'Senha incorreta.' });
    if (u.papel === 'admin') return res.status(400).json({ erro: 'Contas de administrador não podem ser excluídas por aqui.' });
    // Pedidos e pagamentos ficam (obrigação fiscal), mas sem dados pessoais; o resto é apagado.
    await banco.transacao(async (t) => {
      await t.consulta('DELETE FROM sessoes WHERE usuario_id = $1', [req.usuario.id]);
      await t.consulta('DELETE FROM progresso WHERE usuario_id = $1', [req.usuario.id]);
      await t.consulta('DELETE FROM redefinicoes_senha WHERE usuario_id = $1', [req.usuario.id]);
      await t.consulta('UPDATE emails SET para = \'excluido\', usuario_id = NULL WHERE usuario_id = $1', [req.usuario.id]);
      await t.consulta(`UPDATE usuarios SET nome = 'Conta excluída', email = 'excluido+' || id || '@rx.invalid', cpf = NULL, telefone = NULL, sexo = NULL, etapa = NULL,
                          senha_hash = 'excluido', totp_segredo = NULL, totp_ativo = false, totp_recuperacao = '{}', excluido_em = now() WHERE id = $1`, [req.usuario.id]);
    });
    res.clearCookie(cookie, opcoesCookie);
    res.json({ ok: true });
  });

  return r;
}
