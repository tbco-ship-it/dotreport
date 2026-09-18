"""Local rendered regression test. API fixtures are mocked, never live assertions.
Requires Playwright and an existing browser executable; serve dist/ on --base-url.
"""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--base-url',default='http://127.0.0.1:8000')
    ap.add_argument('--browser-executable',default='/usr/bin/chromium')
    ap.add_argument('--offline',action='store_true',help='Render exact built HTML inline with mocked fetch/history/clipboard when navigation is blocked')
    ap.add_argument('--output-dir',default='/tmp/dot-browser-evidence')
    args=ap.parse_args();out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
    rows=json.loads((ROOT/'data/carriers.json').read_text())
    known=next(c for c in rows if c['dot']==1294757)
    limited=next(c for c in rows if c['state']=='CA' and c['driver_insp']==0 and c['vehicle_insp']==0 and c['pu']<200)
    route_path=f"/carrier/{known['dot']}-{known['slug']}/"
    checks=[];errors=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.browser_executable,args=['--no-sandbox','--disable-dev-shm-usage'])
        ctx=browser.new_context(viewport={'width':1440,'height':1100},permissions=['clipboard-read','clipboard-write'],reduced_motion='reduce')
        def route(r):
            u=urlparse(r.request.url)
            if u.hostname=='api.dotreportcard.com':
                q=parse_qs(u.query)
                if u.path=='/carrier':
                    dot=q.get('dot',[''])[0]
                    rec=known if dot==str(known['dot']) else limited if dot==str(limited['dot']) else None
                    r.fulfill(status=200 if rec else 404,content_type='application/json',body=json.dumps(rec or {'error':'not found'}))
                else:
                    term=q.get('q',[''])[0]
                    if term=='outage':r.fulfill(status=503,body='unavailable')
                    else:r.fulfill(content_type='application/json',body=json.dumps([known] if term=='Solsbury' else []))
            elif u.hostname=='127.0.0.1':r.continue_()
            else:r.abort()
        ctx.route('**/*',route)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        def load(url):
            if not args.offline:
                page.goto(url)
                return
            path=urlparse(url).path
            local=ROOT/'dist'/path.lstrip('/')
            if local.is_dir():local=local/'index.html'
            html=local.read_text()
            html=re.sub(r'<link[^>]+(?:rel="stylesheet"|fonts\.googleapis)[^>]*>', '',html)
            html=html.replace('</head>','<style>'+(ROOT/'dist/static/style.css').read_text()+'</style></head>')
            def inline(match):
                return '<script>'+(ROOT/'dist'/match.group(1).lstrip('/')).read_text()+'</script>'
            html=re.sub(r'<script src="([^"?]+)(?:\?[^"<>]*)?"[^>]*></script>',inline,html)
            fixtures=json.dumps({str(known['dot']):known,str(limited['dot']):limited})
            boot="""<script>
              const fixtures=FIXTURES;
              history.replaceState=()=>{};
              Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copied=value},readText:async()=>window.__copied}});
              window.fetch=async value=>{
                const u=new URL(String(value),'https://dotreportcard.com');
                if(u.pathname==='/carrier'){
                  const rec=fixtures[u.searchParams.get('dot')];
                  return new Response(JSON.stringify(rec||{error:'not found'}),{status:rec?200:404});
                }
                if(u.pathname==='/search'){
                  const q=u.searchParams.get('q');
                  return new Response(JSON.stringify(q==='Solsbury'?[fixtures['1294757']]:[]),{status:q==='outage'?503:200});
                }
                return new Response('{}');
              };
            </script>""".replace('FIXTURES',fixtures)
            page.goto('about:blank')
            html=html.replace('<head>','<head>'+boot)
            page.set_content(html,wait_until='load')
        load(args.base_url+route_path);page.wait_for_selector('.verifycard')
        assert 'Solsbury' in page.title()
        assert 'Above average' in page.locator('#oos-section').inner_text()
        assert 'Current coverage not verified' in page.locator('.verifycard').inner_text()
        assert page.locator('.decision h2').inner_text()=='Review the available public record'
        static_checks=' '.join(page.locator('.verifycard').inner_text().split())
        page.screenshot(path=str(out/'01-static-desktop.png'),full_page=False)
        page.get_by_role('button',name='Copy report link',exact=True).click()
        assert page.evaluate('navigator.clipboard.readText()')==('about:blank' if args.offline else args.base_url+route_path)
        page.evaluate('window.print=()=>{window.__printCalled=true}')
        page.get_by_role('button',name='Print / save report as PDF',exact=True).click()
        assert page.evaluate('window.__printCalled')
        checks+=['static report claims','static copy link','print handler (mock; PDF output not assessed)']
        load(args.base_url+'/');page.locator('#q').fill(str(known['dot']));page.locator('#q').press('Enter')
        page.wait_for_selector('#result .verifycard')
        assert ' '.join(page.locator('#result .verifycard').inner_text().split())==static_checks
        checks+=['live-render fixture / static verification text parity']
        page.screenshot(path=str(out/'02-live-fixture-desktop.png'),full_page=False)
        page.locator('#q').fill(str(limited['dot']));page.locator('#q').press('Enter')
        page.wait_for_selector('.grade--NR');assert page.locator('.grade').inner_text()=='NR'
        assert 'Not available' in page.locator('.verifycard').inner_text()
        page.screenshot(path=str(out/'05-not-rated-fixture.png'),full_page=False)
        checks+=['zero-inspection live fixture has NR and unknown OOS']
        page.locator('#q').fill('99999999');page.locator('#q').press('Enter')
        page.wait_for_function("document.querySelector('#msg').textContent.includes('not located')")
        checks+=['404 carrier feedback']
        page.locator('#q').fill('outage');page.locator('#q').press('Enter')
        page.wait_for_function("document.querySelector('#msg').textContent.includes('temporarily unavailable')")
        assert 'No carrier found' not in page.locator('#msg').inner_text()
        checks+=['upstream search error not misrepresented as no carrier']
        page.locator('#q').fill('Solsbury');page.wait_for_selector('#menu [role=option]');page.locator('#q').press('ArrowDown');page.locator('#q').press('Enter')
        page.wait_for_selector('.grade--A');checks+=['keyboard suggestions select matching fixture']
        page.set_viewport_size({'width':390,'height':844});load(args.base_url+route_path)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
        sidebar=page.locator('.verifycard').bounding_box();oos=page.locator('#oos-section').bounding_box()
        assert sidebar['y']<oos['y'],'Mobile verification should precede detailed OOS card'
        page.screenshot(path=str(out/'03-static-mobile.png'),full_page=True)
        checks+=['390px mobile no horizontal overflow','mobile verification before detail cards']
        page.emulate_media(color_scheme='dark');page.screenshot(path=str(out/'04-static-mobile-dark.png'),full_page=False)
        page.set_viewport_size({'width':360,'height':780});load(args.base_url+'/')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Small-phone home overflow'
        for button in page.locator('[data-demo]').all():
            dot=button.get_attribute('data-demo');rec=next(c for c in rows if str(c['dot'])==dot)
            assert str(rec['dot']) in button.inner_text()
        checks+=['360px home no horizontal overflow','example IDs from source records']
        assert not errors,errors
        browser.close()
    result={'status':'passed','checks':checks,'count':len(checks),'runtime_errors':errors,
            'browser':'Chromium via Playwright (Browser plugin not available)',
            'environment':('offline built HTML with mocked fetch/history/clipboard' if args.offline else 'local HTTP generated pages with mock API')+'; external fonts and ads blocked',
            'not_verified':['production browser','real-time API response/availability','PDF pagination','clipboard permission','full accessibility compliance']}
    (out/'browser-checks.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
