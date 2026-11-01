import { Router } from 'express';
import { hashSenha, conferirSenha, novoToken, hashToken, emailValido } from '../seguranca.js';
import { situacaoDoAluno } from '../acesso.js';

const COOKIE = 'rx_sessao';
const DIAS_SESSAO = 30;

export function lerCookie(req, nome) {
  const c = req.headers.cookie || '';
  for (const parte of c.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Carrega req.usuario a partir do cookie de sessão. */
export function carregarUsuario(banco) {
  return async (req, _res, next) => {
    req.usuario = null;
    const token = lerCookie(req, COOKIE);
    if (token) {
      req.usuario = await banco.um(
        `SELECT u.id, u.nome, u.email, u.papel, u.cpf FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token_hash = $1 AND s.expira_em > now()`, [hashToken(token)]);
    }
    next();
  };
}

export const exigirLogin = (req, res, next) => (req.usuario ? next() : res.status(401).json({ erro: 'Entre na sua conta para continuar.' }));
export const exigirAdmin = (req, res, next) => (req.usuario?.papel === 'admin' ? next() : res.status(403).json({ erro: 'Acesso restrito ao administrador.' }));

// Limite simples de tentativas de login por IP e e-mail (memória do processo).
const tentativas = new Map();
function limitarTentativas(chave, max = 8, janelaMs = 15 * 60 * 1000) {
  const agora = Date.now();
  const lista = (tentativas.get(chave) || []).filter((t) => agora - t < janelaMs);
  lista.push(agora);
  tentativas.set(chave, lista);
  return lista.length > max;
}

export function rotasAutenticacao({ banco, config, correio }) {
  const r = Router();
  const abrirSessao = async (res, usuarioId) => {
    const token = novoToken();
    await banco.consulta(`INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, now() + interval '${DIAS_SESSAO} days')`,
      [hashToken(token), usuarioId]);
    await banco.consulta('UPDATE usuarios SET ultimo_acesso = now() WHERE id = $1', [usuarioId]);
    res.cookie(COOKIE, token, { httpOnly: true, secure: config.producao, sameSite: 'lax', maxAge: DIAS_SESSAO * 86400000, path: '/' });
  };

  r.post('/cadastro', async (req, res) => {
    const nome = String(req.body?.nome || '').trim().slice(0, 120);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (nome.length < 2) return res.status(400).json({ erro: 'Informe seu nome.' });
    if (!emailValido(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (await banco.um('SELECT 1 FROM usuarios WHERE lower(email) = $1', [email])) {
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Entre com sua senha.' });
    }
    const papel = config.emailsAdmin.includes(email) ? 'admin' : 'aluno';
    const u = await banco.um('INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4) RETURNING id',
      [nome, email, await hashSenha(senha), papel]);
    await abrirSessao(res, u.id);
    correio?.({ modelo: 'boasVindas', para: email, usuarioId: u.id, chave: `boas-vindas:${u.id}`, dados: { nome } }).catch((e) => console.error('e-mail', e.message));
    res.status(201).json({ ok: true });
  });

  // Recuperação de senha: sempre responde igual, para não revelar quais e-mails têm conta.
  r.post('/senha/esqueci', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (limitarTentativas(`esqueci|${req.ip}`, 5)) return res.status(429).json({ erro: 'Muitos pedidos. Espere 15 minutos.' });
    const u = emailValido(email) ? await banco.um('SELECT id, nome, email FROM usuarios WHERE lower(email) = $1', [email]) : null;
    if (u) {
      const token = novoToken();
      await banco.consulta(`INSERT INTO redefinicoes_senha (token_hash, usuario_id, expira_em) VALUES ($1, $2, now() + interval '1 hour')`, [hashToken(token), u.id]);
      await correio?.({ modelo: 'redefinirSenha', para: u.email, usuarioId: u.id, dados: { nome: u.nome, link: `${config.urlBase}/redefinir-senha?token=${token}` } });
    }
    res.json({ ok: true, mensagem: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.' });
  });

  r.post('/senha/redefinir', async (req, res) => {
    const token = String(req.body?.token || '');
    const senha = String(req.body?.senha || '');
    if (senha.length < 8) return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    const pedido = await banco.um('SELECT usuario_id FROM redefinicoes_senha WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()', [hashToken(token)]);
    if (!pedido) return res.status(400).json({ erro: 'Link inválido ou vencido. Peça um novo.' });
    await banco.transacao(async (t) => {
      await t.consulta('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [pedido.usuario_id, await hashSenha(senha)]);
      await t.consulta('UPDATE redefinicoes_senha SET usado_em = now() WHERE token_hash = $1', [hashToken(token)]);
      await t.consulta('DELETE FROM sessoes WHERE usuario_id = $1', [pedido.usuario_id]); // derruba sessões antigas
    });
    await abrirSessao(res, pedido.usuario_id);
    res.json({ ok: true });
  });

  r.post('/entrar', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    if (limitarTentativas(`${req.ip}|${email}`)) return res.status(429).json({ erro: 'Muitas tentativas. Espere 15 minutos.' });
    const u = await banco.um('SELECT id, senha_hash FROM usuarios WHERE lower(email) = $1', [email]);
    if (!u || !(await conferirSenha(senha, u.senha_hash))) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    await abrirSessao(res, u.id);
    res.json({ ok: true });
  });

  r.post('/sair', async (req, res) => {
    const token = lerCookie(req, COOKIE);
    if (token) await banco.consulta('DELETE FROM sessoes WHERE token_hash = $1', [hashToken(token)]);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/eu', async (req, res) => {
    if (!req.usuario) return res.json({ usuario: null, acesso: { ativo: false, plano: 'gratis' } });
    const { id, nome, email, papel } = req.usuario;
    res.json({ usuario: { id, nome, email, papel }, acesso: await situacaoDoAluno(banco, id) });
  });

  return r;
}
