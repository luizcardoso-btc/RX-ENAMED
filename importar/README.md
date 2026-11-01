# Importação em massa de questões

Caminho para levar o banco das ~2.000 questões oficiais do Revalida (2011–2026) às 100 mil do plano:
provas de residência, ENAMED e questões inéditas, sempre com fonte e situação da revisão médica.

## Como importar

1. Copie `modelo_questoes.csv` (ponto e vírgula, UTF-8) ou monte uma planilha `.xlsx` com as mesmas colunas.
2. Salve em `importar/entrada/` (um arquivo por banca e ano facilita o controle).
3. Rode `python3 importar_questoes.py` na raiz do projeto.
4. Corrija as linhas listadas em `relatorio_importacao.csv` e rode de novo.
5. Rode `python3 pipeline.py`: só as questões com `revisao = revisada` entram no app.

## Colunas

| Coluna | Regra |
| --- | --- |
| `fonte` | `revalida`, `enamed`, `residencia` ou `inedita` |
| `banca` | quem aplicou (ENARE, SUS-SP, USP...) ou `RX` para inéditas |
| `ano`, `edicao`, `numero` | ano com 4 dígitos; edição opcional (ex.: `R1`); número da questão no caderno |
| `area` | uma das 5 grandes áreas do Inep, escrita igual ao app |
| `especialidade`, `tema` | mesma taxonomia de `classificacao.csv` |
| `tipo` | Conceito/teoria, Conduta, Cálculo, Diagnóstico, Diagnóstico + conduta, Exame complementar, Interpretação de dados ou Legislação/política |
| `dificuldade` | fácil, média, difícil (opcional) |
| `enunciado`, `A`–`E` | texto completo; 4 ou 5 alternativas |
| `gabarito` | A a E, ou `anulada` |
| `comentario` | explicação da resposta; obrigatória em inéditas |
| `revisao`, `revisor` | `pendente` ou `revisada`; revisada exige o nome do médico |
| `origem` | link do caderno oficial ou `autoral` |

O importador recusa linhas incompletas, gabarito fora das alternativas e duplicatas (mesmo enunciado e
alternativas, ignorando acentos e pontuação), inclusive de questões oficiais já no banco.

## Quando o volume crescer

O app carrega o banco inteiro num arquivo JSON, o que funciona bem até cerca de 10 mil questões.
Acima disso, o banco deve ir para um servidor com busca (por exemplo, Postgres), com a plataforma
carregando as questões por filtro. O formato gerado aqui (`banco_externo.json`) já serve de carga inicial.

## Direitos

Provas de residência são publicadas pelas bancas; os comentários de outros cursos não podem ser copiados.
Registre a `origem` de cada questão e escreva comentários próprios.
