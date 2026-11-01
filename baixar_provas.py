"""Baixa os cadernos e gabaritos oficiais listados em fontes_provas.csv para provas/.

Preencha as colunas url_caderno e url_gabarito com os links oficiais do Inep (página de provas e
gabaritos do Revalida e do ENAMED no portal gov.br/inep). Arquivos já presentes em provas/ são mantidos.
Depois rode python3 pipeline.py.

Uso: python3 baixar_provas.py
"""

import csv
import sys
import urllib.request
from pathlib import Path

BASE = Path(__file__).parent
PASTA = BASE / "provas"


def baixar(url, destino):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "rx-revalida/1.0"}), timeout=60) as r:
        dados = r.read()
    if not dados.startswith(b"%PDF"):
        raise ValueError("o link não devolveu um PDF")
    destino.write_bytes(dados)


def main():
    PASTA.mkdir(exist_ok=True)
    baixados, falhas, sem_link = 0, [], []
    with (BASE / "fontes_provas.csv").open(encoding="utf-8") as f:
        for linha in csv.DictReader(f, delimiter=";"):
            for coluna, sufixo in (("url_caderno", "prova"), ("url_gabarito", "gabarito")):
                destino = PASTA / f"{linha['id']}_{sufixo}.pdf"
                url = (linha[coluna] or "").strip()
                if destino.exists():
                    continue
                if not url:
                    sem_link.append(destino.name)
                    continue
                try:
                    baixar(url, destino)
                    baixados += 1
                    print(f"ok  {destino.name}")
                except Exception as erro:  # rede bloqueada, link quebrado, arquivo que não é PDF
                    falhas.append(f"{destino.name}: {erro}")
    print(f"{baixados} arquivos baixados, {len(falhas)} falhas, {len(sem_link)} sem link em fontes_provas.csv.")
    for f in falhas:
        print("falhou", f)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
