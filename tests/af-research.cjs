const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),manifest=require('../extension/manifest.json');
assert.ok(!manifest.content_scripts.some(x=>x.js.includes('af-research-main.js')));
assert.ok(!fs.existsSync(path.join(root,'extension/af-research-main.js')));
assert.ok(!fs.readFileSync(path.join(root,'scripts/build-userscripts.cjs'),'utf8').includes('af-research-main.js'));
for(const file of ['dist/pages/runtime.js','dist/arkhomu-af-lv4000.user.js','dist/safari/arkhomu-af-lv4000.user.js'])if(fs.existsSync(path.join(root,file))){const s=fs.readFileSync(path.join(root,file),'utf8');assert.ok(!s.includes('AF分析データを保存'),file);}
console.log('Distribution: private AF research exporter is excluded from all extension and userscript builds.');
