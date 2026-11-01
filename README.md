# RX ENAMED

Curso online para o ENAMED (com a 2ª etapa do Revalida para quem se formou no exterior), hospedado como site, em português e espanhol: páginas públicas
(página de venda e planos; as provas ficam só dentro da área do aluno) e a área do aluno (curso com aulas, trilha
inteligente, banco de questões oficiais, flashcards, simulados, raio-x da prova e estações da 2ª etapa com
paciente simulado por IA). As questões ficam em português, como na prova do Inep; interface, aulas,
flashcards e mentores têm versão em espanhol.

## Estrutura

| Caminho | O que é |
| --- | --- |
| `provas/` | PDFs do Inep: `<id>_prova.pdf` (caderno) e `<id>_gabarito.pdf` (gabarito definitivo) |
| `pipeline.py` | Lê os PDFs, separa questões e alternativas, recorta figuras e tabelas, cruza com o gabarito e gera a planilha e os dados do app |
| `classificacao.csv` | Classificação revisada de cada questão (especialidade; tema; tipo). Edite aqui para corrigir ou classificar novas questões |
| `taxonomia.py` | Palavras-chave da classificação automática, usada só para questões que ainda não estão no CSV |
| `banco_questoes.xlsx` | Planilha: provas, questões e resumos por área, especialidade, tema e tipo |
| `app/` | Área do aluno (React via CDN, compilado com esbuild). Textos da interface em `app/src/es.js` (espanhol) |
| `conteudo/aulas/` | Aulas do curso, em português e espanhol, ligadas às questões oficiais |
| `site/` | Gerador do site público (`gerar.mjs`), estilo e teste. Saída em `site/dist/` |
| `importar_questoes.py`, `importar/` | Importação em massa (residência, ENAMED, inéditas) com validação e remoção de duplicatas |
| `baixar_provas.py`, `fontes_provas.csv` | Baixa os PDFs oficiais do Inep a partir dos links preenchidos no CSV |

## Como adicionar uma edição

1. Salve os PDFs em `provas/` com o id da edição (lista em `EDICOES` no `pipeline.py`), por exemplo
   `revalida_2025-1_prova.pdf` e `revalida_2025-1_gabarito.pdf`.
2. Rode `python3 pipeline.py`. As questões novas entram com classificação automática (marcada como "automática").
3. Revise e acrescente as linhas da edição em `classificacao.csv` e rode o pipeline de novo.
4. Se o caderno seguir o rodízio de áreas (Q1 Clínica, Q2 Cirurgia, Q3 Pediatria, Q4 GO, Q5 MFC...), confira e
   acrescente o id em `CICLO_CONFERIDO` no `pipeline.py`.
5. Gere a área do aluno: `cd app && npm install && node build.mjs` (saída em `app/dist/`). O build recusa textos sem tradução
   para o espanhol; `node i18n-chaves.mjs` lista o que falta.
6. Gere o site: `node site/gerar.mjs` (saída em `site/dist/`, pronta para qualquer hospedagem estática).
   Com o domínio definido, `SITE_URL=https://seu-dominio node site/gerar.mjs` também gera `sitemap.xml`, `robots.txt` e as tags hreflang.
7. Teste: `node app/teste/rodar.mjs` (área do aluno nos dois idiomas) e `node site/teste.mjs` (páginas públicas e links).

## Hospedagem

`site/dist/` é estático: Netlify, Vercel, Cloudflare Pages ou qualquer servidor servem a pasta como está.
A conversa com o paciente por IA usa a capacidade do visualizador do Claude; fora dele, a prática da 2ª etapa
funciona no modo roteiro até a plataforma ter um servidor próprio com chave de API.

## Situação dos dados

- Processadas: Revalida 2023.1, 2023.2, 2024.1 e 2024.2 (400 questões, 27 anuladas, todas com classificação revisada).
- Recebido sem caderno: gabarito do Revalida 2025.1.
- Pendentes: Revalida 2011 a 2022.2, 2025.1 (caderno), 2025.2, 2026.1, 2026.2 e ENAMED 2025 e 2026. Coloque os PDFs em `provas/`
  ou preencha os links em `fontes_provas.csv` e rode `python3 baixar_provas.py` (a rede precisa liberar `download.inep.gov.br`).

O formato do ENAMED e das edições antigas do Revalida ainda não foi testado; o leitor de PDF pode precisar de ajustes.

## Planos e pagamento

Preços, textos dos planos e a oferta de lançamento ficam só em `conteudo/planos.json` (valores em centavos). O build valida o arquivo
e os mesmos números aparecem na área do aluno (aba Planos) e no site (`planos.html` e a seção de planos da página inicial).

Para começar a cobrar: crie cada plano no gateway de pagamento (assinatura recorrente para mensal, ciclo e anual; pagamento único
para a 2ª etapa), cole o link de checkout em `checkout` e gere de novo o app e o site. Sem link, o botão mostra "Pagamento abre em breve".
Para encerrar a oferta de fundador, troque `lancamento.ativo` para `false`.

A liberação do acesso depois do pagamento ainda não existe: ela exige login de aluno e um servidor que receba o aviso (webhook)
do gateway e marque o plano na conta.
