"""Acrescenta comentários (JSON na entrada padrão: {id: {"resumo": ..., "alternativas": {...}}}) ao arquivo
conteudo/comentarios/<arquivo>.json, no formato {id: {"pt": {...}}}. Confere gabarito e alternativas antes de gravar
e nunca sobrescreve comentário existente. Uso: python3 -I ferramentas/gravar_comentarios.py <arquivo> < lote.json
"""
import json, sys, glob
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
q = {x['id']: x for x in json.loads((BASE / 'app/public/data/questoes.json').read_text(encoding='utf-8'))['questoes']}
existentes = {}
for f in glob.glob(str(BASE / 'conteudo/comentarios/*.json')):
    existentes.update(json.loads(Path(f).read_text(encoding='utf-8')))
destino = BASE / 'conteudo' / 'comentarios' / f'{sys.argv[1]}.json'
atual = json.loads(destino.read_text(encoding='utf-8')) if destino.exists() else {}
lote = json.loads(sys.stdin.read())
erros = []
for i, c in lote.items():
    x = q.get(i)
    if not x: erros.append(f'{i}: questão inexistente'); continue
    if not x['gabarito']: erros.append(f'{i}: anulada'); continue
    if i in existentes and i not in atual: erros.append(f'{i}: já comentada em outro arquivo'); continue
    letras = 'ABCDE'[:len(x['alternativas'])]
    alts = c.get('alternativas', {})
    if sorted(alts) != list(letras): erros.append(f'{i}: alternativas {sorted(alts)} != {list(letras)}')
    marcadas = [l for l in letras if alts.get(l, '').startswith('Correta')]
    if marcadas != [x['gabarito']]: erros.append(f'{i}: marca {marcadas}, gabarito {x["gabarito"]}')
    if not c.get('resumo'): erros.append(f'{i}: sem resumo')
if erros:
    print('\n'.join(erros)); sys.exit(1)
for i, c in lote.items():
    atual[i] = {'pt': {'resumo': c['resumo'], 'alternativas': c['alternativas']}}
destino.write_text(json.dumps(dict(sorted(atual.items())), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(lote)} comentários gravados em {destino.name} (total no arquivo: {len(atual)})')
