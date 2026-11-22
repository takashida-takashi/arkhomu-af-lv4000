const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const scope = { document: { addEventListener() {} }, localStorage: { getItem: () => null },
  hakoAfEffects: {}, hakoAfListRules: {}, hakoAf4000: { getTarget: () => 4500 } };
vm.createContext(scope);
for (const name of ['training-preview-main.js', 'stat-compensation.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension', name), 'utf8'), scope);
const { parse, minimum, solve } = scope.hakoAfStatCompensation;
const plain = x => JSON.parse(JSON.stringify(x));
assert.equal(parse('【黄金の巣母アピソフィア（黄金の巣母アピソフィア）】Lv3000 戦闘力2,073,790\nRank7 / 世代 2129.1\n体力847,380 / 物攻799,044 / 魔攻715,441 / 物防180,258 / 魔防1,008,847 / 速度330,537 / 運23,924').observed.hp, 847380);
const snapshot = { format: 'hako-stat-v1', species: 'test', generation: 2129.1, skills: ['p.hp'], bonus: { hp: 20000 } };
assert.deepEqual(plain(parse('【はこホム拡張ステータス v1】\n' + JSON.stringify(snapshot))), snapshot);
assert.throws(() => parse('not a performance copy'));
assert.throws(() => parse(JSON.stringify({ ...snapshot, skills: ['<script>'] })));
assert.throws(() => parse(JSON.stringify({ ...snapshot, bonus: { unknown: 10 } })));
assert.equal(minimum(x => Math.floor(x * 3), 10, 0, 100, .01).input, 3.34);
assert.equal(minimum(x => x, 1000, 0, 100, .1), null);
assert.equal(minimum(x => x, 3124.991, 3124.991, 1e9, .1).input, 3124.991, 'A satisfied imported fractional generation does not round up');
const cfg = { monster: { levelCapBase: 50, levelCapGrowth: 50, levelCapCurveExponent: .55, levelCapMax: 3000,
  internalAccBase: 100, internalAccGrowth: 130 }, stats: { hpMultiplier: 3.5, internal: { base: 100, growthPerLevel: 5 } } };
const data = { 'game-config': cfg, monsters: [{ id: 'test', rank: 7, base_hp: 90, base_atk: 80, base_mtk: 120,
  base_def: 80, base_mdf: 140, base_spd: 80, base_lck: 100 }], skills: [], passives: [{ id: 'hp', effects: [
  { type: 'param', effect: 'add_param', target_stat: ['hp', 'atk'], value: .5 },
  { type: 'param', effect: 'add_fix_param', target_stat: ['hp', 'atk'], value: .1 }
] }] };
const member = { ...snapshot, rank: 7 }, generation = member.generation, af = 200;
const levelled = scope.hakoAfTrainingModel.calculate({member:{...member,skillLevels:{'p.hp':10},skillDefinitions:{'p.hp':{effects:[{type:'param',effect:'add_param',target_stat:'hp',value:1}]}}}},data,NaN);
const standard = scope.hakoAfTrainingModel.calculate({member},data,NaN);
assert.ok(levelled.stages[2].values.hp > standard.stages[2].values.hp,'Copied resolved skill Lv effects replace Lv1 without relying on local planner caches');
for (const stat of ['hp', 'atk']) {
  member.bonus = { hp: 20000, atk: 20000 };
  const evaluate = changes => scope.hakoAfTrainingModel.calculate({ member: { ...member, generation: changes.generation ?? generation,
    bonus: { ...member.bonus, [stat]: member.bonus[stat] + (changes.bonusDelta ?? 0) } }, arts: [{ params: { [stat]: changes.afTotal ?? af } }] }, data, NaN).stages[2].values;
  const result = solve({ evaluate, stat, deficit: 140000, generation, af, mixedGeneration: 5000 });
  assert.ok(result.af.values[stat] >= result.target);
  assert.ok(result.generation.values[stat] >= result.target);
  assert.ok(result.mixed.values[stat] >= result.target);
  assert.ok(evaluate({ afTotal: result.af.total - .01 })[stat] < result.target, 'AF result is minimal at 0.01 percentage point resolution');
  assert.ok(evaluate({ generation: result.generation.total - .1 })[stat] < result.target, 'Generation result is minimal at 0.1 resolution');
  const zero = solve({ evaluate, stat, deficit: 0, generation, af, mixedGeneration: generation });
  assert.equal(zero.af.extra, 0);assert.equal(zero.generation.extra, 0);
  assert.equal(result.af.values.lck, result.base.lck, 'An AF adjustment for one stat preserves unrelated stats');
  console.log(stat + ': target ' + result.target + ', AF +' + result.af.extra.toFixed(2) + 'pt, generation ' + result.generation.total.toFixed(1));
}
console.log('Stat simulator: native/extended copies, validation, additive vs HP multiplicative effects, final bonuses, minimal AF/generation/mixed solutions and zero deficit passed.');
const evaluateMany = changes => scope.hakoAfTrainingModel.calculate({ member: { ...member, generation: changes.generation ?? generation,
  bonus: Object.fromEntries(Object.entries(member.bonus).map(([key, n]) => [key, n + (changes.bonus?.[key] ?? 0)])) },
  arts: [{ params: { hp: changes.af?.hp ?? 200, atk: changes.af?.atk ?? 200 } }] }, data, NaN).stages[2].values;
const rules = [{ stat: 'hp', source: 'bonus', amount: 140000, via: 'af' }, { stat: 'atk', source: 'af', amount: 100, via: 'generation' }];
const many = scope.hakoAfStatCompensation.solveMany({ evaluate: evaluateMany, rules, generation, af: { hp:200, atk:200 } });
assert.ok(many.goals.every(row => many.values[row.stat] >= row.target));
assert.ok(many.changes.generation > generation);
assert.ok(many.changes.af.hp < solve({evaluate:c=>evaluateMany({generation:c.generation,af:{hp:c.afTotal??200},bonus:{hp:c.bonusDelta??0}}),stat:'hp',deficit:140000,generation,af:200,mixedGeneration:generation}).af.total,
  'Shared generation reduces AF needed by the HP condition');
for (const source of ['af','generation']) {
 const result = solve({evaluate:c=>evaluateMany({generation:c.generation,af:{hp:c.afTotal??200},bonus:{hp:c.bonusDelta??0}}),stat:'hp',source,deficit:source==='af'?100:1000,generation,af:200,mixedGeneration:5000});
 assert.ok(result.bonus.values.hp>=result.target,'Reverse replacement by bonus parameters');
}
assert.throws(()=>scope.hakoAfStatCompensation.solveMany({evaluate:evaluateMany,rules:[...rules,rules[0]],generation,af:{hp:200,atk:200}}),/最大7/);
assert.throws(()=>scope.hakoAfStatCompensation.solveMany({evaluate:evaluateMany,rules:[{...rules[0],amount:NaN}],generation,af:{hp:200}}),/確認/);
console.log('Multiple compensation: AF/generation/bonus inverse conversion, joint targets, shared generation and invalid rules passed.');
const allKeys = Object.keys(scope.hakoAfStatCompensation.stats), startingBonus = Object.fromEntries(allKeys.map(key => [key, 20000]));
const startingAf = Object.fromEntries(allKeys.map(key => [key, 200]));
const evaluateExchange = changes => scope.hakoAfTrainingModel.calculate({ member: { ...member,
  generation: changes.generation ?? generation,
  bonus: Object.fromEntries(allKeys.map(key => [key, startingBonus[key] + (changes.bonus?.[key] ?? 0)])) },
  arts: [{ params: { ...startingAf, ...changes.af } }] }, data, NaN).stages[2].values;
const exchange = options => scope.hakoAfStatCompensation.exchange({ evaluate: evaluateExchange, generation, af: startingAf, bonus: startingBonus, stat: 'hp', ...options });
const early = exchange({ source: 'generation', from: 2000, to: 6000 }), late = exchange({ source: 'generation', from: 6000, to: 10000 });
assert.equal(early.rows.length, 7, 'A generation change covers every core ability');
assert.equal(early.rows[0].before, evaluateExchange({generation:2000}).hp, 'Explicit from value overrides the imported current generation for this comparison');
assert.equal(early.rows[0].after, evaluateExchange({generation:6000}).hp);
assert.ok(early.rows[0].equivalents.bonus.delta > late.rows[0].equivalents.bonus.delta, 'Equal generation increments have diminishing returns; never use a fixed conversion factor');
for (const row of early.rows) for (const [kind, value] of Object.entries(row.equivalents)) {
  assert.ok(value, kind+' equivalent exists for '+row.stat);
  const changes = {generation:2000, [kind]:{[row.stat]:kind==='bonus'?value.to-startingBonus[row.stat]:value.to}};
  assert.ok(evaluateExchange(changes)[row.stat] >= row.after, 'Inverse replacement achieves the full model target');
  if (value.delta > 0 && kind === 'bonus') {
    changes.bonus[row.stat]--;
    assert.ok(evaluateExchange(changes)[row.stat] < row.after, 'Bonus replacement is minimal to one point');
  }
}
assert.equal(early.rows.find(row=>row.stat==='lck').delta,0,'Generation does not invent luck growth');
assert.ok(exchange({source:'generation',from:2000,to:2000}).rows.every(row=>Object.values(row.equivalents).every(value=>value.delta===0)),'Unchanged inputs yield zero replacements');
const lowAf = exchange({source:'af',from:0,to:100}), highAf=exchange({source:'af',from:300,to:400});
assert.equal(lowAf.rows.length,1);assert.equal(lowAf.rows[0].before,evaluateExchange({af:{hp:0}}).hp);
assert.ok(lowAf.rows[0].equivalents.bonus.delta > highAf.rows[0].equivalents.bonus.delta, 'The bonus equivalent of AF changes depends on existing AF');
const bonusChange=exchange({source:'bonus',from:10000,to:30000});
assert.equal(bonusChange.rows[0].before,evaluateExchange({bonus:{hp:-10000}}).hp);
assert.ok(bonusChange.rows[0].equivalents.af.delta>0&&bonusChange.rows[0].equivalents.generation.delta>0);
const decrease=exchange({source:'af',from:200,to:100});
assert.ok(decrease.rows[0].delta<0);
assert.ok(Object.values(decrease.rows[0].equivalents).every(value=>!value||value.delta<=0),'Reductions produce negative equivalents or an explicit unavailable result');
const noBonusRoom=exchange({source:'generation',from:1e9,to:0});
assert.equal(noBonusRoom.rows[0].equivalents.bonus,null,'Cannot remove more bonus parameters than exist');
for(const from of [-1,NaN,Infinity,1e9+1])assert.throws(()=>exchange({source:'generation',from,to:6000}),/変更前/);
assert.throws(()=>exchange({source:'af',from:200,to:1e6+1}),/変更前/);
console.log('Before/after exchange: all seven stats, explicit baselines, diminishing generation returns, AF context, inverse bonus/AF/generation, zero changes, reductions and limits passed.');
