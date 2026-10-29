"""End-to-end product workflows, evidence isolation and probability labeling."""
import json
import tempfile
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class AppTests(unittest.TestCase):
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
        self.page = self.browser.new_page(viewport={'width':1440, 'height':1000})
        self.errors = []
        self.external_requests = []
        self.page.on('pageerror', lambda e:self.errors.append(str(e)))
        self.page.on('request', lambda r:self.external_requests.append(r.url) if not r.url.startswith(self.base) and not r.url.startswith('data:') else None)
        self.page.goto(self.base, wait_until='networkidle')
        expect(self.page.locator('#case-picker')).to_have_value('poster-gpx')

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.assertEqual(self.external_requests, [])
        self.page.close()

    def tab(self, name):
        self.page.locator(f'[data-panel="{name}"]').click()

    def export(self):
        with self.page.expect_download() as received:
            self.page.locator('#export-project').click()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)/'project.json'
            received.value.save_as(target)
            return json.loads(target.read_text())

    def test_initial_research_never_invents_a_success_probability(self):
        self.assertEqual(self.page.locator('#landed-cost').input_value(), '14.95')
        quote=self.page.locator('#observed-offers a[href*="shipping-quote"]').get_attribute('href')
        self.assertIn('productId=poster_30x40',quote)
        self.assertIn('country=74',quote)
        self.assertIn('Lancement non validé', self.page.locator('#case-overview').inner_text())
        self.tab('probability')
        self.assertIn('Probabilité non estimable', self.page.locator('#probability-results').inner_text())
        self.page.locator('#calculate-probability').click()
        self.assertEqual(self.page.locator('.probability-number').count(), 0)
        exported = self.export()
        self.assertIsNone(exported['probability']['probability'])
        self.assertEqual(exported['probability']['status'], 'not_estimable')

    def test_missing_cost_stays_unknown_and_case_changes_reset_economic_assumptions(self):
        self.tab('economics')
        self.page.locator('#payment-rate').fill('99')
        self.page.locator('#case-picker').select_option('crochet')
        self.assertEqual(self.page.locator('#payment-rate').input_value(), '1.5')
        self.assertEqual(self.page.locator('#landed-cost').input_value(), '')
        self.assertIn('Calcul incomplet', self.page.locator('#economics-results').inner_text())
        self.assertEqual(self.export()['economics']['status'], 'incomplete')

    def test_hypothetical_probability_and_export_remain_explicit(self):
        self.tab('probability')
        self.page.locator('#load-teaching-example').click()
        self.page.locator('#calculate-probability').click()
        result=self.page.locator('#probability-results').inner_text()
        self.assertIn('SCÉNARIO FICTIF', result)
        self.assertIn('Ce pourcentage ne valide pas le produit', result)
        self.assertIn('< 0,1 %', result)
        exported=self.export()
        self.assertEqual(exported['probability']['status'], 'scenario')
        self.assertIn('FICTIF', exported['probabilityInput']['provenance'])
        self.assertAlmostEqual(exported['probability']['probability'], 0.096769136, delta=0.001)
        self.assertEqual(exported['probability']['expectedTraffic'], 1000)
        self.assertEqual(exported['probability']['fixedCosts'], '40')
        self.assertEqual(len(exported['sensitivity']['rows']), 4)
        self.assertLessEqual(exported['sensitivity']['rows'][0]['result']['probability'], exported['probability']['probability'])

    def test_imported_variants_are_local_separate_and_listed_with_sources(self):
        self.page.locator('#case-picker').select_option('custom')
        self.page.locator('#source-url').fill('https://supplier.example/product?token=DO_NOT_EXPORT')
        self.page.get_by_text('Coller du HTML ou du JSON-LD', exact=True).click()
        fixture={'@type':'ProductGroup','name':'Sac','hasVariant':[
            {'@type':'Product','name':'<img src="https://evil.example/x" onerror="alert(1)">','size':'S','sku':'S1','offers':{'@type':'Offer','price':'12.50','priceCurrency':'EUR'}},
            {'@type':'Product','name':'Sac large','size':'L','sku':'L1','offers':{'@type':'Offer','price':'16.90','priceCurrency':'EUR'}}]}
        self.page.locator('#source-content').fill(json.dumps(fixture))
        self.page.locator('#extract-button').click()
        expect(self.page.locator('#import-status')).to_contain_text('2 offre')
        self.assertEqual(self.page.locator('#extracted-offers article.offer').count(), 2)
        self.assertEqual(self.page.locator('#extracted-offers img').count(), 0)
        self.assertEqual(self.page.locator('#landed-cost').input_value(), '')
        self.tab('sources')
        self.assertIn('Relevé importé 1', self.page.locator('#case-sources').inner_text())
        self.assertIn('https://supplier.example/product', self.page.locator('#case-sources').inner_text())
        exported=self.export()
        self.assertNotIn('DO_NOT_EXPORT', json.dumps(exported))
        self.assertIsNone(exported['imports'][0]['source']['captureTime'])
        self.assertFalse(exported['imports'][0]['source']['liveVerified'])
        self.assertEqual(exported['imports'][0]['candidates'][0]['offer']['price'], '12.50')
        self.assertIsNone(exported['imports'][0]['candidates'][0]['offer']['shippingAmount'])

    def test_price_and_prior_changes_invalidate_previous_probabilities(self):
        self.tab('probability')
        self.page.locator('#load-teaching-example').click()
        self.page.locator('#calculate-probability').click()
        self.assertEqual(self.page.locator('.probability-number').count(), 1)
        self.page.locator('#prior-alpha').fill('2')
        self.assertEqual(self.page.locator('.probability-number').count(), 0)
        self.page.locator('#calculate-probability').click()
        self.tab('economics')
        self.page.locator('#sale-price').fill('20')
        self.assertEqual(self.page.locator('.probability-number').count(), 0)

    def test_restore_keeps_inputs_but_discards_claimed_results_and_study_facts(self):
        self.tab('probability')
        self.page.locator('#load-teaching-example').click()
        self.page.locator('#calculate-probability').click()
        exported=self.export()
        exported['probability']['probability']=1
        exported['study']['name']='GUARANTEED_WINNER'
        self.page.locator('#case-picker').select_option('crochet')
        self.page.locator('#project-file').set_input_files({'name':'restore.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
        expect(self.page.locator('#case-picker')).to_have_value('poster-gpx')
        self.assertNotIn('GUARANTEED_WINNER',self.page.locator('#case-overview').inner_text())
        self.assertIn('Dossier restauré',self.page.locator('#case-overview').inner_text())
        self.assertEqual(self.page.locator('#landed-cost').input_value(),'14.95')
        self.assertEqual(self.page.locator('#observed-visits').input_value(),'500')
        self.assertEqual(self.page.locator('.probability-number').count(),0)
        self.assertIsNone(self.export()['probability'])
        self.page.locator('#calculate-probability').click()
        self.assertIn('SCÉNARIO FICTIF',self.page.locator('#probability-results').inner_text())

    def test_invalid_project_does_not_replace_the_current_work(self):
        self.page.locator('#project-file').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"tool":"wrong"}'})
        expect(self.page.locator('#global-status')).to_contain_text('Reprise impossible')
        self.assertEqual(self.page.locator('#case-picker').input_value(),'poster-gpx')
        self.assertEqual(self.page.locator('#landed-cost').input_value(),'14.95')

    def test_rejects_oversized_import_without_processing(self):
        self.page.locator('#source-file').set_input_files({'name':'huge.json','mimeType':'application/json','buffer':b' '*2_000_001})
        self.page.locator('#extract-button').click()
        expect(self.page.locator('#import-status')).to_contain_text('2 Mo')
        self.assertEqual(self.page.locator('#extracted-offers .card').count(), 0)

    def test_mobile_has_no_document_overflow_and_controls_remain_reachable(self):
        for width in (320,379,768):
            self.page.set_viewport_size({'width':width,'height':844})
            for name in ('evidence','economics','probability','sources'):
                self.tab(name)
                sizes=self.page.evaluate('({doc:document.documentElement.scrollWidth,view:innerWidth})')
                self.assertLessEqual(sizes['doc'],sizes['view'])
        self.assertTrue(self.page.locator('#export-project').is_visible())

    def test_comparison_distinguishes_delivered_cost_from_product_price(self):
        self.assertEqual(self.page.locator('.comparison-card').count(),4)
        poster=self.page.locator('[data-case-id="poster-gpx"]')
        self.assertIn('14,95',poster.locator('.comparison-price').inner_text())
        self.assertIn('HT',poster.locator('.comparison-price').inner_text())
        supplier=self.page.locator('.supplier-offer')
        self.assertIn('14,95',supplier.locator('.supplier-total').inner_text())
        self.assertIn('3,80',supplier.locator('.supplier-costs').inner_text())
        self.assertIn('10,75',supplier.locator('.supplier-costs').inner_text())
        self.assertIn('0,40',supplier.locator('.supplier-costs').inner_text())
        for case_id in ('crochet','keytag','puzzle-gpx'):
            self.assertEqual(self.page.locator(f'[data-case-id="{case_id}"] .comparison-price').inner_text(),'Inconnu')
        self.page.locator('[data-case-id="crochet"] button').click()
        expect(self.page.locator('#case-picker')).to_have_value('crochet')
        self.assertEqual(self.page.locator('#landed-cost').input_value(),'')
        self.assertIn('Inconnu',self.page.locator('.supplier-total').inner_text())

    def test_campaign_fragments_open_panels_without_resetting_inputs(self):
        self.page.goto(self.base+'/index.html?utm_source=test&utm_campaign=costs#economics',wait_until='networkidle')
        expect(self.page.locator('#panel-economics')).to_be_visible()
        self.page.locator('#sale-price').fill('44')
        self.page.locator('.economics-guide a[href="#sources"]').focus()
        self.page.keyboard.press('Enter')
        expect(self.page.locator('#panel-sources')).to_be_visible()
        self.assertEqual(self.page.locator('#sale-price').input_value(),'44')
        self.assertIn('utm_campaign=costs',self.page.url)
        self.page.go_back()
        expect(self.page.locator('#panel-economics')).to_be_visible()
        self.assertEqual(self.page.locator('#sale-price').input_value(),'44')
        self.page.locator('a[href="#compare"]').click()
        self.assertEqual(self.page.locator('#sale-price').input_value(),'44')
        self.page.locator('a[href="#economics"]').click()
        expect(self.page.locator('#panel-economics')).to_be_visible()
        self.assertEqual(self.page.locator('#sale-price').input_value(),'44')

    def test_fictitious_import_is_separate_and_stays_fictitious_after_export_and_restore(self):
        self.page.locator('#load-import-example').click()
        expect(self.page.locator('#case-picker')).to_have_value('custom')
        expect(self.page.locator('#import-status')).to_contain_text('Exemple fictif')
        self.assertEqual(self.page.locator('#extracted-offers article.offer').count(),2)
        self.assertEqual(self.page.locator('#landed-cost').input_value(),'')
        self.assertEqual(self.page.locator('#sale-price').input_value(),'')
        self.assertIn('Fiche fictive',self.page.locator('#extracted-offers').inner_text())
        self.page.locator('#load-import-example').click()
        expect(self.page.locator('#load-import-example')).to_be_enabled()
        exported=self.export()
        self.assertEqual(len(exported['imports']),1)
        self.assertEqual(exported['economics']['status'],'incomplete')
        self.assertIsNone(exported['imports'][0]['source']['url'])
        self.assertTrue(any('EXEMPLE FICTIF' in warning for warning in exported['imports'][0]['warnings']))
        self.assertTrue(all('EXEMPLE FICTIF' in candidate['product']['name'] for candidate in exported['imports'][0]['candidates']))
        self.page.locator('#case-picker').select_option('poster-gpx')
        self.assertEqual(len(self.export()['imports']),0)
        self.assertEqual(self.page.locator('#landed-cost').input_value(),'14.95')
        self.page.locator('#project-file').set_input_files({'name':'example.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
        expect(self.page.locator('#case-picker')).to_have_value('custom')
        self.assertIn('Fiche fictive',self.page.locator('#extracted-offers').inner_text())
        self.tab('sources')
        self.assertIn('Exemple fictif intégré',self.page.locator('#case-sources').inner_text())
        self.assertEqual(self.page.locator('.probability-number').count(),0)

if __name__=='__main__':
    unittest.main(verbosity=2)
