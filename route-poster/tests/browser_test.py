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

from playwright.sync_api import sync_playwright

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
            page = browser.new_page(viewport={"width": 1280, "height": 1000}, accept_downloads=True)
            errors, requests = [], []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: requests.append(request.url))
            page.goto(f"http://127.0.0.1:{server.server_port}/route-poster/index.html")
            page.wait_for_function("() => document.querySelector('#preview').complete && document.querySelector('#preview').naturalWidth > 0")
            assert page.locator("#preview-label").inner_text() == "EXEMPLE FICTIF"
            assert "Prototype gratuit" in page.locator("footer").inner_text()
            checks.append("initial preview and explicit fictitious sample")

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
            assert "TRACÉ FICTIF" not in svg and 'fill="#172a3a"' in svg
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
            assert page.locator("#preview-label").inner_text() == "EXEMPLE FICTIF"
            checks.append("invalid import preserves previous route; demo reset works")

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
