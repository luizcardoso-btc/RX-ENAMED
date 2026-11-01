// Limites de requisição guardados no banco: valem entre reinícios do servidor e entre várias instâncias.
export function criarLimitador(banco) {
  /** Registra uma tentativa e diz se passou do limite (max tentativas em janelaSeg segundos). */
  return async function excedeu(chave, max, janelaSeg) {
    const r = await banco.um(
      `WITH novo AS (INSERT INTO limites (chave) VALUES ($1))
       SELECT count(*) AS n FROM limites WHERE chave = $1 AND em > now() - make_interval(secs => $2)`, [chave, janelaSeg]);
    return r.n + 1 > max;
  };
}
