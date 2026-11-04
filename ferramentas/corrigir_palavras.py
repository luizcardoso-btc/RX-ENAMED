"""Junta palavras partidas pela extração dos PDFs ("Diagnos tico" -> "Diagnóstico", "solicit ar" -> "solicitar",
"ultrassonografi a" -> "ultrassonografia") e corrige hífen solto ("agravando- se" -> "agravando-se").

Dicionário: as próprias palavras do acervo (questões, comentários, aulas, estações). Só junta quando a palavra inteira
aparece no acervo e pelo menos um dos pedaços não existe sozinho (ou é raro), para não unir "de mais" ou "a o".
Uso: python3 -I ferramentas/corrigir_palavras.py [--aplicar]
"""
import json, re, sys, glob, collections, unicodedata
from pathlib import Path
BASE = Path(__file__).resolve().parent.parent
QUESTOES = BASE / 'app/public/data/questoes.json'
OUTROS = [*glob.glob(str(BASE / 'conteudo/comentarios/*.json')), *glob.glob(str(BASE / 'conteudo/aulas/*.json')),
          *glob.glob(str(BASE / 'conteudo/estacoes/*.json')), *glob.glob(str(BASE / 'conteudo/estacoes-inep/*.json')),
          str(BASE / 'conteudo/flashcards.json'), *glob.glob(str(BASE / 'conteudo/discursivas/*.json'))]
PALAVRA = re.compile(r"[A-Za-zÀ-ÿ]+")
# Palavras curtas legítimas que nunca devem ser coladas à vizinha.
CURTAS = set('a o e é as os um uma de do da dos das em no na nos nas por para com sem que se ou ao à às mas não sim já há só tal seu sua nem lá cá vez mês ano dia mg ml kg cm mm ui'.split())

def textos(obj):
    if isinstance(obj, str): yield obj
    elif isinstance(obj, dict):
        for v in obj.values(): yield from textos(v)
    elif isinstance(obj, list):
        for v in obj: yield from textos(v)

def contar():
    freq = collections.Counter()
    fontes = [json.loads(QUESTOES.read_text(encoding='utf-8'))] + [json.loads(Path(f).read_text(encoding='utf-8')) for f in OUTROS]
    for d in fontes:
        for t in textos(d):
            for w in PALAVRA.findall(t): freq[w.lower()] += 1
            for w in re.findall(r"[A-Za-zÀ-ÿ]+-[A-Za-zÀ-ÿ]+", t): freq[w.lower()] += 1
    return freq

def corretor(freq):
    def unir(m):
        a, b = m.group(1), m.group(2)
        junto = (a + b).lower()
        fa, fb, fj = freq[a.lower()], freq[b.lower()], freq[junto]
        if a.lower() in CURTAS or b.lower() in CURTAS and fb > 50:
            return m.group(0)
        # A palavra inteira precisa existir e ser mais comum que algum dos pedaços soltos.
        # Junta só se o primeiro pedaço não é palavra de verdade ("solicit ar", "Diagnós tico"),
        # ou se o segundo é um fragmento que não existe sozinho e a palavra inteira é conhecida.
        if fj >= 2 and len(junto) >= 5 and (fa <= 1 or (fb <= 1 and fa <= 3)):
            return a + b
        return m.group(0)
    rx = re.compile(r"\b([A-Za-zÀ-ÿ]{1,})\s([a-zà-ÿ]{1,})\b")
    # Ligadura "fi"/"fl" perdida no PDF: "défi cit", "infi ltração", "antinfl amatórios".
    lig = re.compile(r"\b([A-Za-zÀ-ÿ]*f[il])\s([a-zà-ÿ]{2,})\b")
    def ligadura(m):
        a, b = m.group(1), m.group(2)
        if freq[(a + b).lower()] >= 1 or freq[b.lower()] <= 2:
            return a + b
        return m.group(0)
    PREFIXOS = set('pré pós pró anti ex recém semi auto extra intra inter bem mal não pronto contra super sub supra infra ultra vice sem além aquém'.split())
    ENCLITICOS = set('se lo la los las me te nos vos lhe lhes o a os as no na nos nas mo ma'.split())
    def hifen(m):
        a, b = m.group(1), m.group(2)
        if freq[(a + b).lower()] >= 2 and freq[f"{a}-{b}".lower()] == 0 and b.lower() not in ENCLITICOS:
            return a + b                      # quebra de linha: "acompanha- mento"
        if b.lower() in ENCLITICOS and len(a) > 3 or a.lower() in PREFIXOS or freq[f"{a}-{b}".lower()] >= 1 or freq[b.lower()] >= 3 and freq[a.lower()] >= 3:
            return f"{a}-{b}"                 # "agravando- se", "pós- operatório", "pronto- socorro"
        return m.group(0)
    def corrigir(t):
        t2 = re.sub(r"\b([A-Za-zÀ-ÿ]{2,})- ([A-Za-zÀ-ÿ]+)", hifen, t)
        t2 = lig.sub(ligadura, t2)
        anterior = None
        while anterior != t2:
            anterior = t2
            t2 = rx.sub(unir, t2)
        return t2
    return corrigir

def corrigir_obj(obj, corrigir, mudancas, chave=None):
    if isinstance(obj, str):
        novo = corrigir(obj)
        if novo != obj:
            for w in set(re.findall(r"[A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)?", novo)) - set(re.findall(r"[A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)?", obj)):
                mudancas[w] += 1
        return novo
    if isinstance(obj, list):
        return [corrigir_obj(v, corrigir, mudancas) for v in obj]
    if isinstance(obj, dict):
        # ids, urls, caminhos de imagem e letras de gabarito não são texto corrido.
        # Textos em espanhol ("es") ficam de fora: o dicionário é do português.
        return {k: (v if k in ('id', 'url', 'prova', 'imagem', 'figuras', 'gabarito', 'chave', 'mentor', 'area', 'especialidade', 'edicao', 'exame', 'es') else corrigir_obj(v, corrigir, mudancas, k)) for k, v in obj.items()}
    return obj


if __name__ == '__main__':
    aplicar = '--aplicar' in sys.argv
    freq = contar()
    corrigir = corretor(freq)
    base_corrigir = corrigir
    def corrigir(t):
        t = base_corrigir(t).replace('Pronto-o Socorro', 'Pronto-Socorro').replace('Pronto- o Socorro', 'Pronto-Socorro')
        # Ligadura com pedaço de uma letra: "radiografi a", "perfi l"; acento perdido em "fisico".
        t = re.sub(r"\b(\w*(?:grafi|rafi)) a\b", r"\1a", t)
        t = re.sub(r"\bperfi l\b", "perfil", t)
        return re.sub(r"\b(F|f)isico\b", lambda m: m.group(1) + 'ísico', t)
    total = collections.Counter()
    for caminho in [str(QUESTOES), *OUTROS]:
        p = Path(caminho)
        dados = json.loads(p.read_text(encoding='utf-8'))
        mud = collections.Counter()
        novo = corrigir_obj(dados, corrigir, mud)
        if mud:
            total.update(mud)
            print(f'{p.relative_to(BASE)}: {sum(mud.values())} correções')
            if aplicar:
                original = p.read_text(encoding='utf-8')
                m = re.match(r'[\[{]\n( +)', original)
                if m:
                    saida = json.dumps(novo, ensure_ascii=False, indent=len(m.group(1)))
                else:
                    saida = json.dumps(novo, ensure_ascii=False, separators=(',', ':')) if '": ' not in original[:300] else json.dumps(novo, ensure_ascii=False)
                p.write_text(saida + ('\n' if original.endswith('\n') else ''), encoding='utf-8')
    print(len(total), 'palavras corrigidas,', sum(total.values()), 'ocorrências')
    if '--lista' in sys.argv:
        for w, n in total.most_common(): print(f'{n:4d} {w}')
