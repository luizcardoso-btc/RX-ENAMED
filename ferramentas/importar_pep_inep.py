"""Importa as estações oficiais da prova de habilidades clínicas do Revalida (Inep).

Para cada edição em ferramentas/fontes_habilidades.csv, lê:
  - o caderno da prova (instruções ao participante e impressos entregues na estação);
  - o PEP (síntese, respostas do paciente simulado, impressos liberados e critérios com pontuação).
e grava conteudo/estacoes-inep/inep-<edicao>-eNN.json no formato v2 (compartilhado/estacoes.js).

Tudo vem do texto dos documentos oficiais: nada é inventado. Estação que não fecha 10 pontos, sem roteiro do
paciente ou sem instruções fica com status "revisao" e a lista de pendências (aparece só para o administrador).

Uso: python3 -I ferramentas/importar_pep_inep.py   (os PDFs ficam em provas/habilidades/, fora do git)
"""
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber
import pymupdf

BASE = Path(__file__).resolve().parent.parent
FONTES = BASE / "ferramentas" / "fontes_habilidades.csv"
PASTA_PDF = BASE / "provas" / "habilidades"
SAIDA = BASE / "conteudo" / "estacoes-inep"
PASTA_IMG = BASE / "app" / "public" / "img" / "estacoes"

AREAS = [
    ("Ginecologia e Obstetrícia", ("GINECOLOGIA", "OBSTETR")),
    ("Medicina de Família e Comunidade / Saúde Coletiva", ("FAMÍLIA", "FAMILIA", "COLETIVA", "PREVENTIVA")),
    ("Pediatria", ("PEDIATRIA",)),
    ("Cirurgia", ("CIRURGIA",)),
    ("Clínica Médica", ("CLÍNICA MÉDICA", "CLINICA MEDICA")),
]
ESPECIALIDADE_PADRAO = {
    "Clínica Médica": "Clínica Médica", "Cirurgia": "Cirurgia geral", "Pediatria": "Pediatria",
    "Ginecologia e Obstetrícia": "Ginecologia e Obstetrícia", "Medicina de Família e Comunidade / Saúde Coletiva": "Medicina de Família e Comunidade",
}

RE_CABECALHO = re.compile(
    r"^\s*(\d{4}\s*/?\s*\d\s*|Revalida\s*\d{4}.*|Exame Nacional de Revalida.*|Expedidos por.*|AVALIA[ÇC][ÃA]O DE HABILIDADES.*"
    r"|ESTA[ÇC][ÃA]O\s*\d+\s*|(Á|A)REA:.*|CL[ÍI]NICA M[ÉE]DICA|CIRURGIA( GERAL)?|PEDIATRIA|GINECOLOGIA E OBSTETR[ÍI]CIA"
    r"|MEDICINA DE FAM[ÍI]LIA E COMUNIDADE.*|MEDICINA PREVENTIVA.*|SA[ÚU]DE COLETIVA|S[ÍI]NTESE|IMPRESSO|PEP|P[ÁA]GINA\s*\d+\s*/\s*\d+.*"
    r"|.*MINIST[ÉE]RIO DA.*|EDUCA[ÇC][ÃA]O|li 11:r.*|[^\w•●▪◦]{0,3}|DESEMPENHO OBSERVADO|ITENS DE DESEMPENHO.*|Inadequado\s+Adequado|adequado"
    r"|Parcialmente|INADEQUADO\s+ADEQUADO|ADEQUADO|PARCIALMENTE|S[ÍI]NTESE DA ESTA[ÇC][ÃA]O\s*/\s*ORIENTA[ÇC][ÕO]ES AO AVALIADOR"
    r"|PADR[ÃA]O ESPERADO DE PROCEDIMENTOS\s*[–—-]?\s*(DEFINITIVO|PRELIMINAR)?\s*)\s*$", re.IGNORECASE)
RE_ESTACAO = re.compile(r"ESTA[ÇC][ÃA]O\s*(\d{1,2})\b")
RE_PONTOS = re.compile(r"(?<![\d,])(0(?:,0+)?)\s+(\d+,\d+|\d)(?:\s+(\d+,\d+|\d))?(?![\d,])")
BALAS = "•●▪◦\uf0b7\uf0a7\u25aa"


def norm(t):
    t = unicodedata.normalize("NFD", str(t or "").lower())
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", "".join(c for c in t if not unicodedata.combining(c)))).strip()


def area_de(texto):
    m = re.search(r"(?:ÁREA|Área|AREA)\s*:\s*([^\n|]+)", texto)
    if m:
        alvo = m.group(1).upper()
    else:
        # Sem "ÁREA:", só vale uma linha de cabeçalho que seja exatamente o nome da área ("CLÍNICA MÉDICA").
        cab = [l.strip().upper() for l in texto.split("\n")[:14]]
        alvo = next((l for l in cab if any(c in l for _, cs in AREAS for c in cs) and len(l) < 60 and l == l.upper()), "")
    for nome, chaves in AREAS:
        if any(c in alvo for c in chaves):
            return nome
    return None


def limpar_quimica(t):
    t = re.sub(r"\b(O|CO|SatO|SpO|PaO|PaCO|FiO)\s*:\s", lambda m: f"{m.group(1)}₂: ", t)
    t = re.sub(r"\bHCO\s*[-–]?\s*(?=\d|:)", "HCO₃⁻ ", t)
    return t


def linhas_limpas(texto):
    saida = []
    for l in texto.split("\n"):
        if RE_CABECALHO.match(l) or re.fullmatch(r"\s*[23]\s*", l):
            continue
        saida.append(l.rstrip())
    return limpar_quimica("\n".join(saida))


def juntar(texto):
    """Junta linhas quebradas no meio da frase, mantendo os marcadores de lista."""
    t = re.sub(r"[ \t]+", " ", texto)
    t = re.sub(rf"\n\s*([{BALAS}])\s*\n", r"\n\1 ", t)
    return t


def balas(texto):
    t = juntar(texto)
    partes = re.split(rf"[{BALAS}]", t)
    itens = []
    for p in partes[1:]:
        p = re.sub(r"\s+", " ", p).strip(" ;,")
        p = re.sub(r"[;,]?\s+e$", "", p).strip(" ;,")
        if len(p) > 2:
            itens.append(p)
    return itens


def trecho(texto, inicio, fim):
    m = re.search(inicio, texto, re.IGNORECASE | re.S)
    if not m:
        return ""
    resto = texto[m.end():]
    f = re.search(fim, resto, re.IGNORECASE | re.S)
    return resto[: f.start()] if f else resto


def paginas_por_estacao(caminho, marcador_inicio=None):
    """Agrupa as páginas por estação: pelo número no cabeçalho ou pelo início das instruções."""
    grupos, atual = {}, None
    with pdfplumber.open(caminho) as pdf:
        for i, pg in enumerate(pdf.pages):
            texto = pg.extract_text() or ""
            topo = "\n".join(texto.split("\n")[:9])
            m = RE_ESTACAO.search(topo)
            if marcador_inicio and re.search(marcador_inicio, texto, re.IGNORECASE):
                atual = (max(grupos) + 1) if grupos else 1
                if m:
                    atual = int(m.group(1))
            elif m and not marcador_inicio:
                atual = int(m.group(1))
            elif m and marcador_inicio and atual is None:
                atual = int(m.group(1))
            if atual is None:
                continue
            grupos.setdefault(atual, []).append((i, texto, pg))
    return grupos


# ------------------------------------------------------------------ PEP

def ler_criterios(texto_pep):
    # Subtítulos de seção em maiúsculas ("ATENDIMENTO INICIAL AO TRAUMA") não fazem parte de nenhum critério.
    texto_pep = "\n".join(l for l in texto_pep.split("\n")
                           if not (l.strip() and l.strip() == l.strip().upper() and ":" not in l and len(l.strip()) < 90
                                   and re.search(r"[A-ZÁÉÍÓÚ]{4}", l) and not re.match(r"\s*(OU|E)\s*$", l)))
    blocos = re.split(r"\n\s*(?=\d{1,2}\.\s*[A-Za-zÁÉÍÓÚáéíóú(])", "\n" + texto_pep)
    criterios = []
    esperado = 1
    for b in blocos:
        m = re.match(r"\s*(\d{1,2})\.\s*(.*)", b, re.S)
        if not m or int(m.group(1)) != esperado:
            if criterios and b.strip():
                criterios[-1]["_resto"] += "\n" + b
            continue
        esperado += 1
        criterios.append({"_num": int(m.group(1)), "_texto": m.group(2), "_resto": ""})
    saida = []
    for c in criterios:
        bruto = c["_texto"] + c["_resto"]
        p = RE_PONTOS.search(bruto)
        if not p:
            # Numeração falsa (texto do critério anterior que começa com "16."): volta para o anterior.
            if saida:
                saida[-1]["evidencia"] = (saida[-1]["evidencia"] + " " + re.sub(r"\s+", " ", f"{c['_num']}. {bruto}")).strip()
                continue
            return None, f"critério {c['_num']} sem pontuação"
        valores = [float(x.replace(",", ".")) for x in p.groups() if x is not None]
        sem_pontos = (bruto[: p.start()] + " " + bruto[p.end():])
        sem_pontos = re.sub(r"\s+", " ", sem_pontos).strip()
        partes = re.split(r"\b(Parcialmente adequado|Inadequado|Adequado)\s*:", sem_pontos)
        descricao = partes[0].strip()
        niveis = {}
        for rot, txt in zip(partes[1::2], partes[2::2]):
            niveis[rot.lower()] = txt.strip()
        # Anexos do critério ("CONSIDERAR TÉCNICA CORRETA...") viram a evidência observável.
        evidencia = ""
        for chave in list(niveis):
            corte = re.search(r"\b(CONSIDERAR|OBSERVA[ÇC][ÃA]O|Observação|ATENÇÃO|\(Referência)", niveis[chave])
            if corte:
                evidencia = (evidencia + " " + niveis[chave][corte.start():]).strip()
                niveis[chave] = niveis[chave][: corte.start()].strip()
        peso = max(valores)
        parcial = sorted(valores)[1] if len(valores) == 3 else None
        saida.append({
            "id": f"c{c['_num']:02d}",
            "descricao": descricao,
            "peso": peso,
            "pontos": {"inadequado": 0, "parcial": parcial, "adequado": peso},
            "integral": niveis.get("adequado", ""),
            "parcial": niveis.get("parcialmente adequado") if parcial is not None else None,
            "inadequado": niveis.get("inadequado", ""),
            "evidencia": evidencia,
            "origem": "oficial",
            "critico": False,
        })
    return saida, None


def ler_pep(paginas):
    bruto = "\n".join(t for _, t, _ in paginas)
    area = area_de(bruto)
    m = re.search(r"ITENS DE DESEMPENHO|DESEMPENHO OBSERVADO", bruto)
    if not m:
        m = None
        for x in re.finditer(r"PADR[ÃA]O ESPERADO DE PROCEDIMENTOS", bruto):
            m = x
    sintese_bruta = bruto[: m.start()] if m else bruto
    pep_bruto = bruto[m.start():] if m else ""
    sintese = juntar(linhas_limpas(sintese_bruta))
    pep_txt = linhas_limpas(pep_bruto)
    criterios, erro = ler_criterios(pep_txt) if pep_txt else (None, "PEP não encontrado")

    historia = trecho(sintese, r"S[ÍI]NTESE DA ESTA[ÇC][ÃA]O|DESCRI[ÇC][ÃA]O DO CASO",
                      r"A esta[çc][ãa]o (teve|tem) como objetivo|OBJETIVOS DA AVALIA|A partir dos questionamentos|O\(A\) participante deveria")
    historia = re.sub(r"\s+", " ", re.sub(r"(?i)^\s*/?\s*ORIENTA[ÇC][ÕO]ES AO AVALIADOR|CEN[ÁA]RIO DE ATENDIMENTO.*?DESCRI[ÇC][ÃA]O DO CASO", "", historia, flags=re.S)).strip()
    roteiro_txt = trecho(sintese, r"(poderia|pode|dever[áa]|deve)\s+informar[^:\n]{0,40}\s+que\s*:",
                         r"Ap[óo]s os questionamentos|IMPRESSOS|No decorrer do atendimento|O desempenho do|REFER[ÊE]NCIAS|caso o\(a\) participante")
    perguntas_txt = trecho(sintese, r"(perguntaria|perguntar[áa]|dever[áa] perguntar|poder[áa] perguntar|pode perguntar|deve perguntar)\s*:",
                           r"O desempenho|IMPRESSOS|REFER[ÊE]NCIAS|Ap[óo]s os questionamentos|PADR[ÃA]O")
    impressos_txt = trecho(sintese, r"(seguintes impressos|receber os seguintes|pode receber)", r"No decorrer|REFER[ÊE]NCIAS|O desempenho|PADR[ÃA]O|A partir dos")
    objetivos_txt = trecho(sintese, r"deveria ser capaz de\s*:|executar as seguintes tarefas\s*:|Al[ée]m disso, o\(a\) participante deveria ser capaz de\s*:",
                           r"A partir dos questionamentos|RESPOSTAS A POSS|IMPRESSOS")
    referencias_txt = trecho(bruto, r"REFER[ÊE]NCIAS( BIBLIOGR[ÁA]FICAS)?", r"PADR[ÃA]O ESPERADO|ITENS DE DESEMPENHO|$")
    refs, atual = [], ""
    for l in linhas_limpas(referencias_txt).split("\n"):
        l = l.strip()
        if not l:
            continue
        atual = f"{atual} {l}".strip()
        if re.search(r"[.]$", l) and not re.search(r"(doi|https?:|www)\S*\.$", l):
            refs.append(atual)
            atual = ""
    if atual:
        refs.append(atual)
    refs = [re.sub(r"\s+", " ", x) for x in refs if len(x) > 15][:8]
    return {
        "area": area, "historia": historia[:2500], "roteiro": balas(roteiro_txt), "perguntas": balas(perguntas_txt),
        "impressos": balas(impressos_txt), "objetivos": balas(objetivos_txt), "criterios": criterios, "erro": erro, "referencias": refs,
    }


# ------------------------------------------------------------------ prova (instruções e impressos)

def imagem_grande(pg):
    area_pag = float(pg.width * pg.height)
    maior = 0.0
    for im in pg.images:
        maior = max(maior, (float(im["x1"]) - float(im["x0"])) * (float(im["bottom"]) - float(im["top"])) / area_pag)
    return maior > 0.12


def ler_prova(paginas, doc_mupdf, ident):
    primeira = paginas[0][1]
    corpo = juntar(linhas_limpas(primeira))
    cenario = trecho(corpo, r"CEN[ÁA]RIO DE (ATUA[ÇC][ÃA]O|ATENDIMENTO)", r"DESCRI[ÇC][ÃA]O DO CASO")
    descricao = trecho(corpo, r"DESCRI[ÇC][ÃA]O DO CASO", r"Nos \d+ minutos|deverá executar|você deverá")
    tarefas = trecho(corpo, r"(tarefas\s+a\s+seguir|seguintes\s+tarefas)[^:]*:", r"ATEN[ÇC][ÃA]O!|ATEN[ÇC][ÃA]O:|$")
    instr_extra = re.findall(r"(ATEN[ÇC][ÃA]O!?[^\n]*(?:\n(?![{}])[^\n]*){{0,3}})".format(BALAS), corpo)
    impressos = []
    for (i, texto, pg) in paginas[1:]:
        limpo = linhas_limpas(texto)
        titulos = list(re.finditer(r"IMPRESSO\s*[–—-]+\s*([^\n]+)", texto))
        imagem = None
        if imagem_grande(pg):
            PASTA_IMG.mkdir(parents=True, exist_ok=True)
            nome = f"{ident}-p{i + 1:02d}.jpg"
            pix = doc_mupdf[i].get_pixmap(dpi=90)
            pix.save(str(PASTA_IMG / nome), jpg_quality=72)
            imagem = f"img/estacoes/{nome}"
        if not titulos:
            if imagem:
                impressos.append({"titulo": "Impresso com imagem", "texto": re.sub(r"\s+", " ", limpo).strip(), "imagem": imagem, "pagina": i + 1})
            elif impressos and limpo.strip():
                impressos[-1]["texto"] += "\n" + limpo.strip()
            continue
        for k, t in enumerate(titulos):
            fim = titulos[k + 1].start() if k + 1 < len(titulos) else len(texto)
            conteudo = linhas_limpas(texto[t.end():fim]).strip()
            impressos.append({"titulo": re.sub(r"\s+", " ", t.group(1)).strip(" .:"), "texto": conteudo,
                              "imagem": imagem if k == len(titulos) - 1 else None, "pagina": i + 1})
    return {
        "area": area_de(primeira), "cenario": re.sub(r"\s+", " ", cenario).strip(), "descricao": balas(descricao) or [re.sub(r"\s+", " ", descricao).strip()],
        "tarefas": balas(tarefas) or [re.sub(r"\s+", " ", x).strip(" ;") for x in re.split(r"\n\s*\d{1,2}\.\s*", "\n" + tarefas) if x.strip()], "atencao": [re.sub(r"\s+", " ", a).strip() for a in instr_extra][:2], "impressos": impressos,
    }


# ------------------------------------------------------------------ montagem

TOPICOS = [
    ("Identificação", r"\b(chama-se|tem \d+ anos|nome|casad|solteir|trabalha|estudante|profiss|mora)\b"),
    ("Início e evolução", r"\b(h[áa] \d+|come[çc]ou|in[íi]cio|desde|surgiu|evolu)\w*"),
    ("Características do quadro", r"\b(dor|intensidade|irradia|localiza|tipo|car[áa]ter)\w*"),
    ("Fatores de melhora e piora", r"\b(melhora|piora|alivia|agrava|cede)\w*"),
    ("Sintomas associados", r"\b(febre|n[áa]usea|v[ôo]mito|diarreia|tosse|falta de ar|dispneia|sangr|urina|fezes|apetite|peso)\w*"),
    ("Antecedentes e comorbidades", r"\b(comorbidade|doen[çc]a|hipertens|diabet|cirurgia|interna|alergi)\w*"),
    ("Medicamentos", r"\b(medica|rem[ée]dio|toma|uso de|anticoncep|comprimido)\w*"),
    ("Hábitos de vida", r"\b(fuma|tabag|etilis|[áa]lcool|bebe|drogas|atividade f[íi]sica)\w*"),
    ("Antecedentes familiares", r"\b(pai|m[ãa]e|fam[íi]lia|irm[ãa]o|av[óô])\w*"),
    ("Antecedentes gineco-obstétricos", r"\b(menstrua|gesta|gravidez|parto|aborto|contracep|sexual)\w*"),
    ("Vacinação e desenvolvimento", r"\b(vacina|caderneta|desenvolv|mamada|aleitamento)\w*"),
]


def topico_de(frase, usados):
    for rotulo, rx in TOPICOS:
        if re.search(rx, frase, re.IGNORECASE):
            n = usados.get(rotulo, 0) + 1
            usados[rotulo] = n
            return rotulo if n == 1 else f"{rotulo} ({n})"
    n = usados.get("Outras informações", 0) + 1
    usados["Outras informações"] = n
    return f"Outras informações ({n})"


def chaves_dos_impressos(regras):
    """'IMPRESSO – EXAME FÍSICO DO APARELHO LOCOMOTOR, caso peça exame do quadril OU teste de Schober' -> nome e chaves."""
    saida = []
    for r in regras:
        m = re.search(r"IMPRESSO\s*[–—-]+\s*([^,;]+?)(?:,|\s+caso|\s+ao|\s+ap[óo]s|$)(.*)", r, re.IGNORECASE)
        if not m:
            continue
        nome, cond = m.group(1).strip(), m.group(2)
        frases = re.split(r"\bOU\b|\bou\b|,|;", re.sub(r"(?i)\b(caso|solicite|peça para realizar|peça|pedir|solicitar|realizar|afirmasse que realizou|informar que deseja)\b", " ", cond))
        chaves = sorted({re.sub(r"\s+", " ", f).strip(" .()") for f in frases if len(f.strip()) > 3})
        saida.append({"nome": nome, "chaves": [c.lower() for c in chaves][:20]})
    return saida


def montar(ed, rotulo, url_prova, url_pep, situacao, num, pep, prova):
    ident = f"inep-{ed}-e{num:02d}"
    pend = []
    area = pep["area"] or (prova or {}).get("area")
    if not area:
        pend.append("área não identificada")
        area = "Clínica Médica"
    if prova and prova.get("area") and pep["area"] and prova["area"] != pep["area"]:
        pend.append(f"área diferente entre caderno ({prova['area']}) e PEP ({pep['area']})")
    criterios = pep["criterios"] or []
    if pep["erro"]:
        pend.append(pep["erro"])
    soma = round(sum(c["peso"] for c in criterios), 3)
    if criterios and abs(soma - 10) > 0.001:
        pend.append(f"critérios somam {soma}")
    if not prova:
        pend.append("caderno da prova não encontrado para esta estação")
    if len(pep["roteiro"]) < 3:
        pend.append("o documento não traz o roteiro do paciente simulado")
    desc = (prova or {}).get("descricao", [])
    texto_desc = " ".join(desc)
    queixa = re.search(r"queixa (?:principal )?de ([^.;]+)", texto_desc, re.IGNORECASE)
    titulo = (queixa.group(1).strip() if queixa else (desc[0] if desc else f"Estação {num}"))
    titulo = re.sub(r"\s+", " ", titulo)[:90]
    titulo = titulo[:1].upper() + titulo[1:]
    pac = re.search(r"(?:atender|atenderá|atendimento (?:a|ao|à))\s+(?:o|a|um|uma)?\s*(?:paciente|criança|gestante|lactente|adolescente|senhor|senhora|mulher|homem|menino|menina)?\s*([A-ZÁÉÍÓÚ][a-záéíóúãõç]+)?,?\s*(?:de\s+)?(\d{1,3})\s*(anos|meses|dias)", texto_desc)
    nome = (pac.group(1) if pac and pac.group(1) else "Paciente")
    idade = f"{pac.group(2)} {pac.group(3)}" if pac else None
    usados = {}
    roteiro = [{"topico": topico_de(b, usados), "resposta": b} for b in pep["roteiro"]]
    regras = chaves_dos_impressos(pep["impressos"])
    exame_fisico, exames = [], []
    for imp in (prova or {}).get("impressos", []):
        item = {"item": imp["titulo"].capitalize() if imp["titulo"].isupper() else imp["titulo"], "achado" if True else "": imp["texto"].strip()}
        chaves, melhor = [], 0.0
        for r in regras:
            a, b = set(norm(r["nome"]).split()), set(norm(imp["titulo"]).split())
            sim = len(a & b) / max(1, len(a | b))
            if sim > melhor and sim >= 0.6:
                chaves, melhor = r["chaves"], sim
        alvo = exame_fisico if re.search(r"EXAME F[ÍI]SICO|SINAIS VITAIS|EXAME DO|EXAME DA|EXAME OBST|EXAME GINEC|EXAME NEURO|INSPE", imp["titulo"], re.IGNORECASE) else exames
        registro = {"item": item["item"], ("achado" if alvo is exame_fisico else "resultado"): imp["texto"].strip() or "Ver a imagem do impresso."}
        if imp.get("imagem"):
            registro["imagem"] = imp["imagem"]
        if chaves:
            registro["chaves"] = chaves
        alvo.append(registro)
    diag = next((c["descricao"] for c in criterios if re.search(r"hip[óo]tese diagn[óo]stica|diagn[óo]stico", c["descricao"], re.IGNORECASE)), "")
    instrucoes = [*desc, *((prova or {}).get("atencao") or [])]
    estacao = {
        "id": ident, "versao": 1, "status": "publicada" if not pend else "revisao", "origem": "oficial",
        "fonte": {"edicao": rotulo, "estacao": num, "documento": f"Padrão Esperado de Procedimentos ({situacao})", "url": url_pep, "prova": url_prova, "situacao": situacao},
        "area": area, "especialidade": ESPECIALIDADE_PADRAO.get(area, area), "tema": titulo, "titulo": titulo,
        "duracaoMin": 10, "cenario": (prova or {}).get("cenario", ""), "instrucoes": instrucoes, "tarefas": (prova or {}).get("tarefas", []),
        "historia": pep["historia"],
        "paciente": {"nome": nome, "idade": idade, "sexo": "", "ocupacao": "", "perfil": "Paciente simulado do Revalida: responde só ao que for perguntado, com as informações do roteiro oficial.",
                     "abertura": "Bom dia, doutor(a).", "roteiro": roteiro, "perguntasDoPaciente": pep["perguntas"]} if roteiro else None,
        "exameFisico": exame_fisico, "exames": exames,
        "diagnostico": diag, "condutaEsperada": [], "procedimentos": pep["objetivos"],
        "pep": criterios, "referencias": pep["referencias"] or [f"Inep. Revalida – {rotulo}: caderno da prova de habilidades clínicas e Padrão Esperado de Procedimentos."],
        "pendencias": pend,
    }
    if estacao["status"] == "publicada" and not estacao["tarefas"]:
        estacao["status"] = "revisao"
        estacao["pendencias"].append("tarefas do participante não encontradas no caderno")
    return estacao


def _palavras(t):
    return {w[:6] for w in norm(t).split() if len(w) >= 4}


def parear(peps, cadernos):
    """Caderno de cada estação do PEP pelo conteúdo (idade, queixa, achados), não pela posição:
    uma página de instruções só com imagem desloca a numeração do caderno."""
    notas = []
    for num, p in peps.items():
        alvo = _palavras(" ".join([p["historia"], *p["roteiro"], *p["impressos"]]))
        for k, c in cadernos.items():
            fonte = _palavras(" ".join([c["cenario"], *c["descricao"], *(i["titulo"] + " " + i["texto"] for i in c["impressos"])]))
            if not alvo or not fonte:
                continue
            comum = len(alvo & fonte) / (len(alvo) * len(fonte)) ** 0.5
            if p["area"] and c["area"] and p["area"] != c["area"]:
                continue
            mesma_area = p["area"] and c["area"] == p["area"]
            notas.append((comum + (0.05 if mesma_area else 0) + (0.02 if num == k else 0), num, k))
    pares, usados = {}, set()
    for nota, num, k in sorted(notas, reverse=True):
        if num in pares or k in usados or nota < 0.12:
            continue
        pares[num] = k
        usados.add(k)
    # Sem texto para comparar (PEP só com critérios): usa a mesma posição, se estiver livre.
    for num in peps:
        if num not in pares and num in cadernos and num not in usados:
            pares[num] = num
            usados.add(num)
    return pares


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    resumo = []
    for linha in csv.DictReader(FONTES.open(encoding="utf-8"), delimiter=";"):
        ed = linha["edicao"]
        f_prova, f_pep = PASTA_PDF / f"{ed}_prova.pdf", PASTA_PDF / f"{ed}_pep.pdf"
        if not (f_prova.exists() and f_pep.exists()):
            resumo.append((ed, 0, 0, "PDFs ausentes"))
            continue
        peps = paginas_por_estacao(f_pep)
        if not peps or sum(len((t or "").strip()) for g in peps.values() for _, t, _ in g) < 500:
            resumo.append((ed, 0, 0, "PEP sem texto ou sem marcação de estação (digitalizado ou formato diferente)"))
            continue
        provas = paginas_por_estacao(f_prova, r"INSTRU[ÇC][ÕO]ES (PARA O\(A\) PARTICIPANTE|AO PARTICIPANTE|AO\(À\) PARTICIPANTE)")
        doc = pymupdf.open(f_prova)
        publicadas = 0
        lidos = {num: ler_pep(peps[num]) for num in sorted(peps)}
        cadernos = {k: ler_prova(g, doc, f"inep-{ed}-c{k:02d}") for k, g in provas.items()}
        pares = parear(lidos, cadernos)
        for num in sorted(peps):
            pep = lidos[num]
            prova = cadernos.get(pares.get(num))
            e = montar(ed, linha["rotulo"], linha["url_prova"], linha["url_pep"], linha["situacao_pep"], num, pep, prova)
            (SAIDA / f"{e['id']}.json").write_text(json.dumps(e, ensure_ascii=False, indent=1), encoding="utf-8")
            publicadas += e["status"] == "publicada"
        resumo.append((ed, len(peps), publicadas, ""))
    for ed, n, p, obs in resumo:
        print(f"{ed:10s} estações {n:2d}  publicadas {p:2d}  {obs}")


if __name__ == "__main__":
    sys.exit(main())
