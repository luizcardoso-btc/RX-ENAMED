# Conteúdo autoral: pacientes simulados e mentores

Tudo aqui é validado e empacotado pelo build do app (`cd app && node build.mjs`), que gera `dist/data/conteudo.json`.
Se algum arquivo estiver fora do padrão, o build para e diz qual arquivo e o que falta.

## Como acrescentar uma estação

1. Copie uma estação parecida de `estacoes/` e renomeie. O nome do arquivo precisa ser igual ao `id` (ex.: `ped-03-bronquiolite.json`).
   Prefixos: `cm` Clínica, `cir` Cirurgia, `ped` Pediatria, `go` GO, `mfc` Medicina de Família / Saúde Coletiva.
2. Preencha os campos:

| Campo | O que é |
| --- | --- |
| `area` | Uma das 5 grandes áreas, escrita como no Raio-X |
| `especialidade`, `tema` | Use os mesmos nomes da classificação das questões (`classificacao.csv`) para cruzar com o Raio-X |
| `mentor` | `lia`, `caio`, `helena`, `tomas` ou `marina` (ver `mentores.json`) |
| `duracaoMin` | 10, como na prova |
| `cenario`, `tarefas` | O impresso que o candidato lê antes de entrar |
| `paciente.perfil` | Personalidade e emoção; a IA usa para atuar |
| `paciente.abertura` | Primeira fala espontânea |
| `paciente.roteiro` | Lista `{topico, resposta}`: o que o paciente só conta se perguntado |
| `paciente.perguntasDoPaciente` | Perguntas que o paciente faz durante a consulta |
| `exameFisico`, `exames` | Impressos entregues pelo examinador quando o candidato pede |
| `diagnostico`, `condutaEsperada` | Gabarito da estação, mostrado só no resultado |
| `pep` | Checklist `{id, item, peso}`; os pesos somam exatamente 10 |
| `referencias` | Protocolos e diretrizes em que o caso se baseia |

3. Rode o build e teste a estação nos dois modos (roteiro e IA).

## Revisão médica antes de publicar

As 10 estações iniciais foram escritas com base nos protocolos citados em cada uma, mas ainda precisam de revisão por médico.
Na revisão, confira principalmente:

- doses, esquemas e prazos (mudam com novas versões dos protocolos e do calendário vacinal);
- se o checklist cobra o que o Inep cobra nos PEPs publicados das edições anteriores;
- se o roteiro do paciente tem todas as respostas que o checklist exige.

Registre a revisão no próprio arquivo, por exemplo `"revisao": {"por": "Dr(a). Nome, CRM", "data": "2026-11-01"}`.

## Mentores

`mentores.json` tem a ficha de cada personagem: história, personalidade, bordões, tom, descrição visual para ilustração,
mensagens usadas no app e ideias de conteúdo para as redes. São personagens fictícios; ao ilustrar, evite semelhança com pessoas reais.
Novas falas entram em `mensagens.acerto` e `mensagens.erro` e aparecem automaticamente no app depois de cada questão.
