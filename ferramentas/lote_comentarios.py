"""Mostra questões ainda sem comentário, em lotes, para a equipe escrever os comentários.
Uso: python3 -I ferramentas/lote_comentarios.py <prefixo-do-id> [inicio] [quantidade]
"""
import json, glob, sys, re
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
q = json.loads((BASE / 'app/public/data/questoes.json').read_text(encoding='utf-8'))['questoes']
feitos = {}
for f in glob.glob(str(BASE / 'conteudo/comentarios/*.json')):
    feitos.update(json.loads(Path(f).read_text(encoding='utf-8')))
prefixo = sys.argv[1]
ini = int(sys.argv[2]) if len(sys.argv) > 2 else 0
n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
lista = [x for x in q if x['id'].startswith(prefixo + '_q') and x['id'] not in feitos and x['gabarito']]
print(f'# {len(lista)} sem comentário em {prefixo}')
for x in lista[ini:ini + n]:
    print(f"\n## {x['id']} | gab {x['gabarito']} | {x['area']} / {x['especialidade']}" + (' | FIGURA' if x['figuras'] else ''))
    print(re.sub(r'\s+', ' ', re.sub(r'\[FIG:\d+\]', '[figura]', x['enunciado'])).strip())
    for i, a in enumerate(x['alternativas']):
        print(f"{'ABCDE'[i]}) {re.sub(r'\s+', ' ', a).strip()}")
