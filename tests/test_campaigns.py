"""Campaign journeys and truthful local aggregate measurements, without external traffic."""
import json
import struct
import tempfile
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlencode, urlsplit
from xml.etree import ElementTree

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HEADERS = 'campaign_id,spend_eur,impressions,link_clicks,eligible_visitors,unique_completers\n'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class CampaignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.catalog = json.loads((ROOT/'campaigns/campaigns.json').read_text())
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
        self.page.on('pageerror', lambda error:self.errors.append(str(error)))
        self.page.on('request', lambda request:self.external_requests.append(request.url)
                     if not request.url.startswith((self.base+'/', 'blob:', 'data:')) else None)

    def tearDown(self):
        self.assertEqual(self.errors, [])
        self.assertEqual(self.external_requests, [])
        self.page.close()

    def studio(self):
        self.page.goto(self.base+'/campaigns/index.html', wait_until='networkidle')
        expect(self.page.locator('#measure-example')).to_be_enabled()
        expect(self.page.locator('.campaign-card')).to_have_count(6)

    def csv(self, rows):
        details = self.page.locator('#measure-form details')
        if details.get_attribute('open') is None:
            details.locator('summary').click()
        self.page.locator('#measure-csv').fill(HEADERS+rows)

    def calculate(self):
        self.page.locator('#measure-form button[type=submit]').click()

    def metrics(self, index=0):
        return self.page.locator('.result-card').nth(index).locator('dl > div').evaluate_all(
            '(rows) => Object.fromEntries(rows.map(row => [row.querySelector("dt").textContent, row.querySelector("dd").textContent.replaceAll("\\u00a0", " ").replaceAll("\\u202f", " ")]))')

    def observations(self):
        self.page.locator('#measure-mode').select_option('observations')
        self.page.locator('#measure-source').fill('Agrégats de test déclarés, action unique après import personnel')
        self.page.locator('#measure-start').fill('2026-10-20')
        self.page.locator('#measure-end').fill('2026-10-28')
        self.page.locator('#measure-closed').check()
        self.page.locator('#measure-comparable').check()

    def test_six_concepts_filters_and_downloads_are_real(self):
        self.studio()
        self.assertEqual(len({row['id'] for row in self.catalog}), 6)
        expect(self.page.locator('#measure-results')).to_contain_text('Aucune performance observée')
        for project in ['trace', 'commerce']:
            self.page.locator(f'[data-filter={project}]').click()
            expect(self.page.locator('.campaign-card')).to_have_count(3)
            expect(self.page.locator(f'[data-filter={project}]')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('[data-filter=all]').click()
        for campaign in self.catalog:
            card = self.page.locator(f'[data-campaign="{campaign["id"]}"]')
            card.locator('img').scroll_into_view_if_needed()
            expect(card.locator('h3')).to_have_text(campaign['name'])
            expect(card.locator('img')).to_have_js_property('naturalWidth',1080)
            for link in card.locator('.asset-links a').all():
                path = ROOT/'campaigns'/link.get_attribute('href').removeprefix('./')
                self.assertTrue(path.is_file(), str(path))
                self.assertGreater(path.stat().st_size, 100)
        with self.page.expect_download() as received:
            self.page.locator('[data-campaign="trace-souvenir"] .asset-links a').first.click()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)/received.value.suggested_filename
            received.value.save_as(target)
            self.assertEqual(target.read_bytes()[:8], b'\x89PNG\r\n\x1a\n')

    def test_creative_formats_and_fiction_labels(self):
        for campaign in self.catalog:
            for format_name, height in [('feed',1350), ('story',1920)]:
                path = ROOT/'campaigns/assets'/f'{campaign["id"]}-{format_name}'
                png = path.with_suffix('.png').read_bytes()
                self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
                self.assertEqual(struct.unpack('>II', png[16:24]), (1080,height))
                svg = ElementTree.fromstring(path.with_suffix('.svg').read_text())
                self.assertEqual(svg.attrib['viewBox'], f'0 0 1080 {height}')
                self.assertFalse(any(element.tag.rsplit('}',1)[-1] in {'script','foreignObject','image'} for element in svg.iter()))
                if campaign['project'] == 'trace':
                    # The large composition, not just tiny text inside the poster, identifies the fiction.
                    labels = [element.text or '' for element in svg.iter() if element.tag.endswith('text') and float(element.attrib.get('font-size',0)) >= 22]
                    self.assertTrue(any('fictif' in label.lower() for label in labels), campaign['id'])
                    self.assertIn('impression non proposée', ''.join(svg.itertext()).lower())

    def test_all_six_discovery_pages_reach_the_correct_application_section(self):
        anchors = {'dossier-marge':'economics','dossier-preuves':'sources','dossier-comparaison':'compare'}
        for campaign in self.catalog:
            with self.subTest(campaign=campaign['id']):
                self.page.goto(self.base+campaign['destinationPath'], wait_until='networkidle')
                expect(self.page.locator('body')).to_have_attribute('data-campaign', campaign['id'])
                expect(self.page.locator('#landing-headline')).to_have_text(campaign['headline'])
                self.page.locator('#main-cta').click()
                if campaign['project']=='trace':
                    expect(self.page.locator('#gpx')).to_be_enabled()
                    self.assertEqual(urlsplit(self.page.url).fragment, 'editor')
                    expect(self.page.locator('#preview-label')).to_contain_text('EXEMPLE FICTIF')
                else:
                    expect(self.page.locator('#case-picker')).to_be_enabled()
                    anchor=anchors[campaign['id']]
                    self.assertEqual(urlsplit(self.page.url).fragment, anchor)
                    expect(self.page.locator('#compare' if anchor=='compare' else f'#panel-{anchor}')).to_be_visible()

    def test_landing_utm_whitelist_drops_untrusted_query_data(self):
        query = urlencode({'angle':'<img src=https://untrusted.invalid/x onerror=alert(1)>',
                           'utm_source':'meta','utm_medium':'paid_social','utm_campaign':'trace_free_fr',
                           'utm_content':'trace-souvenir','token':'PRIVATE_SENTINEL','redirect':'https://untrusted.invalid/'})
        self.page.goto(self.base+'/discover/trace.html?'+query, wait_until='networkidle')
        expect(self.page.locator('body')).to_have_attribute('data-campaign','trace-souvenir')
        for link in self.page.locator('.app-link').all():
            target = urlsplit(link.get_attribute('href'))
            self.assertEqual(target.netloc, urlsplit(self.base).netloc)
            self.assertEqual(parse_qs(target.query), {'utm_source':['meta'],'utm_medium':['paid_social'],
                                                      'utm_campaign':['trace_free_fr'],'utm_content':['trace-souvenir']})
        self.assertNotIn('PRIVATE_SENTINEL',self.page.locator('body').inner_text())
        self.assertEqual(self.page.locator('img[src*="untrusted"]').count(),0)
        self.page.goto(self.base+'/discover/commerce.html?angle=preuves&utm_source=https://untrusted.invalid&utm_content=UNKNOWN',wait_until='networkidle')
        self.assertEqual(urlsplit(self.page.locator('#main-cta').get_attribute('href')).query,'')

    def test_tracking_tags_for_another_product_or_angle_are_discarded(self):
        self.page.goto(self.base+'/discover/commerce.html?angle=preuves&utm_source=meta&utm_medium=paid_social&utm_campaign=trace_free_fr&utm_content=dossier-marge',wait_until='networkidle')
        expect(self.page.locator('body')).to_have_attribute('data-campaign','dossier-preuves')
        for link in self.page.locator('.app-link').all():
            self.assertEqual(parse_qs(urlsplit(link.get_attribute('href')).query),
                             {'utm_source':['meta'],'utm_medium':['paid_social']})

    def test_mobile_layout_has_no_horizontal_overflow(self):
        for width in [320,390]:
            self.page.set_viewport_size({'width':width,'height':844})
            for path in ['/campaigns/index.html']+[row['destinationPath'] for row in self.catalog]:
                with self.subTest(width=width,path=path):
                    self.page.goto(self.base+path,wait_until='networkidle')
                    self.assertFalse(self.page.evaluate('() => document.documentElement.scrollWidth > innerWidth'))

    def test_fictional_sample_is_never_relabelled_real_by_mode_switch(self):
        self.studio()
        self.page.locator('#measure-example').click()
        expect(self.page.locator('#measure-results')).to_contain_text('EXEMPLE FICTIF — aucune performance réelle')
        self.assertEqual(self.metrics()['Coût par clic'],'0,20 €')
        self.assertEqual(self.metrics()['Coût par action'],'1,33 €')
        self.assertNotIn('Intervalle de Wilson',self.page.locator('#measure-results').inner_text())
        self.page.locator('#measure-mode').select_option('observations')
        expect(self.page.locator('.result-card')).to_have_count(0)
        self.calculate()
        expect(self.page.locator('#measure-status')).to_contain_text('Cet exemple est fictif')
        expect(self.page.locator('.result-card')).to_have_count(0)

    def test_unknown_spend_differs_from_explicit_zero(self):
        self.studio()
        self.csv('trace-souvenir,,1000,100,50,5\ntrace-local,0,1000,100,50,5')
        self.calculate()
        first,second = self.metrics(0),self.metrics(1)
        self.assertEqual(first['Dépense déclarée'],'Inconnu')
        self.assertEqual(first['Coût par clic'],'Inconnu')
        self.assertEqual(first['Coût par action'],'Inconnu')
        self.assertEqual(first['Clics / impressions'],'10 %')
        self.assertEqual(first['Actions / visiteurs éligibles'],'10 %')
        self.assertEqual(second['Dépense déclarée'],'0,00 €')
        self.assertEqual(second['Coût par clic'],'0,00 €')
        self.assertEqual(second['Coût par action'],'0,00 €')
        self.assertNotIn('Intervalle de Wilson',self.page.locator('#measure-results').inner_text())

    def test_zero_actions_and_wilson_invalidate_on_changed_declarations(self):
        self.studio()
        self.observations()
        self.csv('trace-souvenir,10,1000,100,100,0')
        self.calculate()
        values = self.metrics()
        self.assertEqual(values['Actions / visiteurs éligibles'],'0 %')
        self.assertEqual(values['Coût par action'],'Inconnu')
        self.assertEqual(values['Intervalle de Wilson à 95 %'],'0 % – 3,7 %')
        expect(self.page.locator('#measure-results')).to_contain_text('Ce n’est pas une probabilité de réussite du projet')
        self.page.locator('#measure-source').fill('Nouvelle déclaration')
        expect(self.page.locator('.result-card')).to_have_count(0)
        self.calculate()
        self.page.locator('#measure-comparable').uncheck()
        expect(self.page.locator('.result-card')).to_have_count(0)
        self.calculate()
        self.assertNotIn('Intervalle de Wilson',self.page.locator('#measure-results').inner_text())
        self.page.locator('#measure-mode').select_option('scenario')
        self.calculate()
        expect(self.page.locator('#measure-results')).to_contain_text('EXEMPLE FICTIF')
        self.assertNotIn('Intervalle de Wilson',self.page.locator('#measure-results').inner_text())

    def test_invalid_csv_replaces_previous_result_with_specific_error(self):
        self.studio()
        self.page.locator('#measure-example').click()
        self.csv('trace-souvenir,10,1000,100,100,101')
        self.calculate()
        expect(self.page.locator('.result-card')).to_have_count(0)
        expect(self.page.locator('#measure-status')).to_contain_text('unique_completers ne peut pas dépasser eligible_visitors')
        self.csv('trace-souvenir,=1+1,1000,100,100,1')
        self.calculate()
        expect(self.page.locator('#measure-status')).to_contain_text('spend_eur exige')
        self.assertNotIn('NaN',self.page.locator('#measure-results').inner_text())

    def test_local_file_import_waits_for_review_and_rejects_oversize(self):
        self.studio()
        self.page.locator('#measure-example').click()
        self.page.locator('#measure-file').set_input_files({'name':'observations.csv','mimeType':'text/csv',
                                                           'buffer':(HEADERS+'trace-local,2,100,10,5,1').encode()})
        expect(self.page.locator('#measure-status')).to_contain_text('CSV chargé localement')
        expect(self.page.locator('.result-card')).to_have_count(0)
        self.calculate()
        self.assertEqual(self.metrics()['Coût par action'],'2,00 €')
        self.page.locator('#measure-file').set_input_files({'name':'trop-grand.csv','mimeType':'text/csv','buffer':b'x'*100001})
        expect(self.page.locator('#measure-status')).to_contain_text('Fichier trop volumineux')
        expect(self.page.locator('#measure-csv')).to_have_value('')
        expect(self.page.locator('.result-card')).to_have_count(0)

    def test_untrusted_provenance_is_text_not_markup(self):
        self.studio()
        payload='<img src="https://untrusted.invalid/x" onerror="alert(1)">'
        self.page.locator('#measure-source').fill(payload)
        self.csv('trace-local,1,100,10,5,1')
        self.calculate()
        expect(self.page.locator('.result-card .source')).to_have_text(payload)
        self.assertEqual(self.page.locator('#measure-results img').count(),0)

    def test_future_period_is_a_scenario_not_an_observation(self):
        self.studio()
        self.observations()
        self.csv('trace-local,10,1000,100,100,10')
        self.page.locator('#measure-start').fill('2999-01-01')
        self.page.locator('#measure-end').fill('2999-01-02')
        self.calculate()
        expect(self.page.locator('#measure-status')).to_contain_text('se termine dans le futur')
        expect(self.page.locator('.result-card')).to_have_count(0)
        self.page.locator('#measure-mode').select_option('scenario')
        self.calculate()
        expect(self.page.locator('#measure-results')).to_contain_text('EXEMPLE FICTIF')
        expect(self.page.locator('.result-card')).to_have_count(1)
        self.assertNotIn('Intervalle de Wilson',self.page.locator('#measure-results').inner_text())

    def test_two_video_previews_load_the_promised_format(self):
        self.studio()
        expect(self.page.locator('video')).to_have_count(2)
        for video in self.page.locator('video').all():
            self.assertEqual(video.get_attribute('preload'),'none')
            self.assertIsNotNone(video.get_attribute('controls'))
            video.locator('..').locator('summary').click()
            video.evaluate('(video) => video.load()')
            expect(video).to_have_js_property('duration',15)
            expect(video).to_have_js_property('videoWidth',1080)
            expect(video).to_have_js_property('videoHeight',1920)

    def test_missing_modules_leave_controls_disabled_and_static_navigation_usable(self):
        self.page.route('**/campaigns/studio.js',lambda route:route.abort())
        self.page.goto(self.base+'/campaigns/index.html',wait_until='networkidle')
        expect(self.page.locator('#measure-file')).to_be_disabled()
        expect(self.page.locator('#measure-example')).to_be_disabled()
        expect(self.page.locator('[data-filter=all]')).to_be_disabled()
        expect(self.page.locator('#startup-help')).to_be_visible()
        self.assertEqual(self.page.locator('footer a[href="../route-poster/index.html"]').count(),1)
        self.page.route('**/campaigns/campaigns.json',lambda route:route.abort())
        self.page.goto(self.base+'/discover/trace.html?angle=local',wait_until='networkidle')
        expect(self.page.locator('body')).to_have_attribute('data-catalog','unavailable')
        self.assertEqual(self.page.locator('#main-cta').get_attribute('href'),'../route-poster/index.html#editor')


if __name__=='__main__':
    unittest.main(verbosity=2)
