import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';

// Datas e números do Postgres chegam como tipos do JavaScript; bigint (contagens) vira número.
pg.types.setTypeParser(20, (v) => Number(v));

/** SSL automático: bancos fora da rede interna (ex.: URL pública do Railway) exigem conexão cifrada. */
export function precisaSsl(url, forcar) {
  if (forcar === true || forcar === false) return forcar;
  try {
    const host = new URL(url).hostname;
    return !(host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.railway.internal') || host.endsWith('.internal'));
  } catch { return false; }
}

export function criarBanco(url, { ssl = false } = {}) {
  const pool = new pg.Pool({ connectionString: url, max: 10, ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    statement_timeout: 15000, connectionTimeoutMillis: 10000 });
  pool.on('error', (e) => console.error('banco: conexão perdida', e.message));
  const consulta = (sql, params) => pool.query(sql, params);
  const um = async (sql, params) => (await pool.query(sql, params)).rows[0] ?? null;
  const varios = async (sql, params) => (await pool.query(sql, params)).rows;
  // Transação: a função recebe um cliente com os mesmos atalhos.
  const transacao = async (fn) => {
    const cliente = await pool.connect();
    const t = {
      consulta: (s, p) => cliente.query(s, p),
      um: async (s, p) => (await cliente.query(s, p)).rows[0] ?? null,
      varios: async (s, p) => (await cliente.query(s, p)).rows,
    };
    try {
      await cliente.query('BEGIN');
      const r = await fn(t);
      await cliente.query('COMMIT');
      return r;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  };
  return { pool, consulta, um, varios, transacao, fechar: () => pool.end() };
}

export async function migrar(banco) {
  const pasta = new URL('../migracoes/', import.meta.url).pathname;
  await banco.consulta('CREATE TABLE IF NOT EXISTS migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())');
  const feitas = new Set((await banco.varios('SELECT nome FROM migracoes')).map((r) => r.nome));
  const aplicadas = [];
  for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
    if (feitas.has(arquivo)) continue;
    const sql = readFileSync(pasta + arquivo, 'utf8').replace(/CREATE TABLE migracoes[^;]*;/, '');
    await banco.transacao(async (t) => {
      await t.consulta(sql);
      await t.consulta('INSERT INTO migracoes (nome) VALUES ($1)', [arquivo]);
    });
    aplicadas.push(arquivo);
  }
  return aplicadas;
}
