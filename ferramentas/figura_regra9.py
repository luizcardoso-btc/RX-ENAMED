# Gera as figuras da regra dos 9 (adulto e criança) em SVG, desenho próprio da RX ENAMED.
# Uso: python3 ferramentas/figura_regra9.py
TRACO = '#1f2937'; PREENCH = '#eef4ff'; CORTE = '#2563eb'; TEXTO = '#0b1b3a'

def corpo(ox, crianca, rotulos):
    """Desenha um corpo esquemático com origem horizontal ox e rótulos {regiao: texto}."""
    cab_r = 34 if crianca else 24
    cy = 20 + cab_r
    tronco_y = cy + cab_r + 10
    tronco_h = 118 if crianca else 150
    tronco_w = 96 if crianca else 92
    perna_h = 118 if crianca else 170
    perna_w = 40 if crianca else 38
    braco_h = 120 if crianca else 150
    tx = ox - tronco_w / 2
    el = []
    r = lambda x, y, w, h, rx: el.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" rx="{rx}" fill="{PREENCH}" stroke="{TRACO}" stroke-width="2"/>')
    # braços
    r(tx - 44, tronco_y + 4, 40, braco_h, 18)
    r(tx + tronco_w + 4, tronco_y + 4, 40, braco_h, 18)
    # pernas
    py = tronco_y + tronco_h + 4
    r(ox - perna_w - 3, py, perna_w, perna_h, 16)
    r(ox + 3, py, perna_w, perna_h, 16)
    # tronco e pescoço
    r(tx, tronco_y, tronco_w, tronco_h, 18)
    el.append(f'<rect x="{ox-9}" y="{cy+cab_r-4}" width="18" height="16" fill="{PREENCH}" stroke="{TRACO}" stroke-width="2"/>')
    el.append(f'<circle cx="{ox}" cy="{cy}" r="{cab_r}" fill="{PREENCH}" stroke="{TRACO}" stroke-width="2"/>')
    t = lambda x, y, s, tam=15: el.append(f'<text x="{x:.0f}" y="{y:.0f}" font-size="{tam}" font-weight="700" text-anchor="middle" fill="{TEXTO}" font-family="Arial, Helvetica, sans-serif">{s}</text>')
    t(ox, cy + 5, rotulos['cabeca'])
    t(tx - 24, tronco_y + braco_h / 2 + 5, rotulos['braco'], 13)
    t(tx + tronco_w + 24, tronco_y + braco_h / 2 + 5, rotulos['braco'], 13)
    if 'nadegas' in rotulos:
        t(ox, tronco_y + tronco_h * 0.42, rotulos['tronco'])
        el.append(f'<line x1="{tx+6}" y1="{tronco_y+tronco_h*0.68:.0f}" x2="{tx+tronco_w-6}" y2="{tronco_y+tronco_h*0.68:.0f}" stroke="{CORTE}" stroke-width="2" stroke-dasharray="5 4"/>')
        t(ox - 22, tronco_y + tronco_h * 0.88, rotulos['nadegas'], 12)
        t(ox + 22, tronco_y + tronco_h * 0.88, rotulos['nadegas'], 12)
    else:
        t(ox, tronco_y + tronco_h * 0.5, rotulos['tronco'])
    if 'perineo' in rotulos:
        el.append(f'<circle cx="{ox}" cy="{py-2}" r="11" fill="#fff" stroke="{CORTE}" stroke-width="2"/>')
        t(ox, py + 2, rotulos['perineo'], 10)
    t(ox - perna_w / 2 - 3, py + perna_h / 2 + 5, rotulos['perna'], 13)
    t(ox + perna_w / 2 + 3, py + perna_h / 2 + 5, rotulos['perna'], 13)
    return el

def svg(paineis, titulo):
    corpo_svg = []
    for ox, crianca, rot in paineis:
        corpo_svg += corpo(ox, crianca, rot)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 420" role="img"><title>{titulo}</title>'
            f'<rect width="560" height="420" fill="#ffffff"/>' + ''.join(corpo_svg) + '</svg>\n')

adulto_f = {'cabeca': '4,5%', 'braco': '4,5%', 'tronco': '18%', 'perna': '9%', 'perineo': '1%'}
adulto_c = {'cabeca': '4,5%', 'braco': '4,5%', 'tronco': '18%', 'perna': '9%'}
crianca_f = {'cabeca': '9%', 'braco': '4,5%', 'tronco': '18%', 'perna': '7%'}
crianca_c = {'cabeca': '9%', 'braco': '4,5%', 'tronco': '13%', 'nadegas': '2,5%', 'perna': '7%'}
base = 'app/public/img/'
open(base + 'aula_regra9_adulto.svg', 'w').write(svg([(150, False, adulto_f), (410, False, adulto_c)], 'Regra dos 9 no adulto'))
open(base + 'aula_regra9_crianca.svg', 'w').write(svg([(150, True, crianca_f), (410, True, crianca_c)], 'Regra dos 9 na criança'))
print('ok')
