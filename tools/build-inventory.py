# Converts reference/Inventory of Cages_Bulk Materials.xlsx into the app's
# INVENTORY array. Re-runnable: edit the sheet, run this, paste the output.
import openpyxl, re, json, sys, unicodedata

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Inventory of Cages_Bulk Materials.xlsx'

# ---- classification -------------------------------------------------------
SUFFIX = {'fungicide':'fungicide','herbicide':'herbicide','insecticide':'insecticide',
          'wetting agent':'wetting','pgr':'pgr'}

AI_CLASS = [
 ('fungicide', """iprodione azoxystrobin chlorothalonil propiconazole myclobutanil boscalid
    fluopyram pyraclostrobin mancozeb isofetamid fluxapyroxad penthiopyrad cyazofamid
    fluazinam mefenoxam triadimefon trifloxistrobin trifloxystrobin tebuconazole
    aluminum tris fluopicolide vinclozolin flutolanil thiophanate pydiflumetofen
    benzovindiflupyr difenoconazole mefentrifluconazole fluoxastrobin potassium phosphite
    triazole fluteiafol flutriafol oxazolidinedione"""),
 ('herbicide', """glyphosate prodiamine dithiopyr pendimethalin simazine triclopyr oxadiazon
    bensulide bensulfide siduron rimsulfuron sulfentrazone mesotrione topramezone msma
    quinclorac dicamba 24d mcpp mecoprop carfentrazone glufosinate paraquat fluazifop
    isoxaben metolachlor flazasulfuron clomazone imazaquin dimethenamid flumioxazin
    trifloxysulfuron fluroxypyr indaziflam disquat diquat purimisulfan pyrimisulfan
    dazomet penoxsulam quinolinecarboxylic dimethylamine dimetrylamine isooctyl
    pyridinyloxyacetic"""),
 ('insecticide', """chloramtraniliprole chlorantraniliprole indoxacarb clothianidin bifenthrin
    imidacloprid dinotefuran cypermethrin"""),
 ('pgr', """triexapac trinexapac flurprimidol fulrprimidol paclobutrazol prohexadione"""),
 ('wetting', """nonionnic nonionic surfactant methylated seed oil oxirane oxirain polyoxyethylene
    alkylphenol ethoxylate alkophenol modified alkylated polyol alcohol ethoxylate
    disulfosuccinate polyoxialkylene polyoxyalkylene soybean oil alkyl polyoxythylene
    ethylene oxide polysiloxane propylene glycol tall oil"""),
]
FERT_AI = 'nitrogen urea potash phosphate soluble ammoniacil ammonium sulfat liquid iron calcium sulfate humic'
NPK = re.compile(r'\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,2}')

def norm(t): return re.sub(r'[^a-z0-9 ]',' ', (t or '').lower())

# Products the sheet leaves blank but that are well known. Kept as an explicit
# table rather than cleverness, so anyone can correct a line without reading code.
KNOWN = {
 'briskway':'fungicide',            # difenoconazole + azoxystrobin
 'nutrol':'fungicide',              # potassium bicarbonate
 'exteris stressgard':'fungicide',  # fluopyram + trifloxystrobin
 'monument':'herbicide',            # trifloxysulfuron
 'lesco stonewall':'herbicide',     # prodiamine
 '3800 ronstar fertilizer':'herbicide',
 'bulk fert':'fert_gran',
 'milorganite':'fert_gran',
 'extreme green 16':'fert_gran',
 'koch u flexible u6 0 0':'fert_gran',
 'floratine':'fert_liq',
 'armament concentrate':'fert_liq',
 'brandt':'fert_liq',
}

def classify(name, ai, form):
    n, a = norm(name), norm(ai)
    n = re.sub(r'\s+',' ',n).strip()
    liquid = 'liq' in (form or '').lower()
    for k,v in KNOWN.items():
        if n.startswith(k) or k in n: return v, 'known product'
    for word, cat in SUFFIX.items():
        if word in n: return cat, 'named on the sheet'
    if NPK.search(name or '') or any(w in a for w in FERT_AI.split()):
        if 'fert' in n or NPK.search(name or '') or any(w in a for w in FERT_AI.split()):
            return ('fert_liq' if liquid else 'fert_gran'), 'fertiliser'
    for cat, words in AI_CLASS:
        for w in words.split():
            if w and w in a: return cat, 'active ingredient'
    for cat, words in AI_CLASS:
        for w in words.split():
            if w and w in n: return cat, 'product name'
    if any(k in n for k in ['tank cleaner','defoamer','foam','conditioner','marker']):
        return 'misc', 'not a pesticide'
    return 'misc', 'UNSURE — please check'

# ---- name cleanup ---------------------------------------------------------
def clean_name(raw):
    s = str(raw).strip()
    s = re.sub(r'\s*/\s*(fungicide|herbicide|insecticide|wetting agent|pgr)\b','', s, flags=re.I)
    s = re.sub(r'\s*/\s*$','', s)
    return re.sub(r'\s{2,}',' ', s).strip()

# Same product, spelled two ways on the sheet. Merge deliberately, by name.
ALIAS = {
 'exteriss stressgard':'exteris stressgard',
 '816 field conditioner':'saf 816 field conditioner',
}

def key(name):
    k = norm(name)
    k = re.sub(r'\b(stressgard|stressguard)\b','stressgard',k)
    k = re.sub(r'\s+',' ',k).strip()
    return ALIAS.get(k, k)

# ---- container + quantity -------------------------------------------------
UNITS = [('fl oz','oz'),('fl. oz.','oz'),('ounce','oz'),('oz','oz'),('gallon','gal'),('gal','gal'),
         ('lbs','lb'),('lb','lb'),('ton','ton'),('qt','qt'),('quart','qt'),('pint','pt'),
         ('liter','L'),('litre','L'),('mL','mL'),('ml','mL'),('l','L'),('g','g'),('gram','g')]
def parse_size(txt):
    if not txt: return None, None
    t = str(txt).strip().lower().replace('gals','gal').replace('gallons','gallon')
    t = t.replace('i gal','1 gal')                      # sheet typo
    m = re.search(r'(\d*\.?\d+)', t)
    n = float(m.group(1)) if m else None
    for pat, u in UNITS:
        if re.search(r'\b'+re.escape(pat)+r'\b', t): return n, u
    return n, None

def ctype_of(unit, form, txt):
    t = (str(txt) or '').lower()
    if 'drum' in t: return 'drum'
    f = (form or '').lower()
    if unit in ('lb','ton') or f.startswith(('gran','wg','wsg','wdg','wp','df','eg')): return 'bag'
    if unit == 'gal': return 'jug'
    return 'bottle'

WORD_Q = [('full',1.0),('half',0.5),('partial',0.5),('low',0.25),('empty',0.0)]
def parse_qty(txt, csize, unit):
    """Returns (number_of_containers, note). Half=0.5, Full=1.0, partial=best guess."""
    if txt is None: return 0.0, ''
    raw = str(txt).strip()
    t = raw.lower()
    if t in ('', 'n/a'): return 0.0, ''
    # an absolute measure in the same unit as the container, e.g. '22.5 gal' of a 2.5 gal jug
    am = re.match(r'^\s*(\d+(?:\.\d+)?)\s*(gal|gallon|lbs|lb|oz|qt|ton)s?\s*$', t)
    if am and csize:
        amt, u = float(am.group(1)), am.group(2)
        u = {'gallon':'gal','lbs':'lb'}.get(u,u)
        if u == unit: return round(amt/csize, 2), raw
    if re.match(r'^\s*\d*\.?\d+\s*$', t): return float(t), raw
    nb = re.match(r'^\s*(\d+)\s*-\s*\d', t)          # '8- 50 lbs' = 8 bags of 50 lb
    if nb: return float(nb.group(1)), raw
    lead = re.match(r'^\s*(\d*\.\d+)\s*(gal|lbs?|oz|qt)\b', t)
    if lead and csize:
        return round(float(lead.group(1))/csize, 2), raw
    fr = re.match(r'^\s*(\d+)\s*/\s*(\d+)', t)          # '3/4', '2/3 Full'
    if fr: return round(int(fr.group(1))/int(fr.group(2)), 2), raw
    total, hit = 0.0, False
    for m in re.finditer(r'(\d+(?:\.\d+)?)?\s*(full|half|partial|low|empty|bags?|bag)', t):
        n = float(m.group(1)) if m.group(1) else 1.0
        w = m.group(2)
        if w.startswith('bag'): total += n; hit = True; continue
        for word, val in WORD_Q:
            if w == word: total += n*val; hit = True; break
    if hit: return round(total,2), raw
    return 0.0, raw

# ---- build ----------------------------------------------------------------
wb = openpyxl.load_workbook(SRC, data_only=True)
ws = wb.worksheets[0]
products, order = {}, []
for row in ws.iter_rows(min_row=2, values_only=True):
    if not row[0] or not str(row[0]).strip(): continue
    raw_name, ai, form, year, cap, stock, loc, cage = (list(row)+[None]*8)[:8]
    name = clean_name(raw_name)
    cat, why = classify(str(raw_name), ai or '', form or '')
    csize, unit = parse_size(cap)
    f = (str(form) if form else '').lower()
    if csize and not unit:
        unit = 'gal' if f.startswith('l') else 'lb'
    qty, note = parse_qty(stock, csize, unit)
    # No container size on the sheet, but the stock column names a real amount
    # ('7 gal', '290lbs'). Keep the amount rather than throwing it away: the
    # loose quantity becomes the container, counted as one.
    if not csize:
        m2 = re.match(r'^\s*(\d+(?:\.\d+)?)\s*(gal|gallon|lbs|lb|oz|qt|ton|pint)s?\b',
                      str(stock or '').strip().lower())
        if m2:
            csize = float(m2.group(1))
            unit = {'gallon':'gal','lbs':'lb','pint':'pt'}.get(m2.group(2), m2.group(2))
            qty = 1.0
    yr = None
    if year not in (None,'','N/A','n/a'):
        ys = str(year).replace('.0','').strip()
        yr = ys if ys else None
    k = key(name)
    if k not in products:
        products[k] = {'name':name,'ai':(str(ai).strip() if ai else ''),'cat':cat,'why':why,
                       'form':(str(form).strip() if form else ''),'containers':[]}
        order.append(k)
    products[k]['containers'].append({
        'csize':csize,'unit':unit,
        'ctype':ctype_of(unit, form, cap),'qty':qty,
        'year':yr,'loc':(str(loc).strip() if loc else ''),
        'cage':(str(cage).replace('.0','').strip() if cage else ''),'note':note})

out = []
for i,k in enumerate(order, 1):
    p = products[k]
    out.append({'id':'i%d'%i,'name':p['name'],'ai':p['ai'],'cat':p['cat'],
                'form':p['form'],'thr':0,'containers':p['containers'],'_why':p['why']})
json.dump(out, open('inventory.json','w'), indent=1)
print(f"{len(order)} products from {sum(len(products[k]['containers']) for k in order)} sheet rows")
from collections import Counter
print(Counter(p['cat'] for p in out).most_common())
print("UNSURE:", sum(1 for p in out if 'UNSURE' in p['_why']))

# ---- emit the app array ---------------------------------------------------
def num(x):
    if x is None: return 'null'
    return str(int(x)) if float(x) == int(x) else str(round(float(x), 2))
def q(t): return "'" + str(t or '').replace("\\", "\\\\").replace("'", "\\'") + "'"

lines = []
for p in out:
    cs = p['containers']
    first = cs[0]
    # The app's top-level qty is the AMOUNT held, in `unit` — it divides by
    # csize itself to show "0.5 jugs". Containers keep a COUNT, which is how a
    # person thinks about a shelf, so convert here.
    u = first['unit']
    total = round(sum((c['qty'] or 0) * (c['csize'] or 0)
                      for c in cs if c['unit'] == u), 2)
    body = (f"{{id:{q(p['id'])}, name:{q(p['name'])}, ai:{q(p['ai'])}, cat:{q(p['cat'])}, "
            f"form:{q(p['form'])}, thr:0, "
            f"csize:{num(first['csize'])}, unit:{q(first['unit'])}, ctype:{q(first['ctype'])}, "
            f"qty:{num(total)},\n  containers:[")
    body += ",".join(
        "\n   {csize:%s, unit:%s, ctype:%s, qty:%s, year:%s, loc:%s, cage:%s, src:%s}"
        % (num(c['csize']), q(c['unit']), q(c['ctype']), num(c['qty']),
           q(c['year']) if c['year'] else 'null', q(c['loc']), q(c['cage']), q(c['note']))
        for c in cs)
    body += "]}"
    lines.append(" " + body)

HEAD = """var INVENTORY=[
 /* Built by tools/build-inventory.py from
    reference/Inventory of Cages_Bulk Materials.xlsx (the April count).
    Re-run that script after editing the sheet; do not hand-edit this block.

    One entry per PRODUCT. `containers` holds each physical size the farm has
    of it — a 2018 2.5-gallon jug is not the same thing as a 2025 1-gallon one,
    so they stay separate lines with their own year and cage.

    `qty` counts CONTAINERS, not volume: 1 = a full jug, 0.5 = a half one.
    The sheet's own wording is kept in `src` so a recount can be checked
    against what April actually said. Quantities are April's and are expected
    to be wrong by now — they are a starting point to correct, not a truth. */
"""
js = HEAD + ",\n".join(lines) + "\n];"
open('inventory.js','w').write(js)
print("wrote inventory.js —", len(js), "chars,", len(out), "products")
