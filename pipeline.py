"""Extrai, classifica e consolida as questões do Revalida e do ENAMED.

Uso:
    1. Salve em provas/ o caderno e o gabarito de cada edição como
       <id>_prova.pdf e <id>_gabarito.pdf (ids em EDICOES, ex.: revalida_2024-1_prova.pdf).
    2. python3 pipeline.py

Saídas:
    banco_questoes.xlsx            planilha com questões, classificação e resumos
    app/public/data/questoes.json  base de dados do aplicativo
    app/public/img/                figuras e tabelas recortadas dos cadernos

A classificação revisada (especialidade, tema, tipo) fica em classificacao.csv;
questões fora dele recebem uma classificação automática por palavras-chave.
"""

import csv
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import collections
import pdfplumber
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from taxonomia import TAXONOMIA

BASE = Path(__file__).parent
PASTA_PROVAS = BASE / "provas"
SAIDA_XLSX = BASE / "banco_questoes.xlsx"
CLASSIFICACAO = BASE / "classificacao.csv"
QUALIFICACAO = BASE / "qualificacao.csv"  # id;dificuldade (fácil, média, difícil)
PASTA_APP = BASE / "app" / "public"
SAIDA_JSON = PASTA_APP / "data" / "questoes.json"
BANCO_EXTERNO = BASE / "importar" / "banco_externo.json"  # gerado por importar_questoes.py
PASTA_IMG = PASTA_APP / "img"

# (id, exame, edição, ano). Confirme a lista no site do Inep e acrescente novas edições aqui.
EDICOES = [
    *[(f"revalida_{a}", "Revalida", str(a), a) for a in (2011, 2012, 2013, 2014, 2015, 2016, 2017, 2020, 2021)],
    *[(f"revalida_{a}-{s}", "Revalida", f"{a}.{s}", a) for a in (2022, 2023, 2024, 2025, 2026) for s in (1, 2)],
    ("enamed_2025", "ENAMED", "2025", 2025),
    ("enamed_2026", "ENAMED", "2026", 2026),
]

GRANDES_AREAS = ["Clínica Médica", "Cirurgia", "Pediatria", "Ginecologia e Obstetrícia",
                 "Medicina de Família e Comunidade / Saúde Coletiva"]
# Nos cadernos do Inep as áreas se alternam em ciclo de 5 (Q1 Clínica, Q2 Cirurgia, Q3 Pediatria,
# Q4 GO, Q5 MFC/Saúde Coletiva...), 20 questões por área. Só aplique a edições em que o ciclo foi
# conferido contra o conteúdo das questões.
CICLO_CONFERIDO = {"revalida_2022-1", "revalida_2022-2", "revalida_2023-1", "revalida_2023-2", "revalida_2024-1", "revalida_2024-2", "revalida_2025-1"}

RE_QUESTAO = re.compile(r"^\s*QUEST[ÃA]O\s+(\d{1,3})\b", re.MULTILINE | re.IGNORECASE)
RE_ALTERNATIVA = re.compile(r"^([A-E])\s+(?=\S)")
# Cabeçalhos, rodapés e espaços em branco que se repetem em todas as páginas do caderno.
RE_RUIDO = re.compile(r"^\s*(\d{1,4}|(PRIMEIRA|SEGUNDA) EDIÇÃO|ÁREA LIVRE|ESPAÇO LIVRE|RASCUNHO)\s*$", re.IGNORECASE)
RE_ESPACO_LIVRE = re.compile(r"\s*(\b(espaço|área) livre\b|EDIÇÃO 20\d\d/\d)\s*", re.IGNORECASE)  # rodapé colado na última linha da coluna
RE_FIM_PROVA = re.compile(r"^\s*QUESTIONÁRIO DE PERCEPÇÃO", re.MULTILINE)
RE_IDADE = re.compile(r"\b\d{1,3}\s+(anos|meses|dias)\b", re.IGNORECASE)
RE_FIGURA = re.compile(r"\[FIG:(\d+)\]")


def normalizar(texto):
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento.lower())


def pdf_para_texto(caminho):
    return subprocess.run(["pdftotext", "-layout", str(caminho), "-"], capture_output=True, text=True, check=True).stdout


# ---------------------------------------------------------------- leitura do caderno

def _juntar_intervalos(intervalos, folga):
    juntos = []
    for ini, fim in sorted(intervalos):
        if juntos and ini - juntos[-1][1] <= folga:
            juntos[-1][1] = max(juntos[-1][1], fim)
        else:
            juntos.append([ini, fim])
    return juntos


def _regioes_de_tabela(pagina):
    """Caixas (x0, topo, x1, base) das tabelas da página.

    As tabelas do Inep são desenhadas célula a célula, o que fragmenta o detector do pdfplumber.
    Aqui uma tabela é um conjunto de linhas (bordas) que se tocam, com pelo menos 3 alturas
    horizontais diferentes. Ficam de fora as réguas da página (cabeçalho, rodapé, divisória das
    colunas) e as barras decorativas ao lado do selo "QUESTÃO N".
    """
    selos = [(i["x1"], i["top"], i["bottom"]) for i in pagina.images if i["height"] < 30]

    def decorativa(e):
        if e["orientation"] == "h":
            return e["x1"] - e["x0"] > 0.85 * pagina.width or any(
                abs(e["x0"] - x1) < 5 and topo - 2 <= e["top"] <= base + 2 for x1, topo, base in selos)
        return e["bottom"] - e["top"] > 0.6 * pagina.height

    bordas = [(e["x0"], e["top"], e["x1"], e["bottom"], e["orientation"]) for e in pagina.edges if not decorativa(e)]
    pai = list(range(len(bordas)))

    def raiz(i):
        while pai[i] != i:
            pai[i] = pai[pai[i]]
            i = pai[i]
        return i

    folga = 1.5
    ordem = sorted(range(len(bordas)), key=lambda i: bordas[i][1])
    for n, i in enumerate(ordem):
        x0, t0, x1, b0, _ = bordas[i]
        for j in ordem[n + 1:]:
            u0, t1, u1, b1, _ = bordas[j]
            if t1 > b0 + folga:
                break
            if u0 <= x1 + folga and u1 >= x0 - folga:
                pai[raiz(j)] = raiz(i)
    grupos = {}
    for i, borda in enumerate(bordas):
        grupos.setdefault(raiz(i), []).append(borda)
    regioes = []
    for membros in grupos.values():
        alturas = {round(b[1]) for b in membros if b[4] == "h" and b[2] - b[0] >= 20}
        x0, topo = min(b[0] for b in membros), min(b[1] for b in membros)
        x1, base = max(b[2] for b in membros), max(b[3] for b in membros)
        if len(alturas) >= 3 and base - topo >= 18 and x1 - x0 >= 60:
            regioes.append((x0, topo - 3, x1, base + 1))  # margem: o texto do cabeçalho encosta na borda
    return regioes


class LeitorCaderno:
    """Lê um caderno do Inep e guarda figuras e tabelas como PNG, marcadas no texto como [FIG:n]."""

    def __init__(self, ident, salvar_figuras=True):
        self.ident = ident
        self.salvar_figuras = salvar_figuras
        self.figuras = []  # nomes de arquivo, na ordem de [FIG:n]
        if salvar_figuras:
            for antiga in PASTA_IMG.glob(f"{ident}_fig*.png"):
                antiga.unlink()

    def _registrar_figura(self, pagina, bbox):
        x0, topo, x1, base = bbox
        bbox = (max(x0 - 4, 0), max(topo - 4, 0), min(x1 + 4, pagina.width), min(base + 4, pagina.height))
        nome = f"{self.ident}_fig{len(self.figuras) + 1:02d}.png"
        if self.salvar_figuras:
            PASTA_IMG.mkdir(parents=True, exist_ok=True)
            pagina.crop(bbox).to_image(resolution=150).save(PASTA_IMG / nome)
        self.figuras.append(nome)
        return f"[FIG:{len(self.figuras)}]"

    def _texto_da_caixa(self, pagina, caixa, tabelas):
        """Texto da caixa, de cima para baixo, trocando figuras e tabelas com bordas por marcadores."""
        x0, topo, x1, base = caixa
        blocos = [(i["top"], i["bottom"], i["x0"], i["x1"]) for i in pagina.images
                  if i["height"] > 60 and i["width"] > 80]
        blocos += [(t[1], t[3], t[0], t[2]) for t in tabelas]
        blocos = sorted((max(a, topo), min(b, base), c, d) for a, b, c, d in blocos
                        if topo <= a < base and c < x1 and d > x0)
        linhas, y = [], topo
        for a, b, c, d in blocos:
            if a < y:  # bloco sobreposto a um anterior (ex.: imagem dentro de tabela)
                continue
            if a - y > 1:
                linhas += (pagina.crop((x0, y, x1, a)).extract_text() or "").splitlines()
            linhas.append(self._registrar_figura(pagina, (max(c, x0), a, min(d, x1), b)))
            y = b
        if base - y > 1:
            linhas += (pagina.crop((x0, y, x1, base)).extract_text() or "").splitlines()
        return linhas

    def _linhas_da_pagina(self, pagina):
        """Lê a página em faixas: largura total (tabelas, figuras) inteiras; duas colunas, esquerda e depois direita.

        Uma faixa é de largura total quando há palavras, figuras ou linhas de tabela atravessando o meio da página.
        """
        meio, altura = pagina.width / 2, pagina.height
        largas = [(w["top"], w["bottom"]) for w in pagina.extract_words() if w["x0"] < meio - 1 and w["x1"] > meio + 1]
        largas += [(i["top"], i["bottom"]) for i in pagina.images if i["x0"] < meio - 1 and i["x1"] > meio + 1]
        largas += [(e["top"], e["bottom"]) for e in pagina.horizontal_edges if e["x0"] < meio - 1 and e["x1"] > meio + 1]
        faixas_largas = _juntar_intervalos([(max(a, 0), min(b, altura)) for a, b in largas], folga=80)
        tabelas = _regioes_de_tabela(pagina)
        linhas, y = [], 0
        for ini, fim in faixas_largas + [[altura, altura]]:
            if ini - y > 1:
                linhas += self._texto_da_caixa(pagina, (0, y, meio, ini), tabelas)
                linhas += self._texto_da_caixa(pagina, (meio, y, pagina.width, ini), tabelas)
            if fim > ini:
                linhas += self._texto_da_caixa(pagina, (0, ini, pagina.width, min(fim + 1, altura)), tabelas)
            y = min(fim + 1, altura)
        return linhas

    def ler(self, caminho):
        """Texto do caderno sem capa, cabeçalhos/rodapés e questionário final."""
        linhas = []
        mapas = None
        with pdfplumber.open(caminho) as pdf:
            for pagina in pdf.pages[1:]:  # a página 1 é a capa com instruções
                if mapas is None and any(c["text"].startswith("(cid:") for c in pagina.chars[:400]):
                    mapas = mapas_de_glifos(caminho)
                if mapas:
                    decodificar_cids(pagina, mapas)
                linhas += [l for l in self._linhas_da_pagina(pagina) if not RE_RUIDO.match(l)]
        texto = "\n".join(linhas)
        inicio = RE_QUESTAO.search(texto)
        texto = texto[inicio.start():] if inicio else texto
        fim = RE_FIM_PROVA.search(texto)
        return texto[:fim.start()] if fim else texto


# Alguns cadernos (2022.1) usam fontes sem tabela de caracteres: o pdfplumber devolve "(cid:N)". Cada fonte liga o
# código N a um glifo "gNNN" (lista /Differences do PDF), e NNN é o mesmo em todas as fontes do caderno. A tabela
# abaixo, de NNN para texto, foi montada comparando o texto com a página impressa.
GLIFO_PARA_TEXTO = {
    3: " ", 4: "A", 0x13: "0", 0x15: "2", 5: "À", 6: "Á", 8: "Ã", 0x11: "B", 0x12: "C", 0x17: "Ç", 0x18: "D", 0x1C: "E", 0x1E: "É",
    0x26: "F", 0x27: "G", 0x2C: "H", 0x2F: "I", 0x31: "Í", 0x3A: "J", 0x3C: "K", 0x3E: "L", 0x44: "M", 0x45: "N",
    0x4B: "O", 0x57: "P", 0x59: "Q", 0x5A: "R", 0x5E: "S", 0x64: "T", 0x68: "U", 0x73: "V", 0x74: "W", 0x7F: "Z",
    0x102: "a", 0x103: "à", 0x104: "á", 0x105: "â", 0x106: "ã", 0x10F: "b", 0x110: "c", 0x115: "ç", 0x11A: "d",
    0x11E: "e", 0x120: "é", 0x121: "ê", 0x128: "f", 0x150: "g", 0x15A: "h", 0x15D: "i", 0x15F: "í", 0x169: "j",
    0x16C: "k", 0x16F: "l", 0x175: "m", 0x176: "n", 0x17D: "o", 0x17F: "ó", 0x180: "ô", 0x181: "õ", 0x182: "ö",
    0x189: "p", 0x18B: "q", 0x18C: "r", 0x190: "s", 0x19A: "t", 0x1B5: "u", 0x1B7: "ú", 0x1C0: "v", 0x1C1: "w",
    0x1C6: "x", 0x1C7: "y", 0x1CC: "z", 0x1D0: "ª", 0x1D1: "º", 0x217: "°", 0x3A3: "°", 0x397: '"',
    0x34D: "?", 0x355: ",", 0x356: ";", 0x357: ":", 0x358: ".", 0x35E: "“", 0x35F: "”", 0x36C: "/", 0x372: "-",
    0x374: "–", 0x37E: "(", 0x37F: ")", 0x380: "[", 0x381: "]", 0x3EC: "0", 0x3ED: "1", 0x3EE: "2", 0x3EF: "3",
    0x3F0: "4", 0x3F1: "5", 0x3F2: "6", 0x3F3: "7", 0x3F4: "8", 0x3F5: "9", 0x439: "%", 0x43D: "+", 0x441: "=",
    0x444: "<", 0x445: ">", 0x447: "≤", 0x448: "≥",
}
RE_CID = re.compile(r"\(cid:(\d+)\)")
GLIFOS_DESCONHECIDOS = collections.Counter()


def mapas_de_glifos(caminho):
    """{nome da fonte: {código: NNN}} a partir das listas /Differences com nomes gNNN."""
    import pymupdf  # só para cadernos com fontes sem tabela de caracteres
    mapas = {}
    with pymupdf.open(caminho) as doc:
        for pno in range(len(doc)):
            for xref, _, _, nome, _, _ in doc.get_page_fonts(pno):
                if nome in mapas:
                    continue
                tipo, valor = doc.xref_get_key(xref, "Encoding")
                if tipo != "xref":
                    continue
                dif = doc.xref_get_key(int(valor.split()[0]), "Differences")[1]
                codigo, mapa = 0, {}
                for token in re.findall(r"/g\d+|/\S+|\d+", dif):
                    if token.isdigit():
                        codigo = int(token)
                    else:
                        if token.startswith("/g") and token[2:].isdigit():
                            mapa[codigo] = int(token[2:])
                        codigo += 1
                if mapa:
                    mapas[nome] = mapa
    return mapas


def codigo_do_caractere(texto):
    """Código original de um caractere que o pdfplumber já converteu (faixa comum ou tabela do Windows)."""
    if len(texto) != 1:
        return None
    if texto in "’‘":  # StandardEncoding do Adobe: 0x27 é quoteright e 0x60 é quoteleft
        return 0x27 if texto == "’" else 0x60
    if ord(texto) < 256:
        return ord(texto)
    try:
        return texto.encode("cp1252")[0]
    except UnicodeEncodeError:
        return None


def decodificar_cids(pagina, mapas):
    """Troca, no próprio objeto da página, o texto de cada caractere dessas fontes pelo texto do glifo.

    O pdfplumber devolve "(cid:N)" ou, quando o código cai na faixa comum, o próprio código como letra; os dois
    casos apontam para a lista /Differences da fonte.
    """
    for c in pagina.chars:
        mapa = mapas.get(c["fontname"])
        if not mapa:
            continue
        m = RE_CID.fullmatch(c["text"])
        codigo = int(m.group(1)) if m else codigo_do_caractere(c["text"])
        if codigo is None or codigo not in mapa:
            continue
        texto = GLIFO_PARA_TEXTO.get(mapa[codigo])
        if texto is None:
            GLIFOS_DESCONHECIDOS[mapa[codigo]] += 1
        c["text"] = texto or ""


def separar_alternativas(linhas):
    """Acha a última sequência A, B, C, D[, E] no início de linha; o que vem antes é o enunciado.

    Procura de trás para frente porque frases do enunciado também podem começar com "A ".
    """
    inicio = {}
    for letra in "EDCBA":
        limite = min(inicio.values()) if inicio else len(linhas)
        idx = next((i for i in range(limite - 1, -1, -1) if RE_ALTERNATIVA.match(linhas[i])
                    and linhas[i][0] == letra), None)
        if idx is not None:
            inicio[letra] = idx
        elif letra != "E":
            return "\n".join(linhas), [""] * 5
    ordem = sorted(inicio.items(), key=lambda kv: kv[1])
    alternativas = {}
    for n, (letra, idx) in enumerate(ordem):
        fim = ordem[n + 1][1] if n + 1 < len(ordem) else len(linhas)
        alternativas[letra] = " ".join([linhas[idx][2:]] + linhas[idx + 1:fim]).strip()
    return "\n".join(linhas[:ordem[0][1]]), [alternativas.get(l, "") for l in "ABCDE"]


def juntar_paragrafos(texto):
    """Junta as linhas quebradas pela diagramação; mantém marcadores de figura em linha própria."""
    partes = re.split(r"(\[FIG:\d+\])", texto)
    return "\n".join(p if RE_FIGURA.fullmatch(p) else " ".join(p.split()) for p in partes if p.strip())


def separar_questoes(texto):
    """Divide o texto do caderno em {número: (enunciado, [alternativas A..E])}."""
    marcas = list(RE_QUESTAO.finditer(texto))
    questoes = {}
    for i, m in enumerate(marcas):
        fim = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        linhas = [l for l in (RE_ESPACO_LIVRE.sub("", l).strip() for l in texto[m.end():fim].splitlines()) if l]
        enunciado, alternativas = separar_alternativas(linhas)
        questoes[int(m.group(1))] = (juntar_paragrafos(enunciado), [" ".join(a.split()) for a in alternativas])
    return questoes


def ler_gabarito(caminho):
    """Lê a tabela do Inep: linhas "Questão 1 2 3 ..." seguidas de "Gabarito A B — ...".

    Qualquer marca fora de A–E (traço, asterisco) significa questão anulada.
    """
    texto = pdf_para_texto(caminho) if caminho.suffix.lower() == ".pdf" else caminho.read_text()
    gabarito, numeros = {}, []
    for linha in texto.splitlines():
        tokens = linha.split()
        if not tokens:
            continue
        if normalizar(tokens[0]) == "questao":
            numeros = [int(t) for t in tokens[1:] if t.isdigit()]
        elif normalizar(tokens[0]) == "gabarito" and numeros:
            respostas = tokens[1:]
            if len(respostas) != len(numeros):
                raise ValueError(f"{caminho.name}: {len(numeros)} questões e {len(respostas)} respostas na linha")
            for num, resp in zip(numeros, respostas):
                gabarito[num] = resp.upper() if resp.upper() in "ABCDE" and len(resp) == 1 else "ANULADA"
            numeros = []
    if not gabarito:
        # Formato de 2022: tabela em colunas "Questão  Gabarito", com pares número–resposta na mesma linha.
        for linha in texto.splitlines():
            for num, resp in re.findall(r"\b(\d{1,3})\s+(Anulada|ANULADA|[A-E]|[-*—])(?=\s|$)", linha):
                gabarito[int(num)] = resp.upper() if resp.upper() in "ABCDE" and len(resp) == 1 else "ANULADA"
    return gabarito


# ---------------------------------------------------------------- classificação

def classificar_automatico(texto):
    """(grande área, especialidade) do tema da taxonomia com mais palavras-chave encontradas."""
    norm = normalizar(texto)
    melhor = ("A revisar", "A revisar", 0)
    for area, temas in TAXONOMIA.items():
        for tema, chaves in temas.items():
            acertos = sum(1 for c in chaves if re.search(r"\b" + re.escape(c), norm))
            if acertos > melhor[2]:
                melhor = (area, tema, acertos)
    return melhor[:2]


def area_pelo_ciclo(numero):
    return GRANDES_AREAS[(numero - 1) % 5]


def ler_csv(caminho):
    if not caminho.exists():
        return {}
    with caminho.open(encoding="utf-8") as f:
        return {linha["id"]: linha for linha in csv.DictReader(f, delimiter=";")}


def qualificar_incidencia(questoes):
    """Incidência de cada questão pelo tema e pela especialidade nas edições processadas.

    Alta: o tema caiu em 2 ou mais edições, ou a especialidade pesa 4% ou mais da prova.
    Média: a especialidade pesa de 2% a 4%. Baixa: o restante.
    """
    validas = [q for q in questoes if not q["anulada"]]
    edicoes_do_tema, por_esp = {}, {}
    for q in validas:
        if q["tema"]:
            edicoes_do_tema.setdefault(q["tema"], set()).add(q["edicao"])
        por_esp[q["especialidade"]] = por_esp.get(q["especialidade"], 0) + 1
    for q in questoes:
        peso = por_esp.get(q["especialidade"], 0) / max(len(validas), 1)
        repetido = len(edicoes_do_tema.get(q["tema"], ())) >= 2
        q["incidencia"] = "alta" if repetido or peso >= 0.04 else "média" if peso >= 0.02 else "baixa"


# ---------------------------------------------------------------- consolidação

def processar_edicoes():
    revisadas = ler_csv(CLASSIFICACAO)
    dificuldades = ler_csv(QUALIFICACAO)
    questoes, status = [], []
    for ident, exame, edicao, ano in EDICOES:
        prova = PASTA_PROVAS / f"{ident}_prova.pdf"
        gab = next((p for p in (PASTA_PROVAS / f"{ident}_gabarito.pdf", PASTA_PROVAS / f"{ident}_gabarito.txt")
                    if p.exists()), None)
        if not prova.exists():
            situacao = "Pendente: falta o caderno" + (" (gabarito recebido)" if gab else "")
            status.append(dict(id=ident, exame=exame, edicao=edicao, ano=ano, situacao=situacao, questoes=0,
                               gabarito=bool(gab)))
            continue
        leitor = LeitorCaderno(ident)
        extraidas = separar_questoes(leitor.ler(prova))
        gabarito = ler_gabarito(gab) if gab else {}
        for num in sorted(extraidas):
            enunciado, alts = extraidas[num]
            qid = f"{ident}_q{num:03d}"
            area_auto, esp_auto = classificar_automatico(enunciado + " " + " ".join(alts))
            rev = revisadas.get(qid)
            resp = gabarito.get(num, "")
            questoes.append(dict(
                id=qid, exame=exame, edicao=edicao, ano=ano, numero=num,
                area=area_pelo_ciclo(num) if ident in CICLO_CONFERIDO else area_auto,
                especialidade=rev["especialidade"] if rev else esp_auto,
                tema=rev["tema"] if rev else "",
                tipo=rev["tipo"] if rev else "",
                dificuldade=dificuldades.get(qid, {}).get("dificuldade", ""),
                classificacao="revisada" if rev else "automática",
                gabarito="" if resp == "ANULADA" else resp,
                anulada=resp == "ANULADA",
                caso_clinico=bool(RE_IDADE.search(enunciado)),
                enunciado=enunciado,
                alternativas=[a for a in alts if a],
                figuras=[leitor.figuras[int(n) - 1] for n in RE_FIGURA.findall(enunciado)],
            ))
        situacao = "Processada" if gab else "Processada sem gabarito"
        status.append(dict(id=ident, exame=exame, edicao=edicao, ano=ano, situacao=situacao,
                           questoes=len(extraidas), gabarito=bool(gab)))
    qualificar_incidencia(questoes)
    return questoes, status


# ---------------------------------------------------------------- planilha

ESTILO_CAB = (Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="1F4E78"))


def formatar(ws, larguras):
    for i, largura in enumerate(larguras, 1):
        cel = ws.cell(row=1, column=i)
        cel.font, cel.fill = ESTILO_CAB
        cel.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = largura
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions


def gerar_planilha(questoes, status):
    wb = Workbook()
    wp = wb.active
    wp.title = "Provas"
    wp.append(["ID", "Exame", "Edição", "Ano", "Situação", "Nº de questões", "Gabarito", "Arquivos esperados"])
    for s in status:
        wp.append([s["id"], s["exame"], s["edicao"], s["ano"], s["situacao"], s["questoes"],
                   "sim" if s["gabarito"] else "não", f"provas/{s['id']}_prova.pdf e _gabarito.pdf"])
    formatar(wp, [20, 10, 9, 7, 40, 14, 10, 50])

    ws = wb.create_sheet("Questões")
    ws.append(["ID", "Exame", "Edição", "Ano", "Nº", "Grande área", "Especialidade", "Tema", "Tipo de questão",
               "Dificuldade", "Incidência", "Classificação", "Gabarito", "Anulada", "Caso clínico", "Figura/tabela",
               "Enunciado", "A", "B", "C", "D", "E"])
    for q in questoes:
        alts = q["alternativas"] + [""] * (5 - len(q["alternativas"]))
        ws.append([q["id"], q["exame"], q["edicao"], q["ano"], q["numero"], q["area"], q["especialidade"],
                   q["tema"], q["tipo"], q["dificuldade"], q["incidencia"], q["classificacao"],
                   q["gabarito"] or ("ANULADA" if q["anulada"] else ""),
                   "sim" if q["anulada"] else "não", "sim" if q["caso_clinico"] else "não",
                   "sim" if q["figuras"] else "não",
                   RE_FIGURA.sub("[figura/tabela]", q["enunciado"]).replace("\n", " "), *alts])
    formatar(ws, [22, 10, 8, 6, 5, 30, 26, 40, 20, 11, 11, 12, 9, 8, 8, 9, 90, 30, 30, 30, 30, 20])
    n = max(ws.max_row, 2)
    col = {"exame": f"Questões!$B$2:$B${n}", "area": f"Questões!$F$2:$F${n}",
           "esp": f"Questões!$G$2:$G${n}", "tema": f"Questões!$H$2:$H${n}", "tipo": f"Questões!$I$2:$I${n}",
           "dif": f"Questões!$J$2:$J${n}", "inc": f"Questões!$K$2:$K${n}"}
    exames = ["Revalida", "ENAMED"]
    total = len(questoes) or 1

    def resumo(nome, titulo, chave_col, chaves, extra=None):
        """Aba com contagem por exame (fórmulas COUNTIFS, recalculam se a aba Questões for editada)."""
        w = wb.create_sheet(nome)
        w.append(([extra[0]] if extra else []) + [titulo, *exames, "Total", "% do total"])
        k = 2 if extra else 1  # coluna da chave
        letra, c1, c2, ct = (get_column_letter(k + d) for d in range(4))
        for i, chave in enumerate(chaves, 2):
            linha = ([extra[1](chave)] if extra else []) + [chave]
            linha += [f'=COUNTIFS({col[chave_col]},${letra}{i},{col["exame"]},"{ex}")' for ex in exames]
            linha += [f"={c1}{i}+{c2}{i}", f"={ct}{i}/{total}"]
            w.append(linha)
            w.cell(row=i, column=k + 4).number_format = "0.0%"
        formatar(w, ([30] if extra else []) + [50, 12, 12, 10, 12])

    def por_frequencia(campo):
        contagem = {}
        for q in questoes:
            if q[campo]:
                contagem[q[campo]] = contagem.get(q[campo], 0) + 1
        return sorted(contagem, key=lambda c: (-contagem[c], c))

    area_da_esp = {}
    for q in questoes:
        area_da_esp.setdefault(q["especialidade"], {}).setdefault(q["area"], 0)
        area_da_esp[q["especialidade"]][q["area"]] += 1

    resumo("Resumo por área", "Grande área", "area", GRANDES_AREAS + ["A revisar"])
    resumo("Resumo por especialidade", "Especialidade", "esp", por_frequencia("especialidade"),
           extra=("Área predominante", lambda e: max(area_da_esp[e], key=area_da_esp[e].get)))
    resumo("Resumo por tema", "Tema", "tema", por_frequencia("tema"))
    resumo("Resumo por tipo", "Tipo de questão", "tipo", por_frequencia("tipo"))
    resumo("Resumo por dificuldade", "Dificuldade", "dif", ["fácil", "média", "difícil"])
    resumo("Resumo por incidência", "Incidência", "inc", ["alta", "média", "baixa"])
    wb.save(SAIDA_XLSX)


# ---------------------------------------------------------------- app

def exportar_json(questoes, status):
    SAIDA_JSON.parent.mkdir(parents=True, exist_ok=True)
    oficiais = [{**q, "fonte": "inep"} for q in questoes]
    # Questões importadas (residência, ENAMED, inéditas) entram no app só depois da revisão médica.
    externas = []
    if BANCO_EXTERNO.exists():
        externas = [{k: v for k, v in q.items() if k != "impressao"}
                    for q in json.loads(BANCO_EXTERNO.read_text(encoding="utf-8"))["questoes"] if q["revisao"] == "revisada"]
    dados = {"areas": GRANDES_AREAS, "edicoes": status, "questoes": oficiais + externas}
    SAIDA_JSON.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    questoes, status = processar_edicoes()
    gerar_planilha(questoes, status)
    exportar_json(questoes, status)
    feitas = [s for s in status if s["situacao"].startswith("Processada")]
    revisadas = sum(q["classificacao"] == "revisada" for q in questoes)
    print(f"{len(questoes)} questões de {len(feitas)}/{len(status)} edições ({revisadas} com classificação revisada).")
    print(f"Planilha: {SAIDA_XLSX.name} | App: {SAIDA_JSON.relative_to(BASE)}")
    pendentes = [s["id"] for s in status if s["situacao"].startswith("Pendente")]
    if pendentes:
        print("Pendentes (coloque os PDFs em provas/):", ", ".join(pendentes))


if __name__ == "__main__":
    sys.exit(main())
