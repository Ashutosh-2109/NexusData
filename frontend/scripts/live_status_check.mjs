import {chromium} from 'playwright';
const b=await chromium.launch();const p=await b.newPage();await p.goto('http://127.0.0.1:3011/');await p.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.trim().toLowerCase()==='offline',{timeout:15000});console.log('offline',await p.getByRole('status').first().innerText());await b.close();
