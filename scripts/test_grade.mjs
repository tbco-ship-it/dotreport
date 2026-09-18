// Static builds and browser use one canonical policy; exercise every stored record.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { dotAssess } = createRequire(import.meta.url)('../static/grade.js');
const carriers = JSON.parse(readFileSync(new URL('../data/carriers.json', import.meta.url)));
const nat = JSON.parse(readFileSync(new URL('../data/national.json', import.meta.url)));
const counts = {};
for (const c of carriers) {
  const v = dotAssess(c, nat), g = v.grade;
  counts[g.letter] = (counts[g.letter] || 0) + 1;
  assert.equal(g.version, '2.0.0');
  assert.equal(g.limited, g.score === null);
  if (!v.driver.sufficient || !v.vehicle.sufficient) assert.equal(g.letter, 'NR');
  if (v.vehicle.rate === null) assert.equal(v.checks[4].tone, 'neutral');
  assert(!/Eligible for dispatch|Clean safety record|Authorized for hire|Zero alerts/.test(JSON.stringify(v)));
  if (!g.limited) assert.equal(g.score, Math.max(0, 100 + g.factors.reduce((sum, f) => sum + f.points, 0)));
}
console.log(JSON.stringify({ tested: carriers.length, grades: counts, policy: '2.0.0' }));
