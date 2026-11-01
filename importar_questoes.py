"""Importa questões em massa (provas de residência, ENAMED, questões inéditas) para o banco do RX Revalida.

É o caminho para passar das ~2.000 questões oficiais do Revalida às 100 mil do plano: equipes e revisores
preenchem planilhas no formato de importar/modelo_questoes.csv e este script valida, remove duplicatas
e gera importar/banco_externo.json. O pipeline (pipeline.py) junta ao banco do app só as questões com
revisao = "revisada".

Uso:
    1. Salve as planilhas (.csv com ponto e vírgula, UTF-8, ou .xlsx) em importar/entrada/.
    2. python3 importar_questoes.py
    3. Confira importar/relatorio_importacao.csv (linhas recusadas e o motivo).
    4. python3 pipeline.py  (junta as revisadas ao banco do app)

Colunas (veja importar/README.md):
    fonte        revalida | enamed | residencia | inedita
    banca        quem aplicou a prova (ex.: ENARE, SUS-SP, USP) ou "RX" para inéditas
    ano, edicao, numero
    area         uma das 5 grandes áreas do Inep
    especialidade, tema, tipo, dificuldade (fácil, média, difícil)
    enunciado    texto completo; use [FIG:1] onde houver figura
    A..E         alternativas (4 ou 5; deixe E vazia em provas de 4 alternativas)
    gabarito     A a E, ou "anulada"
    comentario   explicação da resposta (obrigatória para inéditas)
    revisao      pendente | revisada
    revisor      nome do médico revisor (obrigatório quando revisada)
    origem       de onde veio (URL do caderno oficial, ou "autoral" para inéditas)
"""

import csv
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

BASE = Path(__file__).parent
PASTA = BASE / "importar"
ENTRADA = PASTA / "entrada"
SAIDA = PASTA / "banco_externo.json"
RELATORIO = PASTA / "relatorio_importacao.csv"
OFICIAL = BASE / "app" / "public" / "data" / "questoes.json"

COLUNAS = ["fonte", "banca", "ano", "edicao", "numero", "area", "especialidade", "tema", "tipo", "dificuldade",
           "enunciado", "A", "B", "C", "D", "E", "gabarito", "comentario", "revisao", "revisor", "origem"]
FONTES = {"revalida", "enamed", "residencia", "inedita"}
AREAS = ["Clínica Médica", "Cirurgia", "Pediatria", "Ginecologia e Obstetrícia",
         "Medicina de Família e Comunidade / Saúde Coletiva"]
TIPOS = {"Conceito/teoria", "Conduta", "Cálculo", "Diagnóstico", "Diagnóstico + conduta", "Exame complementar",
         "Interpretação de dados", "Legislação/política"}
DIFICULDADES = {"", "fácil", "média", "difícil"}


def normalizar(texto):
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


def slug(texto):
    return re.sub(r"\s+", "-", normalizar(texto)) or "x"


def impressao(enunciado, alternativas):
    """Identifica a mesma questão mesmo com espaços, acentos ou pontuação diferentes."""
    return hashlib.sha1(normalizar(enunciado + " " + " ".join(alternativas)).encode()).hexdigest()


def ler_planilha(caminho):
    if caminho.suffix.lower() == ".xlsx":
        from openpyxl import load_workbook
        folha = load_workbook(caminho, read_only=True, data_only=True).active
        linhas = list(folha.iter_rows(values_only=True))
        cabecalho = [str(c or "").strip() for c in linhas[0]]
        return [dict(zip(cabecalho, ["" if v is None else str(v) for v in linha])) for linha in linhas[1:]]
    with caminho.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def validar(linha):
    """Devolve (questão, None) ou (None, motivo)."""
    v = {c: (linha.get(c) or "").strip() for c in COLUNAS}
    faltam = [c for c in COLUNAS if c not in linha]
    if faltam:
        return None, f"colunas ausentes: {', '.join(faltam)}"
    problemas = []
    if v["fonte"] not in FONTES:
        problemas.append(f"fonte '{v['fonte']}' (use {', '.join(sorted(FONTES))})")
    if not v["banca"]:
        problemas.append("banca vazia")
    if not re.fullmatch(r"(19|20)\d\d", v["ano"]):
        problemas.append(f"ano '{v['ano']}'")
    if not v["numero"].isdigit():
        problemas.append(f"número '{v['numero']}'")
    if v["area"] not in AREAS:
        problemas.append(f"área '{v['area']}'")
    if not v["especialidade"]:
        problemas.append("especialidade vazia")
    if v["tipo"] and v["tipo"] not in TIPOS:
        problemas.append(f"tipo '{v['tipo']}'")
    if v["dificuldade"] not in DIFICULDADES:
        problemas.append(f"dificuldade '{v['dificuldade']}'")
    if len(v["enunciado"]) < 30:
        problemas.append("enunciado curto demais")
    alternativas = [v[l] for l in "ABCDE" if v[l]]
    if len(alternativas) < 4 or any(not v[l] for l in "ABCD"):
        problemas.append("precisa de pelo menos 4 alternativas (A a D)")
    gabarito = v["gabarito"].upper()
    anulada = gabarito == "ANULADA"
    if not anulada and gabarito not in "ABCDE"[:len(alternativas)]:
        problemas.append(f"gabarito '{v['gabarito']}'")
    if v["revisao"] not in {"pendente", "revisada"}:
        problemas.append(f"revisão '{v['revisao']}' (use pendente ou revisada)")
    if v["revisao"] == "revisada" and not v["revisor"]:
        problemas.append("revisada sem revisor")
    if v["fonte"] == "inedita" and not v["comentario"]:
        problemas.append("inédita sem comentário")
    if not v["origem"]:
        problemas.append("origem vazia")
    if problemas:
        return None, "; ".join(problemas)

    id_ = f"{v['fonte']}_{slug(v['banca'])}_{v['ano']}{('-' + slug(v['edicao'])) if v['edicao'] else ''}_q{int(v['numero']):03d}"
    return {
        "id": id_,
        "exame": v["banca"],
        "fonte": v["fonte"],
        "edicao": v["edicao"] or v["ano"],
        "ano": int(v["ano"]),
        "numero": int(v["numero"]),
        "area": v["area"],
        "especialidade": v["especialidade"],
        "tema": v["tema"],
        "tipo": v["tipo"],
        "dificuldade": v["dificuldade"] or None,
        "classificacao": "revisada" if v["revisao"] == "revisada" else "importada",
        "gabarito": "" if anulada else gabarito,
        "anulada": anulada,
        "caso_clinico": bool(re.search(r"\b\d{1,3}\s+(anos|meses|dias)\b", v["enunciado"], re.I)),
        "enunciado": v["enunciado"],
        "alternativas": alternativas,
        "figuras": [],
        "comentario": v["comentario"],
        "revisao": v["revisao"],
        "revisor": v["revisor"],
        "origem": v["origem"],
        "impressao": impressao(v["enunciado"], alternativas),
    }, None


def main():
    ENTRADA.mkdir(parents=True, exist_ok=True)
    arquivos = sorted(p for p in ENTRADA.iterdir() if p.suffix.lower() in {".csv", ".xlsx"})
    if not arquivos:
        print(f"Nenhuma planilha em {ENTRADA.relative_to(BASE)}/. Use o modelo importar/modelo_questoes.csv.")
        return 0

    # Questões oficiais já no banco também contam para a checagem de duplicatas.
    vistas = {}
    if OFICIAL.exists():
        for q in json.loads(OFICIAL.read_text(encoding="utf-8"))["questoes"]:
            if q.get("fonte", "inep") == "inep":
                vistas[impressao(q["enunciado"], q["alternativas"])] = q["id"]

    aceitas, recusas, ids = [], [], set()
    for arquivo in arquivos:
        for n, linha in enumerate(ler_planilha(arquivo), start=2):
            if not any((valor or "").strip() for valor in linha.values()):
                continue
            questao, motivo = validar(linha)
            if questao and questao["impressao"] in vistas:
                questao, motivo = None, f"duplicada de {vistas[questao['impressao']]}"
            if questao and questao["id"] in ids:
                questao, motivo = None, f"id repetido {questao['id']} (mesma banca, ano e número)"
            if questao:
                vistas[questao["impressao"]] = questao["id"]
                ids.add(questao["id"])
                aceitas.append(questao)
            else:
                recusas.append({"arquivo": arquivo.name, "linha": n, "motivo": motivo})

    SAIDA.write_text(json.dumps({"questoes": aceitas}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with RELATORIO.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["arquivo", "linha", "motivo"], delimiter=";")
        w.writeheader()
        w.writerows(recusas)

    revisadas = sum(q["revisao"] == "revisada" for q in aceitas)
    por_fonte = {}
    for q in aceitas:
        por_fonte[q["fonte"]] = por_fonte.get(q["fonte"], 0) + 1
    print(f"{len(aceitas)} questões aceitas ({revisadas} revisadas) e {len(recusas)} recusadas, de {len(arquivos)} planilhas.")
    print("Por fonte: " + (", ".join(f"{k} {v}" for k, v in sorted(por_fonte.items())) or "nenhuma"))
    print(f"Banco: {SAIDA.relative_to(BASE)} | Recusas: {RELATORIO.relative_to(BASE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
