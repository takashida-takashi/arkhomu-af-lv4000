const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let fetchAccount=0,reads=0;
const skill={id:'hp',name_key:'HP_NAME'}, learned={getActiveSkills:()=>[],getPassiveSkills:()=>{reads++;return[skill]}};
const masters={getActiveSkill:()=>null,getPassiveSkill:()=>skill};
const levelStore={ensureAccount:async()=>{fetchAccount++},account:{levels:{'passive:hp':10}},displayFor:levels=>({levels,definitions:{'passive:hp':{effects:['public Lv5']}}})};
const app={config:{globalProperties:{$t:k=>({'HP_NAME':'体力強化','MONSTER_TEST_NAME':'ホム'}[k]??k),$pinia:{_s:new Map([
 ['skillLevelDisplay',levelStore],['userItems',{isArtifactsLoaded:true,allArtifacts:[{_artifact:{is_equipped:true,params:{hp:99999}}}]}],
 ['skillSettings',{disabledPassives:{foreign:['hp']}}]])}}},runWithContext:f=>f()};
const scope={document:{addEventListener(){},getElementById:()=>({__vue_app__:app})},location:{pathname:'/profile'},tools:{learned:()=>learned,masters:()=>masters}};
vm.createContext(scope);let source=fs.readFileSync(path.join(__dirname,'../extension/party-share-main.js'),'utf8');
source=source.replace('return readers ??= loadReaders().catch(error => { readers = null; throw error; });','return Promise.resolve(tools);');
source=source.replace('bindHall, getReaders,','bindHall, simulatorMembers, getReaders,');vm.runInContext(source,scope);
const api=scope.hakoAfPartyShareMain,anchor={isConnected:true,parentElement:{textContent:'体力 1,234'}};
const monster={user_monster_id:'foreign',monster_id:'test',m_monsters:{id:'test',rank:7,name_key:'MONSTER_TEST_NAME'},generation_value:2129.1,level:3000,
 inherited_traits:[{effect_data:{type:'add_param',target_stat:'hp',value:20000}}],_skillLevels:{'passive:hp':5}};
const props={monster,maskSkills:false,trainingBonus:{params:{hp:9999}}};api.simulatorMembers.set(anchor,{monster,props,instance:{},publicTraining:true});
(async()=>{const result=await api.readSimulatorMember(anchor);assert.equal(result.public,true);assert.equal(result.afsLoaded,false);assert.equal(result.training,null);
 assert.equal(result.bonus.hp,20000);assert.equal(result.skillLevels['p.hp'],5);assert.equal(result.skills[0],'p.hp');assert.equal(fetchAccount,0);assert.equal(result.loadouts.normal.length,0);
 const json=JSON.stringify(result);assert.ok(!json.includes('99999')&&!json.includes('9999')&&!json.includes('foreign'));
 props.maskSkills=true;const count=reads,hidden=await api.readSimulatorMember(anchor);assert.equal(hidden.skills.length,0);assert.equal(hidden.skillsUnavailable,true);assert.equal(reads,count,'Private skills are never read');
 props.monster={};assert.equal(await api.readSimulatorMember(anchor),null,'Stale detail selection is rejected');
 console.log('Public stat copy: public levels/bonus only, private skills and own AF/training/account exclusion, stale selection passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
