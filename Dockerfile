# Imagem de produção do RX ENAMED (Railway, Render ou qualquer serviço com Docker).
# Etapa 1: monta a área do aluno e o site. Etapa 2: só o necessário para rodar, sem ferramentas de build, como usuário sem privilégios.
FROM node:22-bookworm-slim AS build
WORKDIR /rx
COPY app/package.json app/package-lock.json app/
RUN cd app && npm ci --no-audit --no-fund
COPY servidor/package.json servidor/package-lock.json servidor/
RUN cd servidor && npm ci --omit=dev --no-audit --no-fund
COPY . .
# O Railway passa as variáveis do serviço como argumentos de build: o sitemap e as URLs canônicas usam o endereço real.
ARG URL_BASE=""
RUN cd app && node build.mjs \
 && cd .. && CHECKOUT_PROPRIO=1 SITE_URL="${URL_BASE}" node site/gerar.mjs

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /rx
COPY --from=build --chown=node:node /rx/servidor/package.json ./servidor/package.json
COPY --from=build --chown=node:node /rx/servidor/node_modules ./servidor/node_modules
COPY --from=build --chown=node:node /rx/servidor/src ./servidor/src
COPY --from=build --chown=node:node /rx/servidor/migracoes ./servidor/migracoes
COPY --from=build --chown=node:node /rx/servidor/web ./servidor/web
COPY --from=build --chown=node:node /rx/site/dist ./site/dist
COPY --from=build --chown=node:node /rx/conteudo/planos.json ./conteudo/planos.json
COPY --from=build --chown=node:node /rx/conteudo/residencia ./conteudo/residencia
# 2ª etapa: estações (autorais e oficiais do Inep), editais e mentores ficam só no servidor; o módulo compartilhado
# monta, por papel, o que cada pessoa pode ver (o roteiro e o PEP nunca vão para arquivo público).
COPY --from=build --chown=node:node /rx/compartilhado ./compartilhado
COPY --from=build --chown=node:node /rx/conteudo/estacoes ./conteudo/estacoes
COPY --from=build --chown=node:node /rx/conteudo/estacoes-inep ./conteudo/estacoes-inep
COPY --from=build --chown=node:node /rx/conteudo/editais ./conteudo/editais
COPY --from=build --chown=node:node /rx/conteudo/mentores.json ./conteudo/mentores.json
# Escolas médicas do Brasil (INEP) para a aba Faculdades do admin.
COPY --from=build --chown=node:node /rx/conteudo/faculdades ./conteudo/faculdades
COPY --from=build --chown=node:node /rx/conteudo/paraguai ./conteudo/paraguai
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "servidor/src/iniciar.js"]
