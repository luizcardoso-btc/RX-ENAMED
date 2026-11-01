# Fluxograma do manejo da atonia uterina (desenho próprio da RX ENAMED), em português e espanhol.
# Uso: python3 ferramentas/figura_hpp.py
from xml.sax.saxutils import escape
AZUL = '#2563eb'; FUNDO = '#eef4ff'; TRACO = '#1f2937'; TXT = '#0b1b3a'; VERDE = '#0f766e'

TEXTOS = {
 'pt': {'titulo': 'Atonia uterina: sequência de condutas',
  'passos': [('Massagem uterina bimanual', 'Acesso calibroso, Ringer lactato, sondagem vesical'),
             ('Ocitocina', '5 UI IV lento + 20–40 UI em 500 mL a 250 mL/h'),
             ('Metilergometrina', '0,2 mg IM · evitar se hipertensa'),
             ('Misoprostol', '800 mcg via retal'),
             ('Balão de tamponamento intrauterino', 'Traje antichoque não pneumático como ponte'),
             ('Cirurgia', 'Suturas compressivas, ligaduras vasculares, histerectomia')],
  'lado': ['Ácido tranexâmico', '1 g IV em 10 min,', 'até 3 h do parto;', 'repetir após 30 min', 'se persistir'],
  'falha': 'sem resposta'},
 'es': {'titulo': 'Atonía uterina: secuencia de conductas',
  'passos': [('Masaje uterino bimanual', 'Acceso de grueso calibre, Ringer lactato, sonda vesical'),
             ('Oxitocina', '5 UI IV lento + 20–40 UI en 500 mL a 250 mL/h'),
             ('Metilergometrina', '0,2 mg IM · evitar si hipertensa'),
             ('Misoprostol', '800 mcg vía rectal'),
             ('Balón de taponamiento intrauterino', 'Traje antichoque no neumático como puente'),
             ('Cirugía', 'Suturas compresivas, ligaduras vasculares, histerectomía')],
  'lado': ['Ácido tranexámico', '1 g IV en 10 min,', 'hasta 3 h del parto;', 'repetir a los 30 min', 'si persiste'],
  'falha': 'sin respuesta'},
}

def svg(t):
    W, x0, w, h, gap = 640, 40, 400, 54, 26
    el = [f'<rect width="{W}" height="560" fill="#ffffff"/>',
          f'<defs><marker id="s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{TRACO}"/></marker></defs>',
          f'<text x="{W/2}" y="30" font-size="18" font-weight="700" text-anchor="middle" fill="{TXT}">{escape(t["titulo"])}</text>']
    y = 50
    for i, (nome, det) in enumerate(t['passos']):
        el.append(f'<rect x="{x0}" y="{y}" width="{w}" height="{h}" rx="10" fill="{FUNDO}" stroke="{AZUL}" stroke-width="2"/>')
        el.append(f'<text x="{x0+w/2}" y="{y+22}" font-size="15" font-weight="700" text-anchor="middle" fill="{TXT}">{escape(nome)}</text>')
        el.append(f'<text x="{x0+w/2}" y="{y+41}" font-size="12" text-anchor="middle" fill="{TXT}">{escape(det)}</text>')
        if i < len(t['passos']) - 1:
            el.append(f'<line x1="{x0+w/2}" y1="{y+h}" x2="{x0+w/2}" y2="{y+h+gap-2}" stroke="{TRACO}" stroke-width="2" marker-end="url(#s)"/>')
            if i >= 1:
                el.append(f'<text x="{x0+w/2+8}" y="{y+h+17}" font-size="11" fill="#475569">{escape(t["falha"])}</text>')
        y += h + gap
    # caixa lateral do ácido tranexâmico
    lx, ly, lw, lh = 466, 150, 150, 132
    el.append(f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="10" fill="#ecfdf5" stroke="{VERDE}" stroke-width="2"/>')
    for k, linha in enumerate(t['lado']):
        peso = '700' if k == 0 else '400'
        el.append(f'<text x="{lx+lw/2}" y="{ly+26+k*22}" font-size="{14 if k==0 else 12}" font-weight="{peso}" text-anchor="middle" fill="{TXT}">{escape(linha)}</text>')
    el.append(f'<line x1="{lx}" y1="{ly+20}" x2="{x0+w+4}" y2="{ly+20}" stroke="{VERDE}" stroke-width="2" stroke-dasharray="5 4"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 560" font-family="Arial, Helvetica, sans-serif" role="img"><title>{escape(t["titulo"])}</title>'
            + ''.join(el) + '</svg>\n')

for lingua, t in TEXTOS.items():
    open(f'app/public/img/aula_hpp_atonia_{lingua}.svg', 'w').write(svg(t))
print('ok')
