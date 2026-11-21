"""Base dos lotes de questões autorais RX (inéditas, sem custo de IA, escritas pela equipe).

Cada lote (loteNN.py) chama Q(...) para cada questão e salvar(NN) no fim. O resultado vai para
importar/entrada/rx_inedita_loteNN.csv no formato do importador (importar_questoes.py), sempre com
revisao = pendente: a questão só chega aos alunos depois que um médico revisar (Admin › Revisão de questões).

Uso: python3 ferramentas/questoes_rx/lote01.py
"""
import csv
import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
ENTRADA = BASE / "importar" / "entrada"
AREAS = {
    "CM": "Clínica Médica",
    "CIR": "Cirurgia",
    "PED": "Pediatria",
    "GO": "Ginecologia e Obstetrícia",
    "MFC": "Medicina de Família e Comunidade / Saúde Coletiva",
}
TIPOS = {"Conceito/teoria", "Conduta", "Cálculo", "Diagnóstico", "Diagnóstico + conduta", "Exame complementar",
         "Interpretação de dados", "Legislação/política"}
COLUNAS = ["fonte", "banca", "ano", "edicao", "numero", "area", "especialidade", "tema", "tipo", "dificuldade",
           "enunciado", "A", "B", "C", "D", "E", "gabarito", "comentario", "revisao", "revisor", "origem"]

_questoes = []


def Q(area, especialidade, tema, tipo, dificuldade, enunciado, alternativas, gabarito, comentario, referencia=""):
    assert area in AREAS, area
    assert tipo in TIPOS, tipo
    assert dificuldade in {"fácil", "média", "difícil"}, dificuldade
    assert len(alternativas) == 5 and all(a.strip() for a in alternativas), enunciado[:60]
    assert len(set(a.strip().lower() for a in alternativas)) == 5, f"alternativas repetidas: {enunciado[:60]}"
    assert gabarito in "ABCDE", gabarito
    assert len(enunciado) >= 60 and len(comentario) >= 120, enunciado[:60]
    texto = comentario.strip() + (f" Referência: {referencia.strip()}" if referencia else "")
    _questoes.append(dict(area=AREAS[area], especialidade=especialidade, tema=tema, tipo=tipo, dificuldade=dificuldade,
                          enunciado=re.sub(r"\s+", " ", enunciado).strip(),
                          alternativas=[re.sub(r"\s+", " ", a).strip() for a in alternativas],
                          gabarito=gabarito, comentario=re.sub(r"\s+", " ", texto).strip()))


def salvar(lote):
    ENTRADA.mkdir(parents=True, exist_ok=True)
    gabaritos = {}
    for q in _questoes:
        gabaritos[q["gabarito"]] = gabaritos.get(q["gabarito"], 0) + 1
    destino = ENTRADA / f"rx_inedita_lote{lote:02d}.csv"
    with destino.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS, delimiter=";")
        w.writeheader()
        for n, q in enumerate(_questoes, start=1):
            A, B, C, D, E = q["alternativas"]
            w.writerow(dict(fonte="inedita", banca="RX", ano="2026", edicao=f"L{lote:02d}", numero=n, area=q["area"],
                            especialidade=q["especialidade"], tema=q["tema"], tipo=q["tipo"], dificuldade=q["dificuldade"],
                            enunciado=q["enunciado"], A=A, B=B, C=C, D=D, E=E, gabarito=q["gabarito"],
                            comentario=q["comentario"], revisao="pendente", revisor="", origem="autoral"))
    print(f"lote {lote:02d}: {len(_questoes)} questões -> {destino.relative_to(BASE)} | gabaritos {dict(sorted(gabaritos.items()))}")
