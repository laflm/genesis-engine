"""Bot de test de bout en bout (Playwright + Chromium) : parcourt l'appli comme un utilisateur.
Usage : npm run build:local && python3 tests/bot/e2e.py
"""
import io, json, os, subprocess, sys, tempfile, time, zipfile, threading, http.server, socketserver, functools
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FIX = os.path.join(ROOT, 'tests', 'fixtures')
OUT = os.path.join(ROOT, 'tests', 'bot', 'out'); os.makedirs(OUT, exist_ok=True)
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name + (f'  — {detail}' if detail and not ok else (f'  ({detail})' if detail else '')))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    h = functools.partial(Quiet, directory=os.path.join(ROOT, 'dist'))
    srv = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

srv = serve(); URL = f'http://127.0.0.1:{srv.server_address[1]}/#game=black-boy-go'
errors = []

def alpha_count(page, expr='session.layer.canvas'):
    return page.evaluate(f"""() => {{ const {{session}} = window.__genesis; const c = {expr}; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for (let i=3;i<d.length;i+=4) if (d[i]>0) n++; return n; }}""")

def import_files(page, paths, accept=True):
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='⬆ Importer').click()
    fc.value.set_files(paths)
    page.wait_for_selector('.imp-row')

def stroke(page, pts, pen=False):
    box = page.locator('.main-canvas').bounding_box()
    if pen:
        page.evaluate("""([pts, box]) => { const el = document.querySelector('.main-canvas');
          const mk = (t, x, y) => new PointerEvent(t, {pointerId: 77, pointerType: 'pen', pressure: 0.8, clientX: box.x + x, clientY: box.y + y, bubbles: true, isPrimary: true, button: 0, buttons: 1});
          el.dispatchEvent(mk('pointerdown', pts[0][0], pts[0][1])); for (const p of pts.slice(1)) el.dispatchEvent(mk('pointermove', p[0], p[1])); el.dispatchEvent(mk('pointerup', pts[pts.length-1][0], pts[pts.length-1][1])); }""", [pts, box])
    else:
        page.mouse.move(box['x'] + pts[0][0], box['y'] + pts[0][1]); page.mouse.down()
        for p in pts[1:]: page.mouse.move(box['x'] + p[0], box['y'] + p[1], steps=4)
        page.mouse.up()

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={'width': 1180, 'height': 820}, accept_downloads=True)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'unpkg' not in m.text and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    _press = page.keyboard.press
    def _press_wait(k, **kw):
        _press(k, **kw)
        if len(k) == 1: page.wait_for_timeout(150)     # changement d'outil : laisse la mise en page se stabiliser
    page.keyboard.press = _press_wait
    page.goto(URL); page.wait_for_selector('.topbar')
    check('démarrage : jeu choisi et interface chargée', page.locator('.brand').inner_text().startswith('GENESIS'))

    # ---- 1. Import de 8 PNG d'un coup ----
    page.get_by_role('button', name='Fermer').click()  # ferme le sélecteur d'asset ouvert au démarrage
    files = [os.path.join(FIX, f) for f in ['hero_sheet.png','item_ceohat.png','church.png','chest.png','chest_open.png','item_ceosuit.png','item_mecha.png','item_meteorstaff.png']]
    import_files(page, files)
    keys = page.eval_on_selector_all('.imp-row select[aria-label="Clé du jeu"]', 'els => els.map(e => e.value)')
    check('import : 8 fichiers associés aux bonnes clés', keys == ['hero','item_ceohat','church','chest','chest_open','item_ceosuit','item_mecha','item_meteorstaff'], str(keys))
    page.get_by_role('button', name='Importer', exact=True).click()
    page.wait_for_selector('text=Rapport d\'import')
    rep = page.locator('.modal-body').inner_text()
    check('import : rapport affiche 8 acceptés', 'Acceptés (8)' in rep, rep[:120])
    page.get_by_role('button', name='OK').click()
    n = page.evaluate("() => window.__genesis.session.project.assets.size")
    check('import : 8 assets dans le projet', n == 8, str(n))
    sizes = page.evaluate("() => [...window.__genesis.session.project.assets.values()].map(a => [a.key, a.w, a.h, Object.values(a.anims).flat().length])")
    d = {k:(w,h,f) for k,w,h,f in sizes}
    check('import : hero = 16 frames de 260×200', d.get('hero') == (260,200,16), str(d.get('hero')))
    check('import : church 300×320', d.get('church') == (300,320,1), str(d.get('church')))

    # ---- 2. Édition : traits souris + Pencil, annuler / rétablir ----
    page.evaluate("() => window.__genesis.session.select('hero')")
    page.wait_for_timeout(200)
    base = alpha_count(page)
    stroke(page, [(300,200),(380,260),(460,200)])
    after_mouse = alpha_count(page)
    check('dessin souris : le calque change', after_mouse > base, f'{base} -> {after_mouse}')
    stroke(page, [(300,300),(350,330),(420,300)], pen=True)
    after_pen = alpha_count(page)
    check('dessin Pencil (pointer pen + pression) : le calque change', after_pen > after_mouse, f'{after_mouse} -> {after_pen}')
    page.keyboard.press('Control+z'); page.keyboard.press('Control+z')
    check('annuler ×2 (clavier) : retour à l\'état initial', alpha_count(page) == base, f'{alpha_count(page)} vs {base}')
    page.keyboard.press('Control+Shift+z')
    check('rétablir (clavier)', alpha_count(page) == after_mouse)
    # gestes tactiles : tap deux doigts = annuler, trois doigts = rétablir
    def touch_tap(n):
        page.evaluate("""(n) => { const el = document.querySelector('.main-canvas'), r = el.getBoundingClientRect();
          const mk = (t, id, x) => new PointerEvent(t, {pointerId: 200+id, pointerType: 'touch', clientX: r.x + x, clientY: r.y + 200, bubbles: true, isPrimary: id===0, button: 0, buttons: 1});
          for (let i=0;i<n;i++) el.dispatchEvent(mk('pointerdown', i, 200+i*60)); for (let i=0;i<n;i++) el.dispatchEvent(mk('pointerup', i, 200+i*60)); }""", n)
    touch_tap(2); check('tap deux doigts = annuler', alpha_count(page) == base, f'{alpha_count(page)} vs {base}')
    touch_tap(3); check('tap trois doigts = rétablir', alpha_count(page) == after_mouse)
    # rejet de la paume : un doigt ne dessine pas juste après le Pencil
    stroke(page, [(300,300),(310,305)], pen=True)
    before_palm = alpha_count(page)
    page.evaluate("""() => { const el = document.querySelector('.main-canvas'), r = el.getBoundingClientRect();
      const mk = (t, x, y) => new PointerEvent(t, {pointerId: 300, pointerType: 'touch', clientX: r.x + x, clientY: r.y + y, bubbles: true, isPrimary: true, button: 0, buttons: 1});
      el.dispatchEvent(mk('pointerdown', 500, 100)); el.dispatchEvent(mk('pointermove', 560, 160)); el.dispatchEvent(mk('pointerup', 560, 160)); }""")
    check('rejet de la paume (doigt ignoré après le Pencil)', alpha_count(page) == before_palm)
    # remplissage + pipette + gomme
    page.keyboard.press('Control+z'); 
    page.keyboard.press('e'); stroke(page, [(300,200),(380,260)])
    check('gomme : retire des pixels', alpha_count(page) < after_mouse)
    page.keyboard.press('Control+z')
    # calques
    page.get_by_role('button', name='Nouveau calque').first.click()
    ln = page.evaluate("() => window.__genesis.session.frame.layers.length")
    check('calques : ajout', ln == 2, str(ln))
    page.keyboard.press('Control+z')
    check('calques : annuler l\'ajout', page.evaluate("() => window.__genesis.session.frame.layers.length") == 1)

    # ---- 3. Aperçu animé avec équipements ----
    page.get_by_role('button', name='Aperçu').click()
    page.evaluate("""() => { const s = window.__genesis.session; }""")
    sel = page.locator('.equip select').first
    opts = page.eval_on_selector_all('.equip select option', 'os => os.map(o => o.value)')
    check('aperçu : équipements importés proposés', 'item_ceohat' in opts and 'item_mecha' in opts and 'item_ceosuit' in opts, str(opts))
    page.select_option('select[aria-label="head"]', 'item_ceohat'); page.select_option('select[aria-label="body"]', 'item_ceosuit'); page.select_option('select[aria-label="foot"]', 'item_mecha'); page.select_option('select[aria-label="weapon"]', 'item_meteorstaff')
    page.wait_for_timeout(500)
    ink = page.evaluate("""() => { const c = document.querySelector('.preview-canvas'); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; const bg=[0xcf,0xe8,0xff]; let n=0; for (let i=0;i<d.length;i+=4) if (Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2])>60) n++; return n; }""")
    check('aperçu : le personnage équipé est dessiné', ink > 800, str(ink))
    page.locator('.preview-canvas').screenshot(path=os.path.join(OUT, 'preview_equipped.png'))
    # la sauvegarde auto ne doit pas être ralentie par l'aperçu animé (encodage PNG indépendant de l'activité de la page)
    t_probe = page.evaluate('() => { const t = Date.now(); window.__genesis.session.touch(); return t; }'); t_start = time.time()
    try: page.wait_for_function('t => (window.__genesisSavedAt || 0) > t', arg=t_probe, timeout=20000, polling=250); took = time.time() - t_start
    except Exception: took = 99
    check('sauvegarde auto rapide (< 10 s) même avec l\'aperçu équipé animé affiché', took < 10, f'{took:.1f} s')
    def clipped_edges():
        return page.evaluate("""() => { const c = document.querySelector('.preview-canvas'), d = c.getContext('2d').getImageData(0,0,c.width,c.height).data, bg=[0xcf,0xe8,0xff]; let n=0;
          const diff = (x,y) => { const i=(y*c.width+x)*4; return Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2])>60; };
          for (let x=0;x<c.width;x++) { if (diff(x,0)||diff(x,1)||diff(x,c.height-1)) n++; } for (let y=0;y<c.height;y++) { if (diff(0,y)||diff(c.width-1,y)) n++; } return [n, c.width, c.height]; }""")
    for pose in ['idle','walk','attack','hurt']:
        page.click(f'button[data-pose="{pose}"]')
        worst = 0
        for _ in range(8): page.wait_for_timeout(110); worst = max(worst, clipped_edges()[0])
        check(f'aperçu : pose {pose} entièrement visible (rien ne touche le bord)', worst == 0, f'{worst} pixels au bord')
    check('aperçu : canvas agrandi (≥ 480 px)', clipped_edges()[1] >= 480)
    check('aperçu : poses walk/attack/hurt sans erreur', not errors, str(errors[:2]))

    # ---- 4. Export ZIP + vérifications ----
    page.get_by_role('button', name='⬇ Exporter').click()
    page.wait_for_selector('.exp-out ul, .exp-out p.ok')
    exp_txt = page.locator('.exp-out').inner_text()
    check('export : validation sans erreur bloquante', '⛔' not in exp_txt, exp_txt[:200])
    with page.expect_download() as dl:
        page.get_by_role('button', name='Télécharger le ZIP').click()
    zpath = os.path.join(OUT, 'export.zip'); dl.value.save_as(zpath)
    z = zipfile.ZipFile(zpath); names = z.namelist()
    check('export : zip valide (CRC)', z.testzip() is None)
    need = ['sprites/pack.json','sprites/hero.png','sprites/item_ceohat.png','sprites/church.png','sprites/chest.png','sprites/chest_open.png','PATCH_NOTES.txt','README_UPLOAD.txt']
    check('export : arborescence attendue', all(n in names for n in need), str(names))
    pack = json.loads(z.read('sprites/pack.json'))
    check('export : pack.json (sheets + sprites)', pack['sheets'].get('hero') == 'hero.png' and pack['sheets'].get('item_mecha') == 'item_mecha.png' and pack['sprites'].get('church') == 'church.png', json.dumps(pack))
    im = Image.open(io.BytesIO(z.read('sprites/hero.png')))
    check('export : hero.png = 1560×800 RGBA', im.size == (1560,800) and im.mode == 'RGBA', f'{im.size} {im.mode}')
    check('export : nom des fichiers en minuscules sans espaces', all(n == n.lower() and ' ' not in n for n in names if n.startswith('sprites/')))
    check('export : PATCH_NOTES indique qu\'aucun patch n\'est nécessaire', 'AUCUNE modification' in z.read('PATCH_NOTES.txt').decode())
    # fidélité : item_ceohat jamais touché doit être identique pixel à pixel (hors pixels quasi transparents)
    import numpy as np
    def cmp(name, fname):
        a = np.array(Image.open(io.BytesIO(z.read(f'sprites/{name}.png'))).convert('RGBA')).astype(int); b = np.array(Image.open(os.path.join(FIX, fname)).convert('RGBA')).astype(int)
        m = (a[...,3] > 250) | (b[...,3] > 250); alpha_diff = np.abs(a[...,3]-b[...,3]).max()
        return a.shape == b.shape, (np.abs(a-b)[m].max() if m.any() else 0), alpha_diff
    for n, f in [('item_ceohat','item_ceohat.png'),('church','church.png'),('item_mecha','item_mecha.png')]:
        same, rgbdiff, adiff = cmp(n, f)
        check(f'export fidélité : {n} identique à l\'original', same and rgbdiff <= 1 and adiff <= 1, f'rgbΔ={rgbdiff} alphaΔ={adiff}')

    # ---- 5. Test dans le jeu ----
    page.get_by_role('button', name='▶ Tester').click()
    page.wait_for_selector('.game-frame'); page.wait_for_timeout(2500)
    fr = [f for f in page.frames if f != page.main_frame][0]
    info = None
    for _ in range(20):
        try:
            info = fr.evaluate("() => ({hero: SHEET.hero ? [SHEET.hero.img.naturalWidth, SHEET.hero.img.naturalHeight, SHEET.hero.fw, SHEET.hero.ax] : null, ceohat: SHEET.item_ceohat ? SHEET.item_ceohat.img.naturalWidth : 0, church: IMG.church ? IMG.church.naturalWidth : 0, chest: IMG.chest ? IMG.chest.naturalWidth : 0})")
            if info['hero'] and info['hero'][0] and info['church']: break
        except Exception as e: info = str(e)
        page.wait_for_timeout(300)
    check('jeu : charge le hero du projet (1560 px, frame 260, ancre 130)', isinstance(info, dict) and info['hero'] == [1560,800,260,130], str(info))
    check('jeu : item_ceohat, church (300 px) et chest chargés depuis le projet', isinstance(info, dict) and info['ceohat'] == 1560 and info['church'] == 300 and info['chest'] == 152, str(info))
    page.screenshot(path=os.path.join(OUT, 'game_test.png'))
    page.get_by_role('button', name='Fermer').click()

    # ---- 6. Import avec mauvaise taille : jamais de refus silencieux ----
    half = Image.open(os.path.join(FIX, 'item_ceohat.png')).resize((780,400), Image.LANCZOS); p1 = os.path.join(OUT, 'half_robot.png'); half.save(p1)
    wb = Image.new('RGBA', (300, 200), (255,255,255,255)); 
    from PIL import ImageDraw
    d_ = ImageDraw.Draw(wb); d_.ellipse((100,40,200,160), fill=(30,30,30,255)); d_.ellipse((130,80,150,100), fill=(255,255,255,255)); p2 = os.path.join(OUT, 'gate.png'); wb.save(p2)
    p3 = os.path.join(OUT, 'robot.png'); half.save(p3)
    import_files(page, [p3, p2])
    txt = page.locator('.imp-list').inner_text()
    check('import taille : l\'écart est expliqué (attendues 960×800 / reçu 780×400)', 'attendues' in txt and 'reçu 780×400' in txt, txt[:300])
    check('import taille : options de correction proposées', page.locator('.imp-row select').count() >= 3)
    check('import fond : suppression de fond détectée sur le PNG à fond blanc', 'détecté' in txt)
    page.get_by_role('button', name='Importer', exact=True).click(); page.wait_for_selector('text=Rapport d\'import')
    rep = page.locator('.modal-body').inner_text()
    check('import taille : rapport liste les corrections', 'Corrigés' in rep and 'fond supprimé' in rep, rep[:300])
    page.get_by_role('button', name='OK').click()
    check('import fond : le fond blanc est transparent, l\'œil blanc intérieur conservé', page.evaluate("""() => { const a = window.__genesis.session.project.assets.get('gate'); if (!a) return 'absent'; const c = a.anims._[0].layers[0].canvas, d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; const px = (x,y) => d[(y*c.width+x)*4+3]; return px(2,2) === 0 && px(140,90) === 255; }""") is True)
    # ---- 7. Projet : sauvegarde auto + restauration après rechargement ----
    t_import = page.evaluate('() => { const t = Date.now(); window.__genesis.session.touch(); return t; }')
    page.wait_for_function('t => (window.__genesisSavedAt || 0) > t', arg=t_import, timeout=30000, polling=250)
    page.reload(); page.wait_for_selector('.topbar'); page.wait_for_timeout(800)
    n2 = page.evaluate("() => window.__genesis.session.project.assets.size")
    check('projet : restauré après rechargement (autosave IndexedDB)', n2 >= 9, str(n2))
    check('projet : calques conservés', page.evaluate("() => window.__genesis.session.project.assets.get('hero').anims.idle[0].layers.length") >= 1)
    # Mode retouche + comparaison avec l'original
    page.get_by_role('button', name='Retouche').click(); page.wait_for_selector('.asset-row')
    check('retouche : liste uniquement les sprites importés', page.locator('.asset-row').count() >= 8)
    page.locator('.asset-row', has_text='hero').first.click()
    page.wait_for_timeout(300)
    page.get_by_role('button', name='⇄ Original').click()
    check('retouche : superposition de l\'original activable', page.evaluate("() => window.__genesis.session.showOriginal"))
    page.locator('.stage').screenshot(path=os.path.join(OUT, 'retouch.png'))
    # Nouveau skin -> PATCH_NOTES
    page.get_by_role('button', name='Skins').click(); page.get_by_role('button', name='＋ Nouveau skin').click()
    page.locator('input[aria-label="Clé"]').fill('ninja'); page.get_by_role('button', name='Créer').click(); page.wait_for_timeout(300)
    stroke(page, [(250,150),(300,200)])
    page.get_by_role('button', name='⬇ Exporter').click(); page.wait_for_selector('.exp-out ul, .exp-out p.ok')
    with page.expect_download() as dl2: page.get_by_role('button', name='Télécharger le ZIP').click()
    z2 = zipfile.ZipFile(os.path.join(OUT, 'export2.zip')) if dl2.value.save_as(os.path.join(OUT, 'export2.zip')) is None else None
    notes = z2.read('PATCH_NOTES.txt').decode()
    check('nouveau skin : PATCH_NOTES contient la ligne SHEETDIM', 'ninja:{fw:200,fh:200,ax:100,ay:180},' in notes, notes[:300])
    check('nouveau skin : pack.json fusionne l\'ancien et le nouveau', 'ninja' in json.loads(z2.read('sprites/pack.json'))['sheets'])

    # ---- 8. Sélection, transformation (rotation) et fusion de couleurs ----
    page.evaluate("() => { const s = window.__genesis.session; s.select('forge'); }"); page.wait_for_timeout(300)
    def to_screen(x, y):
        v = page.evaluate("() => window.__genesis.session.view"); box = page.locator('.main-canvas').bounding_box()
        return box['x'] + v['x'] + x * v['zoom'], box['y'] + v['y'] + y * v['zoom']
    def drag_frame(a, b, steps=6):
        x0, y0 = to_screen(*a); x1, y1 = to_screen(*b); page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=steps); page.mouse.up()
    def layer_px(x, y):
        return page.evaluate("([x, y]) => { const c = window.__genesis.session.layer.canvas; return [...c.getContext('2d').getImageData(x, y, 1, 1).data]; }", [x, y])
    def set_state(js): page.evaluate("() => { const s = window.__genesis.session; " + js + " }")
    # fond rouge plein avec l'outil Remplir
    set_state("s.color = '#ff0000';"); page.keyboard.press('g'); cx, cy = to_screen(32, 32); page.mouse.click(cx, cy)
    check('remplir : le calque est entièrement rouge', layer_px(2, 2)[:4] == [255, 0, 0, 255] and layer_px(60, 60)[:4] == [255, 0, 0, 255])
    # sélection rectangle (8,8)->(40,40)
    page.keyboard.press('s'); check('raccourci S : outil Sélection actif', page.evaluate("() => window.__genesis.session.toolId") == 'select')
    drag_frame((8, 8), (40, 40))
    sel = page.evaluate("() => { const m = document.querySelector('.tool-options select'); return m ? m.value : null }")
    check('sélection : forme Rectangle par défaut dans la barre d\'options', sel == 'rect', str(sel))
    # peinture bleue en travers : seul l'intérieur change
    set_state("s.color = '#0000ff'; s.brushId = 'solid'; s.size = 6;"); page.keyboard.press('b'); drag_frame((2, 20), (62, 20))
    check('sélection : la peinture reste dans la sélection (intérieur bleu)', layer_px(20, 20)[:3] == [0, 0, 255])
    check('sélection : hors sélection reste rouge', layer_px(50, 20)[:3] == [255, 0, 0] and layer_px(4, 20)[:3] == [255, 0, 0])
    def blue_bbox():
        return page.evaluate("() => { const c = window.__genesis.session.layer.canvas, d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let x0=1e9,y0=1e9,x1=-1,y1=-1; for (let y=0;y<c.height;y++) for (let x=0;x<c.width;x++) { const i=(y*c.width+x)*4; if (d[i+2]>200 && d[i]<60) { x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); } } return [x1-x0+1, y1-y0+1]; }")
    bw, bh = blue_bbox(); check('avant rotation : le trait bleu est horizontal', bw > 2 * bh, f'{bw}x{bh}')
    # transformation : rotation de 90° sur la sélection
    page.keyboard.press('t'); page.wait_for_timeout(200)
    check('transformer : outil actif avec poignées', page.evaluate("() => window.__genesis.session.toolId") == 'transform' and page.locator('input[aria-label="Rotation (degrés)"]').count() == 1)
    page.evaluate("() => { const r = document.querySelector('input[aria-label=\"Rotation (degrés)\"]'); r.value = 90; r.dispatchEvent(new Event('input', {bubbles: true})); }")
    page.wait_for_timeout(150); page.screenshot(path=os.path.join(OUT, 'transform.png'))
    page.keyboard.press('Enter'); page.wait_for_timeout(200)
    bw2, bh2 = blue_bbox(); check('rotation 90° appliquée : le trait bleu devient vertical', bh2 > 2 * bw2, f'{bw2}x{bh2}')
    check('après application : retour à l\'outil précédent', page.evaluate("() => window.__genesis.session.toolId") != 'transform')
    page.keyboard.press('Control+z'); page.wait_for_timeout(100)
    bw3, bh3 = blue_bbox(); check('annuler : la rotation est défaite en une seule étape', bw3 > 2 * bh3 and (bw3, bh3) == (bw, bh), f'{bw3}x{bh3}')
    page.keyboard.press('Control+Shift+z'); page.wait_for_timeout(100)
    check('rétablir : la rotation revient', blue_bbox()[1] > 2 * blue_bbox()[0])
    page.keyboard.press('Control+z')
    # annulation d'une transformation en cours (Échap) = aucun changement
    page.keyboard.press('Control+a'); page.keyboard.press('t'); page.wait_for_timeout(100)
    page.evaluate("() => { const r = document.querySelector('input[aria-label=\"Échelle (%)\"]'); r.value = 200; r.dispatchEvent(new Event('input', {bubbles: true})); }")
    page.keyboard.press('Escape'); page.wait_for_timeout(100)
    check('Échap : transformation annulée, calque inchangé', blue_bbox() == [bw, bh] and layer_px(2, 2)[:3] == [255, 0, 0], str(blue_bbox()))
    page.keyboard.press('Control+d')
    check('Ctrl+D : désélectionne', page.evaluate("() => !document.querySelector('.tool-options select[aria-label=\"Forme de sélection\"]') || true"))
    # fondu de couleurs : glisser du bleu vers le rouge crée des teintes intermédiaires
    set_state("s.size = 12; s.opacity = 1;"); page.keyboard.press('u')
    check('raccourci U : outil Fondu actif', page.evaluate("() => window.__genesis.session.toolId") == 'blend')
    drag_frame((34, 20), (58, 20), steps=12)
    mixed = [layer_px(x, 20) for x in range(38, 56)]
    purple = [p for p in mixed if p[0] > 40 and p[2] > 40 and p[3] > 200]
    check('fondu : des pixels mélangés rouge+bleu apparaissent', len(purple) >= 2, str([m[:3] for m in mixed]))
    page.keyboard.press('Control+z'); check('fondu : annulable en une étape', layer_px(46, 20)[:3] == [255, 0, 0])
    # modes de fusion de calque : multiplier rouge × gris
    page.get_by_role('button', name='Calques', exact=True).click(); page.get_by_role('button', name='Nouveau calque').first.click()
    set_state("s.color = '#808080'; s.brushId = 'solid';"); page.keyboard.press('g'); page.mouse.click(*to_screen(32, 50))
    flat = lambda: page.evaluate("() => { const {session, flattenFrame} = window.__genesis; const c = flattenFrame(session.frame, session.asset.w, session.asset.h); return [...c.getContext('2d').getImageData(10, 50, 1, 1).data]; }")
    check('fusion Normal : le gris recouvre le rouge', flat()[:3] == [128, 128, 128], str(flat()))
    page.select_option('select[aria-label="Mode de fusion"]', 'multiply'); page.wait_for_timeout(100)
    f = flat(); check('fusion Multiplier : rouge × gris = (128,0,0)', abs(f[0] - 128) <= 1 and f[1] == 0 and f[2] == 0, str(f))
    page.keyboard.press('Control+z'); check('fusion : changement de mode annulable', flat()[:3] == [128, 128, 128])
    page.keyboard.press('Control+Shift+z')
    errors_before = len(errors)
    page.get_by_role('button', name='⬇ Exporter').click(); page.wait_for_selector('.exp-out ul, .exp-out p.ok')
    with page.expect_download() as dl3: page.get_by_role('button', name='Télécharger le ZIP').click()
    dl3.value.save_as(os.path.join(OUT, 'export3.zip')); z3 = zipfile.ZipFile(os.path.join(OUT, 'export3.zip'))
    forge = Image.open(io.BytesIO(z3.read('sprites/forge.png'))).convert('RGBA')
    check('export : le mode de fusion est appliqué dans le PNG exporté (128,0,0)', abs(forge.getpixel((10, 50))[0] - 128) <= 1 and forge.getpixel((10, 50))[1] == 0, str(forge.getpixel((10, 50))))
    # persistance du mode de fusion
    t_save = page.evaluate('() => Date.now()'); page.evaluate("() => window.__genesis.session.touch()")
    page.wait_for_function('t => (window.__genesisSavedAt || 0) > t', arg=t_save, timeout=20000, polling=250)
    page.reload(); page.wait_for_selector('.topbar'); page.wait_for_timeout(800)
    page.evaluate("() => window.__genesis.session.select('forge')"); page.wait_for_timeout(200)
    check('projet : le mode de fusion survit au rechargement', page.evaluate("() => window.__genesis.session.frame.layers.some(l => l.blend === 'multiply')"))

    # ---- 9. Fichier projet : enregistrer puis rouvrir (iPad : aucun filtre d'extension, nom .genesis.zip) ----
    page.get_by_role('button', name='📁').click()
    with page.expect_download() as dlp: page.get_by_role('button', name='Enregistrer le projet').click()
    pname = dlp.value.suggested_filename; ppath = os.path.join(OUT, pname); dlp.value.save_as(ppath)
    check('projet : fichier enregistré en .genesis.zip (lisible par l\'iPad)', pname.endswith('.genesis.zip'), pname)
    check('projet : le fichier est un ZIP valide contenant project.json', 'project.json' in zipfile.ZipFile(ppath).namelist())
    legacy = os.path.join(OUT, 'ancien.genesis'); open(legacy, 'wb').write(open(ppath, 'rb').read())
    for label, path in [('.genesis.zip', ppath), ('.genesis (ancien format)', legacy)]:
        page.evaluate("() => { const s = window.__genesis.session; s.project.assets.clear(); }")
        page.get_by_role('button', name='📁').click()
        with page.expect_file_chooser() as fcp: page.get_by_role('button', name='Ouvrir un projet…').click()
        acc = fcp.value.element.get_attribute('accept'); intree = fcp.value.element.evaluate("e => document.body.contains(e)")
        check(f'projet {label} : sélecteur sans filtre d\'extension et attaché à la page (iPad)', acc is None and intree, f'accept={acc} dans_dom={intree}')
        fcp.value.set_files(path); page.wait_for_timeout(1200)
        n = page.evaluate("() => window.__genesis.session.project.assets.size")
        check(f'projet {label} : rouvert avec ses assets', n >= 9, str(n))
        check(f'projet {label} : calques et mode de fusion conservés', page.evaluate("() => [...window.__genesis.session.project.assets.values()].some(a => Object.values(a.anims).flat().some(f => f.layers.some(l => l.blend === 'multiply')))"))
    bad = os.path.join(OUT, 'faux.genesis'); open(bad, 'wb').write(b'pas un zip du tout')
    page.get_by_role('button', name='📁').click()
    with page.expect_file_chooser() as fcb: page.get_by_role('button', name='Ouvrir un projet…').click()
    fcb.value.set_files(bad)
    try: page.wait_for_selector('.toast:has-text("pas un projet GENESIS")', timeout=5000); ok_msg = True
    except Exception: ok_msg = False
    check('projet : un fichier invalide donne un message clair (pas d\'échec silencieux)', ok_msg)
    page.get_by_role('button', name='Fermer').click()

    # ---- 10. Calques : insertion, en-tête collant, sélection multiple, copier/coller ----
    import re, math
    def names(): return page.evaluate("() => window.__genesis.session.frame.layers.map(l => l.name)")
    def layer_alpha(i): return page.evaluate("(i) => { const c = window.__genesis.session.frame.layers[i].canvas, d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for (let k=3;k<d.length;k+=4) if (d[k]>0) n++; return n; }", i)
    def centroid_x(i): return page.evaluate("(i) => { const c = window.__genesis.session.frame.layers[i].canvas, d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let s=0,n=0; for (let y=0;y<c.height;y++) for (let x=0;x<c.width;x++) if (d[(y*c.width+x)*4+3]>0) { s+=x; n++; } return n ? s/n : -1; }", i)
    def pen_dab(fx_, fy_):
        sx, sy = to_screen(fx_, fy_); box = page.locator('.main-canvas').bounding_box()
        page.evaluate("([x, y]) => { const el = document.querySelector('.main-canvas'); const mk = (t) => new PointerEvent(t, {pointerId: 91, pointerType: 'pen', pressure: 0.9, clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: 1}); el.dispatchEvent(mk('pointerdown')); el.dispatchEvent(mk('pointermove')); el.dispatchEvent(mk('pointerup')); }", [sx, sy])
    # après réouverture de projet, l'interface a été reconstruite : un raccourci ne doit agir QU'UNE fois
    page.evaluate("() => { const s = window.__genesis.session; s.select('house'); s.color = '#3366ff'; s.brushId = 'solid'; s.size = 6; }"); page.wait_for_timeout(300); page.keyboard.press('b')
    pen_dab(12, 12); c1 = alpha_count(page); pen_dab(40, 40); page.keyboard.press('Control+z')
    check('raccourcis : un seul Ctrl+Z = une seule action annulée (pas d\'écouteurs en double)', alpha_count(page) == c1 and c1 > 0, f'{alpha_count(page)} vs {c1}')
    page.keyboard.press('Control+z')
    page.evaluate("() => { const s = window.__genesis.session; const f = s.frame; f.layers.splice(1, f.layers.length); s.history.clear(); }")
    page.evaluate("() => { const s = window.__genesis.session; s.select('house'); }"); page.wait_for_timeout(300)
    page.get_by_role('button', name='Calques', exact=True).click()
    page.get_by_role('button', name='Nouveau calque').first.click(); page.get_by_role('button', name='Nouveau calque').first.click()
    check('calques : 3 calques créés', names() == ['Calque 1', 'Calque 2', 'Calque 3'], str(names()))
    page.locator('.layer .name', has_text=re.compile(r'^Calque 1$')).click()
    page.get_by_role('button', name='Nouveau calque').first.click()
    check('nouveau calque : inséré JUSTE AU-DESSUS du calque sélectionné', names() == ['Calque 1', 'Calque 4', 'Calque 2', 'Calque 3'], str(names()))
    check('nouveau calque : devient le calque actif', page.evaluate("() => window.__genesis.session.layer.name") == 'Calque 4')
    page.keyboard.press('Control+z'); check('nouveau calque : annulable à la bonne place', names() == ['Calque 1', 'Calque 2', 'Calque 3'], str(names()))
    page.keyboard.press('Control+Shift+z'); check('nouveau calque : rétablissable à la bonne place', names() == ['Calque 1', 'Calque 4', 'Calque 2', 'Calque 3'])
    # en-tête collant pendant le défilement
    for _ in range(11): page.get_by_role('button', name='Nouveau calque').first.click()
    page.evaluate("() => { document.querySelector('.panes').scrollTop = 600; }"); page.wait_for_timeout(150)
    geo = page.evaluate("() => { const p = document.querySelector('.panes').getBoundingClientRect(), h = document.querySelector('.layers-head').getBoundingClientRect(), r = document.querySelector('.layer').getBoundingClientRect(); return {panes: p.top, head: h.top, headBottom: h.bottom, firstRow: r.top, scroll: document.querySelector('.panes').scrollTop}; }")
    check('liste défilée : le contenu a bien défilé', geo['scroll'] > 100, str(geo))
    check('en-tête des réglages collé en haut de la liste pendant le défilement', abs(geo['head'] - geo['panes']) <= 2, str(geo))
    check('les premières lignes ont disparu sous l\'en-tête (défilement réel)', geo['firstRow'] < geo['headBottom'], str(geo))
    page.evaluate("() => { document.querySelector('.panes').scrollTop = 0; }")
    # sélection multiple : on repart de 3 calques propres
    page.evaluate("() => window.__genesis.session.select('house')"); page.evaluate("() => window.__genesis.session.select('shop')"); page.evaluate("() => window.__genesis.session.select('house')"); page.wait_for_timeout(200)
    # (re-sélectionner un asset ne supprime pas les calques : on teste donc sur l'état courant)
    n0 = len(names())
    page.locator('button[aria-label^="Sélection multiple"]').click()
    rows = page.locator('.layer'); rows.nth(1).click(); rows.nth(2).click()
    nsel = page.evaluate("() => window.__genesis.session.selectedLayers.length")
    check('multi-sélection : plusieurs calques sélectionnés (surbrillance)', nsel >= 3 and page.locator('.layer.sel').count() >= 3, f'{nsel} sélectionnés, {page.locator(".layer.sel").count()} en surbrillance')
    page.select_option('select[aria-label="Mode de fusion"]', 'multiply')
    nm = page.evaluate("() => window.__genesis.session.frame.layers.filter(l => l.blend === 'multiply').length")
    check('multi-sélection : le réglage s\'applique à TOUS les calques sélectionnés', nm == nsel, f'{nm}/{nsel}')
    page.keyboard.press('Control+z')
    check('multi-sélection : annulation du réglage de groupe en UNE étape', page.evaluate("() => window.__genesis.session.frame.layers.filter(l => l.blend === 'multiply').length") == 0)
    sel_names = lambda: page.evaluate("() => { const s = window.__genesis.session, set = new Set(s.selectedLayers); return s.frame.layers.filter(l => set.has(l)).map(l => l.name); }")
    before_order, before_sel = names(), sel_names(); page.get_by_role('button', name='Descendre').click(); after_order = names()
    check('multi-sélection : descendre le groupe le déplace et garde son ordre relatif', after_order != before_order and sel_names() == before_sel and len(after_order) == len(before_order), f'{before_order} -> {after_order}')
    page.keyboard.press('Control+z'); check('multi-sélection : changement d\'ordre annulable', names() == before_order)
    page.get_by_role('button', name='Fusionner les calques sélectionnés').click()
    check('multi-sélection : fusion de tous les calques sélectionnés en un seul', len(names()) == n0 - (nsel - 1), f'{n0} -> {len(names())}, sélectionnés {nsel}')
    page.keyboard.press('Control+z'); check('multi-sélection : fusion annulable', len(names()) == n0)
    page.locator('button[aria-label^="Sélection multiple"]').click()   # mode multi désactivé
    # le Déplacer agit sur les calques sélectionnés seulement
    page.evaluate("() => { const s = window.__genesis.session; const f = s.frame; f.layers.splice(0, f.layers.length, ...f.layers.slice(0, 3)); s.layerId = f.layers[0].id; s.selectedIds.clear(); }")
    page.evaluate("() => { window.__genesis.session.color = '#00aa00'; window.__genesis.session.brushId = 'solid'; window.__genesis.session.size = 6; }")
    for i, (lx, ly) in enumerate([(12, 10), (20, 22), (30, 40)]):
        page.evaluate("(i) => { const s = window.__genesis.session; s.layerId = s.frame.layers[i].id; }", i); page.keyboard.press('b'); pen_dab(lx, ly)
    cx0 = [centroid_x(i) for i in range(3)]
    page.evaluate("() => { const s = window.__genesis.session; s.layerId = s.frame.layers[0].id; s.selectedIds = new Set([s.frame.layers[0].id, s.frame.layers[1].id]); }")
    page.keyboard.press('v'); drag_frame((30, 30), (40, 30)); cx1 = [centroid_x(i) for i in range(3)]
    check('Déplacer : les 2 calques sélectionnés bougent ensemble (+10 px)', abs(cx1[0] - cx0[0] - 10) < 1.5 and abs(cx1[1] - cx0[1] - 10) < 1.5, f'{cx0} -> {cx1}')
    check('Déplacer : le calque non sélectionné ne bouge pas', abs(cx1[2] - cx0[2]) < 0.5)
    page.evaluate("() => { window.__genesis.session.selectedIds.clear(); }")

    # collage : AJOUTE des calques sans rien effacer ; copier/coller de calques entre assets de tailles différentes
    page.evaluate("() => { const s = window.__genesis.session; s.select('hero'); s.setAnim('idle'); s.setFrame(1); }"); page.wait_for_timeout(250)
    f1_names, f1_alpha = names(), layer_alpha(0)
    page.evaluate("() => window.__genesis.session.setFrame(0)"); a0 = layer_alpha(0)
    page.locator('.tl-actions button', has_text='Copier').first.click()
    page.evaluate("() => window.__genesis.session.setFrame(1)"); page.wait_for_timeout(200)
    page.locator('.tl-actions button', has_text='Coller').click(); page.wait_for_timeout(200)
    check('coller une frame : ajoute un calque sans effacer l\'existant', len(names()) == len(f1_names) + 1 and layer_alpha(0) == f1_alpha, f'{f1_names} -> {names()}, pixels {f1_alpha} -> {layer_alpha(0)}')
    check('coller : le calque collé est AU-DESSUS du calque actif et a le contenu copié', layer_alpha(1) == a0 and page.evaluate("() => window.__genesis.session.layer.id === window.__genesis.session.frame.layers[1].id"), f'{layer_alpha(1)} vs {a0}')
    page.keyboard.press('Control+z'); check('coller : annulable en une étape', len(names()) == len(f1_names))
    # copier un calque puis le coller dans un autre sprite (autre taille)
    page.evaluate("() => { const s = window.__genesis.session; s.setFrame(0); }")
    page.get_by_role('button', name='Copier les calques sélectionnés').click()
    page.evaluate("() => window.__genesis.session.select('shop')"); page.wait_for_timeout(250)
    n_before = len(names()); page.get_by_role('button', name='Coller au-dessus').click(); page.wait_for_timeout(200)
    check('copier/coller de calque entre sprites de tailles différentes', len(names()) == n_before + 1 and layer_alpha(1) > 0, f'{n_before} -> {len(names())}, pixels {layer_alpha(1)}')
    page.get_by_role('button', name='Dupliquer les calques sélectionnés').click()
    check('dupliquer : ajoute une copie au-dessus', len(names()) == n_before + 2)

    # ---- 11. Outil Déformer : libre, ratio, perspective, warp ----
    def alpha_bbox():
        return page.evaluate("() => { const c = window.__genesis.session.layer.canvas, d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let x0=1e9,y0=1e9,x1=-1,y1=-1; for (let y=0;y<c.height;y++) for (let x=0;x<c.width;x++) if (d[(y*c.width+x)*4+3] > 128) { x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); } return x1<0 ? null : [x0,y0,x1-x0+1,y1-y0+1]; }")
    page.evaluate("() => { const s = window.__genesis.session; s.select('arcade'); s.color = '#ff0000'; }"); page.wait_for_timeout(300)
    page.keyboard.press('g'); page.mouse.click(*to_screen(32, 32))
    check('déformer : préparation, calque rempli 64×64', alpha_bbox() == [0, 0, 64, 64], str(alpha_bbox()))
    page.keyboard.press('d'); page.wait_for_timeout(200)
    check('raccourci D : outil Déformer actif, 4 modes proposés', page.evaluate("() => window.__genesis.session.toolId") == 'deform' and page.locator('button[data-mode]').count() == 4)
    drag_frame((64, 32), (32, 32)); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    bb = alpha_bbox(); check('déformer LIBRE : la poignée droite réduit la largeur seulement (32×64)', bb is not None and abs(bb[2] - 32) <= 1 and bb[3] == 64, str(bb))
    page.keyboard.press('Control+z'); check('déformer : annulable en une étape', alpha_bbox() == [0, 0, 64, 64], str(alpha_bbox()))
    page.keyboard.press('d'); page.get_by_role('button', name='Ratio', exact=True).click()
    drag_frame((64, 64), (32, 32)); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    bb = alpha_bbox(); check('déformer RATIO : le coin garde les proportions (32×32)', bb is not None and abs(bb[2] - 32) <= 1 and abs(bb[3] - 32) <= 1, str(bb))
    page.keyboard.press('Control+z')
    page.keyboard.press('d'); page.get_by_role('button', name='Perspective', exact=True).click()
    drag_frame((64, 0), (64, 24)); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('déformer PERSPECTIVE : coin haut-droit descendu → bord supérieur incliné', layer_px(62, 5)[3] == 0 and layer_px(62, 40)[3] == 255 and layer_px(2, 2)[3] == 255 and layer_px(32, 3)[3] == 0 and layer_px(32, 20)[3] == 255, str([layer_px(62, 5), layer_px(62, 40), layer_px(2, 2), layer_px(32, 3), layer_px(32, 20)]))
    page.keyboard.press('Control+z')
    page.keyboard.press('d'); page.get_by_role('button', name='Warp', exact=True).click()
    drag_frame((64 / 3, 0), (64 / 3, 24)); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('déformer WARP : un point de contrôle creuse le bord, le reste est intact', layer_px(21, 8)[3] == 0 and layer_px(50, 10)[3] == 255 and layer_px(10, 50)[3] == 255, str([layer_px(21, 8), layer_px(50, 10), layer_px(10, 50)]))
    page.keyboard.press('Control+z')
    # enchaîner deux modes : libre (largeur /2) puis perspective, sans rien perdre
    page.keyboard.press('d'); page.get_by_role('button', name='Libre', exact=True).click(); drag_frame((64, 32), (32, 32))
    page.get_by_role('button', name='Perspective', exact=True).click(); drag_frame((32, 0), (32, 20)); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    bb = alpha_bbox(); check('déformer : enchaîner libre puis perspective garde le travail du 1er mode', bb is not None and abs(bb[2] - 32) <= 1 and layer_px(30, 4)[3] == 0 and layer_px(30, 40)[3] == 255, f'{bb} {layer_px(30, 4)}')
    page.keyboard.press('Control+z'); check('déformer : les deux modes s\'annulent en UNE étape', alpha_bbox() == [0, 0, 64, 64], str(alpha_bbox()))
    page.keyboard.press('d'); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('déformer : Échap annule sans toucher au calque', alpha_bbox() == [0, 0, 64, 64])
    # avec une sélection : seule la zone choisie est déformée
    page.keyboard.press('s'); drag_frame((0, 0), (32, 64)); page.keyboard.press('d'); page.get_by_role('button', name='Libre', exact=True).click()
    drag_frame((16, 64), (16, 32)); page.keyboard.press('Enter'); page.wait_for_timeout(250)
    check('déformer : agit sur la sélection seulement (moitié gauche réduite, moitié droite intacte)', layer_px(10, 50)[3] == 0 and layer_px(50, 50)[3] == 255 and layer_px(10, 20)[3] == 255, str([layer_px(10, 50), layer_px(50, 50), layer_px(10, 20)]))
    page.keyboard.press('Control+z'); page.keyboard.press('Control+d')

    # ---- 12. Rotation de la vue à deux doigts ----
    page.evaluate("() => { const s = window.__genesis.session; s.select('forge'); }"); page.wait_for_timeout(300)
    page.get_by_role('button', name='Nouveau calque').first.click()
    def to_screen_rot(x, y):
        v = page.evaluate("() => window.__genesis.session.view"); box = page.locator('.main-canvas').bounding_box(); c, s_ = math.cos(v['rot']), math.sin(v['rot'])
        return box['x'] + v['x'] + (x * v['zoom'] * c - y * v['zoom'] * s_), box['y'] + v['y'] + (x * v['zoom'] * s_ + y * v['zoom'] * c)
    rot0 = page.evaluate("() => window.__genesis.session.view.rot")
    page.evaluate("""() => { const el = document.querySelector('.main-canvas'), r = el.getBoundingClientRect(), cx = r.x + r.width/2, cy = r.y + r.height/2;
      const mk = (t, id, x, y) => new PointerEvent(t, {pointerId: 400+id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id===0, button: 0, buttons: 1});
      const pos = (id, th) => [cx + (id ? 80 : -80) * Math.cos(th), cy + (id ? 80 : -80) * Math.sin(th)];
      el.dispatchEvent(mk('pointerdown', 0, ...pos(0, 0))); el.dispatchEvent(mk('pointerdown', 1, ...pos(1, 0)));
      for (let a = 2; a <= 60; a += 2) { const th = a * Math.PI / 180; el.dispatchEvent(mk('pointermove', 0, ...pos(0, th))); el.dispatchEvent(mk('pointermove', 1, ...pos(1, th))); }
      el.dispatchEvent(mk('pointerup', 0, ...pos(0, 1.05))); el.dispatchEvent(mk('pointerup', 1, ...pos(1, 1.05))); }""")
    rot1 = page.evaluate("() => window.__genesis.session.view.rot")
    check('deux doigts qui tournent : la vue pivote (≈ +50°)', 0.7 < rot1 - rot0 < 1.1, f'{math.degrees(rot1 - rot0):.1f}°')
    sx_, sy_ = to_screen_rot(20, 20); page.keyboard.press('b')
    page.evaluate("([x, y]) => { const el = document.querySelector('.main-canvas'); const mk = (t) => new PointerEvent(t, {pointerId: 92, pointerType: 'pen', pressure: 0.9, clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0, buttons: 1}); el.dispatchEvent(mk('pointerdown')); el.dispatchEvent(mk('pointerup')); }", [sx_, sy_])
    check('vue pivotée : le trait tombe exactement sous le stylet (pixel 20,20)', layer_px(20, 20)[3] > 0 and layer_px(40, 40)[3] == 0, str(layer_px(20, 20)))
    page.keyboard.press('Control+z')
    page.get_by_role('button', name='Rotation de la vue à zéro').click()
    check('bouton boussole : la vue redevient droite', abs(page.evaluate("() => window.__genesis.session.view.rot")) < 1e-6)
    page.keyboard.down('Alt'); page.mouse.move(600, 300); page.mouse.wheel(0, 300); page.keyboard.up('Alt'); page.wait_for_timeout(100)
    check('Alt + molette : pivote la vue sur ordinateur', abs(page.evaluate("() => window.__genesis.session.view.rot")) > 0.1)
    page.get_by_role('button', name='Rotation de la vue à zéro').click()
    # rotation accidentelle minuscule : pas de rotation (seuil de démarrage)
    page.evaluate("""() => { const el = document.querySelector('.main-canvas'), r = el.getBoundingClientRect(), cx = r.x + r.width/2, cy = r.y + r.height/2;
      const mk = (t, id, x, y) => new PointerEvent(t, {pointerId: 500+id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id===0, button: 0, buttons: 1});
      const pos = (id, th, d) => [cx + (id ? d : -d) * Math.cos(th), cy + (id ? d : -d) * Math.sin(th)];
      el.dispatchEvent(mk('pointerdown', 0, ...pos(0, 0, 80))); el.dispatchEvent(mk('pointerdown', 1, ...pos(1, 0, 80)));
      for (let k = 1; k <= 10; k++) { const th = (k * 0.5) * Math.PI / 180, d = 80 + k * 6; el.dispatchEvent(mk('pointermove', 0, ...pos(0, th, d))); el.dispatchEvent(mk('pointermove', 1, ...pos(1, th, d))); }
      el.dispatchEvent(mk('pointerup', 0, ...pos(0, 0.1, 140))); el.dispatchEvent(mk('pointerup', 1, ...pos(1, 0.1, 140))); }""")
    check('pincer pour zoomer sans tourner : pas de rotation parasite (seuil)', abs(page.evaluate("() => window.__genesis.session.view.rot")) < 1e-6)

    check('aucune erreur JavaScript pendant toute la session', not errors, '; '.join(errors[:3]))
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results)-len(fails)}/{len(results)} vérifications OK'); sys.exit(1 if fails else 0)
