import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();
 const origin=process.env.MANYHANDS_URL||'http://127.0.0.1:5174/';
 await page.goto(origin);
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const manifest=await page.evaluate(async()=>{const r=await fetch('./manifest.webmanifest');return r.json();});
 assert.equal(manifest.name,'Manyhands');
 for(const icon of manifest.icons)assert.equal((await page.request.get(new URL(icon.src,origin).href)).status(),200);
 await context.setOffline(true);await page.reload();await page.locator('#people').waitFor();
 assert.equal(await page.locator('#people').textContent(),'15');
 await page.locator('#view-toggle').click();
 await page.waitForTimeout(100);
 const bounds=await page.locator('#world').boundingBox();
 await page.locator('#world').click({position:{x:bounds.width/2,y:bounds.height/2}});
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('manyhands-world')).version)>0);
 await page.reload();assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('manyhands-world')).version)>0);
 console.log('PASS: install manifest/icons, complete offline reload, offline terrain edits, saved-world reload.');
}finally{await browser.close();}
