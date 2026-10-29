"""Read-only browser checks for the local GPX poster prototype.

Run: python route-poster/tests/browser_test.py
Needs Playwright and system Chromium; no network beyond a temporary local server.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import json
import struct
import re
import xml.etree.ElementTree as ET

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    checks = []
    try:
        with sync_playwright() as playwright, TemporaryDirectory() as temporary:
            browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
            loading = browser.new_page()
            loading.route('**/route-poster/app.js', lambda route: route.abort())
            loading.goto(f"http://127.0.0.1:{server.server_port}/route-poster/index.html")
            expect(loading.locator('#gpx')).to_be_disabled()
            expect(loading.locator('#png')).to_be_disabled()
            expect(loading.locator('#file-status')).to_have_text('Chargement de l’éditeur…')
            loading.close()
            checks.append("imports and exports remain disabled until the editor module is ready")
            page = browser.new_page(viewport={"width": 1280, "height": 1000}, accept_downloads=True)
            page.emulate_media(reduced_motion='reduce')
            errors, requests = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            page.goto(f"http://127.0.0.1:{server.server_port}/route-poster/index.html")
            page.wait_for_function("() => document.querySelector('#preview').complete && document.querySelector('#preview').naturalWidth > 0")
            assert page.locator("#preview-label").inner_text() == "EXEMPLE FICTIF · COURSE"
            assert "Prototype gratuit" in page.locator("footer").inner_text()
            expect(page.locator('#gpx')).to_be_enabled()
            expect(page.locator('#png')).to_be_enabled()
            checks.append("initial preview and explicit fictitious sample")

            page.locator('.hero-actions a[href="#editor"]').click()
            expect(page).to_have_url(re.compile(r"#editor$"))
            expect(page.locator('#editor')).to_be_focused()
            page.locator('.hero-actions a[href="#examples"]').click()
            expect(page).to_have_url(re.compile(r"#examples$"))
            page.locator('.topnote').click()
            expect(page).to_have_url(re.compile(r"#gpx-help$"))
            assert page.locator('#gpx-help a[target="_blank"]').count() == 3
            assert "région de départ doit être débloquée" in page.locator('#gpx-help').inner_text()
            faq = page.locator('.faq summary').first
            faq.focus()
            page.keyboard.press('Enter')
            assert page.locator('.faq details').first.get_attribute('open') is not None
            page.keyboard.press('Space')
            assert page.locator('.faq details').first.get_attribute('open') is None
            checks.append("hero anchors, editor focus, GPX help links, FAQ keyboard toggle")

            examples = {}
            for example_id, category, title, palette in (
                ('run', 'COURSE', 'LE TOUR DES QUAIS', 'forest'),
                ('trail', 'TRAIL', 'LÀ-HAUT, LES CRÊTES', 'clay'),
                ('ride', 'VÉLO', 'LA GRANDE ÉCHAPPÉE', 'midnight'),
            ):
                page.locator(f'[data-example="{example_id}"]').click()
                expect(page.locator('#editor')).to_be_focused()
                assert page.locator('#preview-label').inner_text() == f'EXEMPLE FICTIF · {category}'
                assert page.locator('#title').input_value() == title
                assert page.locator(f'input[value="{palette}"]').is_checked()
                with page.expect_download() as pending:
                    page.locator('#svg').click()
                download = pending.value
                assert re.fullmatch(r'trace-[a-z0-9-]+-exemple-fictif-30x40\.svg', download.suggested_filename)
                path = Path(temporary) / f'{example_id}.svg'
                download.save_as(str(path))
                xml = ET.fromstring(path.read_text())
                assert f'{category} · TRACÉ FICTIF' in ''.join(xml.itertext())
                examples[example_id] = xml.find('.//{http://www.w3.org/2000/svg}polyline').get('points')
            assert len(set(examples.values())) == 3
            checks.append("three distinct selectable examples, matching palettes/titles, explicit fictitious SVG exports and safe filenames")

            typography = page.evaluate("""async () => {
              const c=await import('./core.js');
              const titles=['W'.repeat(64), 'Une longue traversée avec des amis et des souvenirs inoubliables', '🚲'.repeat(32), '<>&"\\' /../ éèàç: !?'.repeat(3)];
              return titles.map(title=>{
                const model=c.posterModel(c.demoRoute('trail'),{title});
                const doc=new DOMParser().parseFromString(c.svgPoster(model),'image/svg+xml');
                const svg=document.importNode(doc.documentElement,true); svg.setAttribute('width','900'); svg.setAttribute('height','1200');
                svg.style.position='absolute';svg.style.left='-10000px';document.body.append(svg);
                const nodes=[...svg.querySelectorAll('text')].filter(n=>n.getAttribute('font-family')==='Georgia' && Number(n.getAttribute('y'))<250);
                const bounds=nodes.map(n=>{const b=n.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
                const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),calls=[],original=ctx.fillText.bind(ctx);
                ctx.fillText=function(value,x,y,...rest){calls.push({value,x,y,font:this.font});return original(value,x,y,...rest);};
                c.drawPoster(canvas,model);
                const same=nodes.every(n=>calls.some(call=>call.value===n.textContent && call.x===Number(n.getAttribute('x')) && call.y===Number(n.getAttribute('y')) && Math.abs(parseFloat(call.font)-Number(n.getAttribute('font-size')))<0.0001));
                svg.remove();
                return {bounds,same,filename:c.exportFilename(title,true,'svg'),title:model.title,lines:model.titleLines.length};
              });
            }""")
            for case in typography:
                assert case['same'], case
                assert all(bound['x'] >= 75 and bound['x'] + bound['width'] <= 825 and bound['y'] + bound['height'] < 245 for bound in case['bounds']), case
                assert re.fullmatch(r'trace-[a-z0-9-]+-exemple-fictif-30x40\.svg', case['filename']), case
                assert len(case['title']) <= 64 and case['lines'] in (1, 2)
            checks.append("64-character/emoji/punctuation titles fit the poster; SVG and Canvas share line text/coordinates/font size; filenames normalized")

            result = page.evaluate("""async () => {
              const c = await import('./core.js');
              const split = `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="0.01"/></trkseg><trkseg><trkpt lat="40" lon="40"/><trkpt lat="40" lon="40.01"/></trkseg></trk></gpx>`;
              const route = c.parseGPX(split);
              const expected = c.haversine({lat:0,lon:0},{lat:0,lon:0.01}) + c.haversine({lat:40,lon:40},{lat:40,lon:40.01});
              const rejected = {};
              const invalid = {
                malformed: '<gpx><trk></gpx>',
                root: '<xml/>',
                missing: '<gpx><rte><rtept lat="0"/><rtept lat="0" lon="1"/></rte></gpx>',
                nonfinite: '<gpx><rte><rtept lat="Infinity" lon="0"/><rtept lat="0" lon="1"/></rte></gpx>',
                bounds: '<gpx><rte><rtept lat="91" lon="0"/><rtept lat="0" lon="1"/></rte></gpx>',
                hex: '<gpx><rte><rtept lat="0x1" lon="0"/><rtept lat="0" lon="1"/></rte></gpx>',
                doctype: '<!DOCTYPE gpx [<!ENTITY x "a">]><gpx/>',
                entity: '<!ENTITY x "a"><gpx/>',
                oversized: 'x'.repeat(c.MAX_BYTES + 1),
                tooMany: '<gpx><rte>'+'<rtept lat="0" lon="0"/>'.repeat(c.MAX_POINTS+1)+'</rte></gpx>'
              };
              for (const [name,text] of Object.entries(invalid)) {try {c.parseGPX(text);rejected[name]=false;}catch{rejected[name]=true;}}
              const large = c.parseGPX('<gpx><rte>'+Array.from({length:c.MAX_POINTS},(_,i)=>`<rtept lat="0" lon="${i/100000}"/>`).join('')+'</rte></gpx>');
              const model=c.posterModel(route,{title:'A & B <script>alert(1)</script>',date:'2026-10-29'});
              const xml=new DOMParser().parseFromString(c.svgPoster(model),'image/svg+xml');
              const across=c.parseGPX('<gpx><rte><rtept lat="0" lon="179.9"/><rtept lat="0" lon="-179.9"/></rte></gpx>');
              return {
                equator:c.haversine({lat:0,lon:0},{lat:0,lon:1}), splitDistance:route.distance, expected,
                splitPaths:model.paths.length, rejected, largeCount:large.count,
                sampleCount:c.sampleSegments(large.segments).flat().length,
                xmlErrors:xml.getElementsByTagNameNS('*','parsererror').length,
                scriptNodes:xml.getElementsByTagName('script').length,
                escapedTitle:xml.documentElement.getAttribute('aria-label'),
                antimeridianDistance:across.distance,
                finiteProjection:c.projectRoute(across.segments).flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),
                routeCount:c.parseGPX('<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:rte><g:rtept lat="1" lon="1"/><g:rtept lat="1" lon="2"/></g:rte></g:gpx>').count
              };
            }""")
            assert abs(result["equator"] - 111.19508) < 0.001, result
            assert abs(result["splitDistance"] - result["expected"]) < 1e-8, result
            assert result["splitPaths"] == 2 and result["splitDistance"] < 2.1
            assert all(result["rejected"].values()), result["rejected"]
            assert result["largeCount"] == 20000 and result["sampleCount"] <= 2000
            assert result["xmlErrors"] == 0 and result["scriptNodes"] == 0
            assert result["escapedTitle"] == "A & B <script>alert(1)</script>"
            assert 22 < result["antimeridianDistance"] < 23 and result["finiteProjection"]
            assert result["routeCount"] == 2
            checks.append("Haversine reference, split segments, GPX validation, 20k/2MB limits, namespaces, antimeridian, safe SVG")

            sampling = page.evaluate("""async () => {
              const c=await import('./core.js');
              let fragmentationRejected=false;
              try {c.parseGPX('<gpx><trk>'+('<trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="1"/></trkseg>').repeat(10000)+'</trk></gpx>');}
              catch(error){fragmentationRejected=error.message.includes('1 000 segments');}
              const segments=Array.from({length:1000},(_,i)=>Array.from({length:20},(_,j)=>({lat:i/1000,lon:j/1000})));
              const route={segments,count:20000,distance:c.routeDistance(segments),demo:false};
              const paths=c.sampleSegments(segments);
              const two=[Array.from({length:18000},(_,i)=>({lat:45,lon:i/100000})),Array.from({length:2000},(_,i)=>({lat:46,lon:i/100000}))];
              const sampled=c.sampleSegments(two);
              return {fragmentationRejected,points:paths.flat().length,paths:paths.length,
                polylines:(c.svgPoster(c.posterModel(route)).match(/<polyline /g)||[]).length,
                endpoints:paths.every((path,i)=>path[0]===segments[i][0]&&path.at(-1)===segments[i].at(-1)),
                twoPoints:sampled.flat().length,twoPaths:sampled.length,
                twoEndpoints:sampled.every((path,i)=>path[0]===two[i][0]&&path.at(-1)===two[i].at(-1))};
            }""")
            assert sampling["fragmentationRejected"], sampling
            assert sampling["points"] == 2000 and sampling["paths"] == 1000 and sampling["polylines"] == 1000, sampling
            assert sampling["endpoints"] and sampling["twoEndpoints"], sampling
            assert sampling["twoPoints"] == 2000 and sampling["twoPaths"] == 2, sampling
            checks.append("fragmented-route regression: explicit rejection above 1000 drawable segments, endpoints and 2000-point budget retained")

            gpx = b'<gpx><trk><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="1"/></trkseg></trk></gpx>'
            page.locator("#gpx").set_input_files({"name": "route.gpx", "mimeType": "application/gpx+xml", "buffer": gpx})
            page.wait_for_function("() => document.querySelector('#preview-label').textContent === 'VOTRE CRÉATION'")
            assert "111,2" in page.locator("#distance").inner_text()
            assert page.locator("#points").inner_text() == "2"
            page.locator("#title").fill('Ma course <script>alert("x")</script> & vélo')
            page.locator("#date").fill("2026-10-29")
            page.locator('input[value="midnight"]').check()
            page.wait_for_function("() => document.querySelector('#preview').complete && document.querySelector('#preview').naturalWidth > 0")
            assert "Minuit" in page.locator("#preview").get_attribute("alt")

            with page.expect_download() as pending:
                page.locator("#svg").click()
            download = pending.value
            path = Path(temporary) / "poster.svg"
            download.save_as(str(path))
            svg = path.read_text()
            assert 'width="300mm" height="400mm"' in svg
            assert "&lt;script&gt;" in svg and "<script>" not in svg
            assert "TRACÉ FICTIF" not in "".join(ET.fromstring(svg).itertext()) and 'fill="#172a3a"' in svg
            assert "29 octobre 2026" in svg
            checks.append("real GPX import, title/date/palette updates, actual SVG download")

            with page.expect_download(timeout=20000) as pending:
                page.locator("#png").click()
            path = Path(temporary) / "poster.png"
            pending.value.save_as(str(path))
            png = path.read_bytes()
            assert png[:8] == b"\x89PNG\r\n\x1a\n"
            assert struct.unpack(">II", png[16:24]) == (3543, 4724)
            assert not page.locator("#png").is_disabled()
            checks.append("actual PNG download at 3543 × 4724 pixels")

            page.locator("#gpx").set_input_files({"name": "invalid.gpx", "mimeType": "application/gpx+xml", "buffer": b"<gpx/>"})
            page.wait_for_function("() => !document.querySelector('#error').hidden")
            assert "précédent" in page.locator("#error").inner_text()
            assert "111,2" in page.locator("#distance").inner_text()
            page.locator("#demo").click()
            assert page.locator("#error").is_hidden()
            assert page.locator("#preview-label").inner_text() == "EXEMPLE FICTIF · COURSE"
            checks.append("invalid import preserves previous route; demo reset works")

            page.locator('#title').fill('AVANT EXPORT')
            page.evaluate("""() => {
              window.exportStarted=false; window.drawnTitles=[];
              window.originalToBlob=HTMLCanvasElement.prototype.toBlob;
              window.originalFillText=CanvasRenderingContext2D.prototype.fillText;
              CanvasRenderingContext2D.prototype.fillText=function(value,...args){window.drawnTitles.push(value);return window.originalFillText.call(this,value,...args);};
              HTMLCanvasElement.prototype.toBlob=function(callback,...args){window.exportStarted=true;return window.originalToBlob.call(this,blob=>setTimeout(()=>callback(blob),500),...args);};
            }""")
            with page.expect_download(timeout=20000) as pending:
                page.locator('#png').click()
                page.wait_for_function('() => window.exportStarted')
                page.locator('#title').fill('APRES EXPORT')
            assert pending.value.suggested_filename == 'trace-avant-export-exemple-fictif-30x40.png'
            assert 'AVANT EXPORT' in page.evaluate('() => window.drawnTitles')
            page.evaluate("""() => {HTMLCanvasElement.prototype.toBlob=window.originalToBlob;CanvasRenderingContext2D.prototype.fillText=window.originalFillText;}""")
            checks.append("PNG asynchronous export retains the title and filename captured at click time")

            unresolved = page.evaluate("""() => [...document.querySelectorAll('a[href^="#"], [aria-labelledby]')].flatMap(node=>{
              const ids=node.hasAttribute('aria-labelledby') ? node.getAttribute('aria-labelledby').split(/\\s+/) : [node.getAttribute('href').slice(1)];
              return ids.filter(id=>id&&!document.getElementById(id));
            })""")
            assert not unresolved, unresolved
            checks.append("all fragment links and aria-labelledby references resolve")

            for width in (320, 375, 768, 1280):
                page.set_viewport_size({"width": width, "height": 900})
                overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
                assert not overflow, f"Horizontal overflow at {width}px"
            checks.append("no horizontal overflow at 320, 375, 768, 1280px")

            external = [url for url in requests if not url.startswith((f"http://127.0.0.1:{server.server_port}/", "blob:", "data:"))]
            assert not external, external
            assert not errors, errors
            checks.append("no external request and no browser JS error during import/export")
            browser.close()
        print(json.dumps({"status": "pass", "checks": checks}, ensure_ascii=False, indent=2))
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
