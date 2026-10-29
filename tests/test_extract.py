"""Browser contract and hostile-import tests; no external service is contacted."""
import json
import tempfile
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

class ExtractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.page = self.browser.new_page()
        self.errors = []
        self.page.on('pageerror', lambda err: self.errors.append(str(err)))
        self.page.goto(self.base + '/tests/blank.html')
        self.page.evaluate("async url => { window.extractOffers = (await import(url)).extractOffers; }", self.base+'/src/extract.js')

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.page.close()

    def extract(self, value, **options):
        return self.page.evaluate("async ({value,options}) => await window.extractOffers(value,options)", {'value':value, 'options':options})

    def test_exact_price_and_missing_shipping(self):
        result = self.extract({'@type':'Product','name':'Article','offers':{'@type':'Offer','price':'14.99','priceCurrency':'EUR','availability':'https://schema.org/InStock'}}, sourceUrl='https://shop.example/item?token=private#detail')
        self.assertEqual(result['source']['url'], 'https://shop.example/item')
        self.assertIsNone(result['source']['captureTime'])
        offer = result['candidates'][0]['offer']
        self.assertEqual(offer['price'], '14.99')
        self.assertEqual(offer['currency'], 'EUR')
        self.assertIsNone(offer['shippingAmount'])
        self.assertFalse(result['source']['liveVerified'])

    def test_group_variants_and_offer_references(self):
        data={'@graph':[
            {'@type':'ProductGroup','@id':'#group','name':'Sac','hasVariant':[{'@id':'#red'},{'@id':'#blue'}]},
            {'@type':'Product','@id':'#red','name':'Rouge','color':'red','offers':{'@id':'#red-offer'}},
            {'@type':'Product','@id':'#blue','name':'Bleu','color':'blue','offers':[{'@type':'Offer','price':'30','priceCurrency':'EUR'},{'@type':'Offer','price':'35','priceCurrency':'USD'}]},
            {'@type':'Offer','@id':'#red-offer','price':'29','priceCurrency':'EUR'},
            {'ref':{'@id':'#red-offer'}}]}
        result=self.extract(data)
        self.assertEqual(len(result['candidates']),3)
        self.assertEqual([c['offer']['price'] for c in result['candidates']],['29','30','35'])
        self.assertEqual(result['candidates'][0]['product']['variant']['groupName'],'Sac')
        self.assertEqual(result['candidates'][2]['offer']['currency'],'USD')
        self.assertEqual(result['candidates'][0]['evidence'][0]['path'],'$.@graph[3].price')

    def test_aggregate_offer_is_never_exact_minimum(self):
        result=self.extract({'@type':'Product','name':'Variantes','offers':{'@type':'AggregateOffer','lowPrice':'5','highPrice':'20','priceCurrency':'EUR'}})
        offer=result['candidates'][0]['offer']
        self.assertIsNone(offer['price'])
        self.assertEqual(offer['priceLow'],'5')
        self.assertEqual(offer['priceHigh'],'20')

    def test_missing_and_ambiguous_prices(self):
        for offer in ({}, {'price':'1,234','priceCurrency':'EUR'}, {'price':'-1','priceCurrency':'EUR'}):
            result=self.extract({'@type':'Product','name':'Test','offers':offer})
            self.assertIsNone(result['candidates'][0]['offer']['price'])
        result=self.extract({'@type':'Product','offers':{'price':'0','priceCurrency':'EUR'}})
        self.assertEqual(result['candidates'][0]['offer']['price'],'0')
        result=self.extract({'@type':'Product','offers':{'price':'5','priceCurrency':'BTC'}})
        self.assertIsNone(result['candidates'][0]['offer']['currency'])

    def test_html_is_passive_and_canonical_resolves_relative_offer(self):
        malicious='''<base href="https://evil.invalid/"><meta http-equiv="refresh" content="0;url=https://evil.invalid/refresh">
        <link rel="stylesheet" href="https://evil.invalid/css"><link rel="canonical" href="https://shop.example/product">
        <img src="https://evil.invalid/image" onerror="window.BAD=true"><iframe src="https://evil.invalid/frame"></iframe>
        <svg onload="window.BAD=true"><image href="https://evil.invalid/svg"></image></svg>
        <style>body{background:url(https://evil.invalid/bg)}</style><script>window.BAD=true;fetch('https://evil.invalid/script')</script>
        <script type="application/ld+json">{"@type":"Product","name":"<img src=x onerror=alert(1)>","offers":{"price":"12.30","priceCurrency":"EUR","url":"/variant?private=token"}}</script>'''
        requests=[]
        self.page.on('request',lambda request:requests.append(request.url))
        result=self.extract(malicious,format='html')
        self.page.wait_for_timeout(200)
        self.assertEqual(requests,[])
        self.assertFalse(self.page.evaluate('Boolean(window.BAD)'))
        self.assertEqual(result['candidates'][0]['offer']['url'],'https://shop.example/variant')
        self.assertTrue(result['candidates'][0]['product']['name'].startswith('<img'))

    def test_microdata_fallback_with_unrelated_jsonld(self):
        html='''<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
        <main itemscope itemtype="https://schema.org/Product"><h1 itemprop="name">Sac &amp; outils</h1>
        <section itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="24.50"><meta itemprop="priceCurrency" content="EUR"></section></main>'''
        result=self.extract(html,format='html')
        self.assertEqual(result['candidates'][0]['product']['name'],'Sac & outils')
        self.assertEqual(result['candidates'][0]['offer']['price'],'24.50')
        self.assertEqual(result['candidates'][0]['provenance']['method'],'microdata')

    def test_capture_metadata_and_invalid_input(self):
        result=self.extract({'kind':'commerce-evidence-capture','version':1,'sourceUrl':'https://shop.example/item','capturedAt':'2026-10-29T12:00:00Z','products':[{'@type':'Product','name':'Article'}]})
        self.assertEqual(result['source']['captureTime'],'2026-10-29T12:00:00.000Z')
        self.assertEqual(result['source']['method'],'collector-import')
        result=self.extract('<script type="application/ld+json">{broken}</script>',format='html')
        self.assertEqual(result['candidates'],[])
        self.assertTrue(any('invalide' in w for w in result['warnings']))
        too_big=self.page.evaluate("async () => {try{await extractOffers('x'.repeat(5*1024*1024+1));return null;}catch(e){return e.message;}}")
        self.assertIn('5 Mio',too_big)

    def test_collector_whitelist_and_local_download(self):
        bookmarklet=self.page.evaluate("async url => (await import(url)).createBookmarklet()",self.base+'/src/collector.js')
        self.page.route('http://public.example.test/**',lambda route:route.fulfill(content_type='text/html',body='<!doctype html><html><body><input value="PRIVATE_FORM"><div>PRIVATE_TEXT</div></body></html>'))
        self.page.goto('http://public.example.test/product?token=PRIVATE_TOKEN&variant=red#private')
        fixture={'@graph':[
            {'@type':'Product','name':'Sac','brand':{'@type':'Organization','name':'Marque','address':'PRIVATE_ADDRESS'},'review':{'author':{'name':'PRIVATE_AUTHOR'}},'offers':{'@id':'#offer'}},
            {'@type':'Offer','@id':'#offer','price':'29','priceCurrency':'EUR','url':'https://shop.example/item?token=PRIVATE_OFFER_TOKEN'}]}
        self.page.evaluate("data => {const s=document.createElement('script');s.type='application/ld+json';s.textContent=JSON.stringify(data);document.body.appendChild(s);document.cookie='secret=PRIVATE_COOKIE';localStorage.setItem('secret','PRIVATE_STORAGE');}",fixture)
        requests=[]
        self.page.on('request',lambda request:requests.append(request.url))
        with self.page.expect_download() as received:
            self.page.evaluate("url => (0,eval)(decodeURIComponent(url.slice('javascript:'.length)))",bookmarklet)
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'capture.json'
            received.value.save_as(target)
            raw=target.read_text()
        self.assertNotIn('PRIVATE_',raw)
        self.assertEqual(requests,[])
        capture=json.loads(raw)
        self.assertEqual(capture['sourceUrl'],'http://public.example.test/product')
        self.assertEqual(capture['products'][0]['offers'][0]['price'],'29')
        self.assertEqual(capture['products'][0]['brand'],{'name':'Marque'})

    def capture_collector(self,fixture):
        bookmarklet=self.page.evaluate("async url => (await import(url)).createBookmarklet()",self.base+'/src/collector.js')
        self.page.route('http://public.example.test/**',lambda route:route.fulfill(content_type='text/html',body='<!doctype html><html><body></body></html>'))
        self.page.goto('http://public.example.test/product')
        self.page.evaluate("data=>{const s=document.createElement('script');s.type='application/ld+json';s.textContent=JSON.stringify(data);document.body.appendChild(s);}",fixture)
        with self.page.expect_download() as received:
            self.page.evaluate("url => (0,eval)(decodeURIComponent(url.slice('javascript:'.length)))",bookmarklet)
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'capture.json';received.value.save_as(target);raw=target.read_text()
        return raw,json.loads(raw)

    def test_collector_cycles_are_cut_with_warning(self):
        fixture={'@type':'ProductGroup','@id':'#loop','name':'x'*1000,'hasVariant':[{'@id':'#loop'},{'@id':'#loop'}],
                 'offers':{'@type':'AggregateOffer','@id':'#offer-loop','lowPrice':'10','highPrice':'20','priceCurrency':'EUR','offers':[{'@id':'#offer-loop'},{'@id':'#offer-loop'}]}}
        raw,capture=self.capture_collector(fixture)
        self.assertLess(len(raw),10000)
        self.assertEqual(capture['products'][0]['hasVariant'],[])
        self.assertEqual(capture['products'][0]['offers'][0]['offers'],[])
        self.assertTrue(any('cyclique de produit' in w for w in capture['warnings']))
        self.assertTrue(any('cyclique d’offre' in w for w in capture['warnings']))

    def test_collector_shared_offer_is_retained_for_each_variant(self):
        fixture={'@graph':[{'@type':'ProductGroup','name':'Sac','hasVariant':[
            {'@type':'Product','name':'Rouge','offers':{'@id':'#same-offer'}},
            {'@type':'Product','name':'Bleu','offers':{'@id':'#same-offer'}}]},
            {'@type':'Offer','@id':'#same-offer','price':'29','priceCurrency':'EUR'}]}
        raw,capture=self.capture_collector(fixture)
        variants=capture['products'][0]['hasVariant']
        self.assertEqual([p['offers'][0]['price'] for p in variants],['29','29'])

    def test_long_keys_and_excessive_attributes_are_bounded(self):
        fixture={'A'*30000:[{'@type':'Product','name':'Item','offers':{'price':'10','priceCurrency':'EUR'}} for _ in range(20)]}
        result=self.extract(fixture)
        self.assertEqual(result['candidates'],[])
        self.assertLess(len(json.dumps(result)),10000)
        self.assertTrue(any('chemin JSON trop long' in w for w in result['warnings']))
        html='<div '+' '.join('x'+str(i)+'="a"' for i in range(5000))+'></div>'
        result=self.extract(html,format='html')
        self.assertTrue(any('attributs HTML' in w for w in result['warnings']))

    def test_nonstandard_availability_does_not_export_url_token(self):
        for value in ['https://shop.example/stock?token=SECRET_AVAILABILITY','https://schema.org/InStock?token=SECRET_AVAILABILITY']:
            result=self.extract({'@type':'Product','name':'Test','offers':{'price':'10','priceCurrency':'EUR','availability':value}})
            self.assertNotIn('SECRET_AVAILABILITY',json.dumps(result))
            self.assertIn(result['candidates'][0]['offer']['availability'],[None,'InStock'])

    def test_output_budget_limits_repeated_product_fields(self):
        fixture={'@type':'Product','name':'n'*2000,'brand':'b'*2000,'sku':'s'*2000,'mpn':'m'*2000,'material':'t'*2000,
                 'offers':[{'@type':'Offer','price':'10','priceCurrency':'EUR'} for _ in range(200)]}
        result=self.extract(fixture)
        self.assertGreater(len(result['candidates']),0)
        self.assertLess(len(result['candidates']),200)
        self.assertLess(len(json.dumps(result,separators=(',',':')).encode()),1_010_000)
        self.assertTrue(any('taille des offres extraites' in w for w in result['warnings']))

if __name__=='__main__':
    unittest.main(verbosity=2)
