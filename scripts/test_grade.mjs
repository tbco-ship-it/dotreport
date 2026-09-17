// Checks static/grade.js reproduces the grade normalize.py stored for every carrier in data/carriers.json.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { dotGrade } = require("../static/grade.js");
const carriers = JSON.parse(readFileSync(new URL("../data/carriers.json", import.meta.url)));
const nat = JSON.parse(readFileSync(new URL("../data/national.json", import.meta.url)));
let bad = 0;
for (const c of carriers) {
  const g = dotGrade(c, nat);
  const want = c.grade;
  const same = g.score === want.score && g.letter === want.letter && g.limited === want.limited && JSON.stringify(g.factors) === JSON.stringify(want.factors);
  if (!same && bad++ < 5) console.log("MISMATCH", c.dot, JSON.stringify(g), "\n     py:", JSON.stringify(want));
}
console.log(bad ? `FAIL ${bad}/${carriers.length}` : `OK ${carriers.length} carriers, JS grade == Python grade`);
process.exit(bad ? 1 : 0);
