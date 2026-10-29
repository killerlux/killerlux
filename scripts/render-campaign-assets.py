"""Render original SVG campaign artwork to PNG using Chromium, without external requests."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright
import struct

ROOT=Path(__file__).resolve().parents[1]
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            page=browser.new_page()
            files=sorted(f for f in (ROOT/'campaigns/assets').glob('*.svg') if not f.name.startswith('poster-'))
            for f in files:
                height=1920 if f.stem.endswith('story') else 1350
                page.set_viewport_size({'width':1080,'height':height})
                page.goto(f'http://127.0.0.1:{server.server_port}/campaigns/assets/{f.name}',wait_until='load')
                target=f.with_suffix('.png')
                page.locator('svg').first.screenshot(path=str(target))
                assert struct.unpack('>II',target.read_bytes()[16:24])==(1080,height)
            browser.close()
            print(f'{len(files)} PNG creatives rendered and dimensions verified.')
    finally:
        server.shutdown();server.server_close()

if __name__=='__main__':main()
