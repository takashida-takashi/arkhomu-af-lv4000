const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const listeners={},scope={document:{addEventListener:(n,f)=>listeners[n]=f}};vm.createContext(scope);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../extension/popup-dismiss.js'),'utf8'),scope);
function popup(owned=true){let closed=0;const dialog={open:true,getBoundingClientRect:()=>({left:100,top:100,right:300,bottom:300}),closest:()=>owned?dialog:null,querySelectorAll:()=>[close]};
 const close={disabled:false,getClientRects:()=>[{}],closest:()=>dialog,getAttribute:()=>null,textContent:'閉じる',click:()=>{closed++;dialog.open=false}};return{dialog,close,closed:()=>closed};}
function event(target,x,y,button=0){return{target,clientX:x,clientY:y,button,isPrimary:true,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};}
let p=popup(),e=event(p.dialog,50,50);listeners.pointerdown(e);listeners.click(e);assert.equal(p.closed(),1);assert.ok(e.prevented&&e.stopped);
p=popup();listeners.pointerdown(event(p.dialog,150,150));listeners.click(event(p.dialog,50,50));assert.equal(p.closed(),0,'A drag that starts inside never dismisses the dialog');
p=popup();listeners.pointerdown(event(p.dialog,50,50));listeners.click(event(p.dialog,150,150));assert.equal(p.closed(),0,'Inside padding never closes');
p=popup(false);listeners.pointerdown(event(p.dialog,50,50));listeners.click(event(p.dialog,50,50));assert.equal(p.closed(),0,'The game own modals are excluded');
p=popup();p.close.disabled=true;listeners.pointerdown(event(p.dialog,50,50));listeners.click(event(p.dialog,50,50));assert.equal(p.closed(),0,'A disabled close action is respected');
p=popup();listeners.pointerdown(event(p.dialog,50,50));listeners.pointercancel();listeners.click(event(p.dialog,50,50));assert.equal(p.closed(),0);
console.log('Popup dismissal: close action parity, outside press/release, inside/drag/native/disabled protection and cancellation passed.');
