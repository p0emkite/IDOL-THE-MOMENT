"""UI smoke/integration test for ITM anonymous account recovery.
Runs against a local simulated Supabase API, not the production backend.
"""
from __future__ import annotations
from urllib.parse import urlparse, unquote
from mimetypes import guess_type
from pathlib import Path
from uuid import uuid4
import re
import secrets
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
url = "https://itm.local/"
accounts: dict[str,str] = {}
codes: dict[str,str] = {}
inventory: dict[str,dict[str,int]] = {}
errors=[]

cards = [
 {"id":"lumina-lyra","name":"LYRA","group":"LUMINA","rarity":"COMMON","edition":"DEBUT COLLECTION","image_url":None},
 {"id":"novus-via-rare","name":"VIA","group":"NOVUS","rarity":"RARE","edition":"DEBUT COLLECTION","image_url":None},
 {"id":"lumina-sol-epic","name":"SOLI","group":"LUMINA","rarity":"EPIC","edition":"DEBUT COLLECTION","image_url":None},
 {"id":"novus-nix-rare","name":"NIX","group":"NOVUS","rarity":"RARE","edition":"DEBUT COLLECTION","image_url":None},
 {"id":"lumina-miu-legendary","name":"MIU","group":"LUMINA","rarity":"LEGENDARY","edition":"DEBUT COLLECTION","image_url":None},
]

def mock_api(req):
    device=req['device'];action=req['name'];params=req.get('params') or {}
    if action=='ensure_guest_player':
        if device not in accounts: accounts[device]=str(uuid4())
        inventory.setdefault(accounts[device],{})
        return accounts[device]
    if action=='has_recovery_code':return accounts[device] in codes.values()
    if action=='issue_recovery_code':
        code='IT-'+'-'.join(re.findall(r'....',secrets.token_hex(16).upper()))
        for old,p in list(codes.items()):
            if p==accounts[device]:del codes[old]
        codes[re.sub(r'[^A-Z0-9]','',code)]=accounts[device]
        return code
    if action=='recover_player':
        lookup=re.sub(r'[^A-Z0-9]','',str(params.get('p_code','')).upper())
        target=codes.get(lookup)
        if not target:return {'ok':False,'reason':'invalid_code'}
        old=accounts[device]
        if target==old:return {'ok':True,'already_linked':True}
        n=sum(inventory[old].values())
        if n and not params.get('p_allow_switch'):
            return {'ok':False,'reason':'confirm_switch','existing_cards':n}
        accounts[device]=target
        return {'ok':True,'already_linked':False}
    if action=='open_idol_pack':
        n=int(params['p_count']);result=cards[:n]
        for card in result:
            d=inventory[accounts[device]]
            d[card['id']]=d.get(card['id'],0)+1
        return result
    if action=='inventory':
        return [{'card_id':cid,'quantity':qty} for cid,qty in inventory[accounts[device]].items()]
    raise RuntimeError(f'Unrecognized mock operation {action}')

MOCK_CLIENT = """
window.__itm_mock_createClient = function(){
  return {
    auth: {
      getSession: async()=>({data:{session:null},error:null}),
      signInAnonymously: async()=>({data:{user:{id:window.__DEVICE}},error:null})
    },
    rpc: async(name,params={})=>({data:await window.__itm_test_api({device:window.__DEVICE,name,params}),error:null}),
    from: ()=>({select: async()=>({data:await window.__itm_test_api({device:window.__DEVICE,name:'inventory'}),error:null})})
  };
}
"""

def attach(context, device: str):
    page=context.new_page()
    page.expose_function('__itm_test_api', mock_api)
    html=(ROOT/'index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="./style.css" />','')
    html=html.replace('<script src="./config.js"></script>','')
    html=html.replace('<script type="module" src="./app.js"></script>','')
    page.set_content(html,wait_until='domcontentloaded')
    page.add_style_tag(content=(ROOT/'style.css').read_text())
    page.evaluate('''() => {
      window.IDOL_CONFIG={supabaseUrl:'https://mock.itm.test',supabasePublishableKey:'sb_publishable_mock'};
    }''')
    page.evaluate(f"window.__DEVICE={device!r}")
    page.add_script_tag(content=MOCK_CLIENT)
    script=(ROOT/'app.js').read_text()
    script=script.replace("import('https://esm.sh/@supabase/supabase-js@2.57.0')","Promise.resolve({createClient:window.__itm_mock_createClient})")
    script=script.replace("import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js')","Promise.reject(new Error('Mock WebGL unavailable'))")
    page.on('pageerror', lambda error: errors.append(f'{device}: {error}'))
    page.add_script_tag(content=script)
    page.wait_for_function("document.querySelector('#accountPlayerId').textContent.includes('PLAYER ID')",timeout=12000)
    return page

try:
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        first=browser.new_context(viewport={'width':1400,'height':900})
        p1=attach(first,'device-iphone')
        p1.locator('#loginButton').click()
        assert '서버에 연결' in p1.locator('#accountStatus').inner_text()
        p1.locator('#issueRecoveryCode').click()
        p1.locator('#issuedCode').wait_for(state='visible')
        code=p1.locator('#issuedCode').inner_text()
        assert re.fullmatch(r'IT(-[0-9A-F]{4}){8}',code),code
        p1.screenshot(path=str(ROOT.parent/'ITM-account-v0.4.png'))
        p1.locator('#accountClose').click()
        p1.locator('#drawFive').click()
        p1.locator('#revealAll').wait_for(timeout=7000)
        p1.locator('#revealAll').click()
        p1.locator('#collectionOpen').click()
        assert 'OWNED 5 CARDS' in p1.locator('#collectionSummary').inner_text(),p1.locator('#collectionSummary').inner_text()
        p1.locator('#collectionClose').click()
        second=browser.new_context(viewport={'width':900,'height':700})
        p2=attach(second,'device-ipad')
        p2.locator('#loginButton').click()
        p2.locator('#recoveryCodeInput').fill(code)
        p2.locator('#restoreRecoveryCode').click()
        p2.locator('#accountMessage').get_by_text('도감 불러오기 성공',exact=False).wait_for(timeout=5000)
        p2.locator('#accountClose').click()
        p2.locator('#collectionOpen').click()
        summary=p2.locator('#collectionSummary').inner_text()
        assert 'OWNED 5 CARDS' in summary,summary
        p2.locator('#collectionClose').click()
        p2.close()
        p2=attach(second,'device-ipad')
        p2.locator('#collectionOpen').click()
        assert 'OWNED 5 CARDS' in p2.locator('#collectionSummary').inner_text()
        p2.locator('#collectionClose').click()
        assert accounts['device-iphone']==accounts['device-ipad']
        assert not errors,errors
        print('PASS: guest account creates server-linked player')
        print('PASS: 128-bit recovery code displayed once')
        print('PASS: server pack results update collection')
        print('PASS: recovery code links two isolated browser devices to same collection')
        print('PASS: collection persists in a fresh page for the same device')
        print('PASS: no uncaught JavaScript errors')
        print('SCREENSHOT:',ROOT.parent/'ITM-account-v0.4.png')
        browser.close()
finally:
    pass