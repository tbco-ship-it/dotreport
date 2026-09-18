// Compare freshly calculated Python/JS results; stored JSON grades may predate v2.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {dotGrade}=require('../static/grade.js');
const carriers=JSON.parse(readFileSync(new URL('../data/carriers.json',import.meta.url)));
const nat=JSON.parse(readFileSync(new URL('../data/national.json',import.meta.url)));
const root=new URL('../',import.meta.url);
const py=spawnSync('python',['-c',`import sys,json;sys.path.insert(0,'scripts');from grading import grade;c=json.load(open('data/carriers.json'));n=json.load(open('data/national.json'));print(json.dumps([grade(x,n) for x in c]))`],{cwd:root,encoding:'utf8',maxBuffer:128*1024*1024});
if(py.status!==0)throw new Error(py.stderr);
const expected=JSON.parse(py.stdout);
let bad=0;
for(let i=0;i<carriers.length;i++){
  if(JSON.stringify(dotGrade(carriers[i],nat))!==JSON.stringify(expected[i])){
    if(bad++<3)console.error('Mismatch',carriers[i].dot,dotGrade(carriers[i],nat),expected[i]);
  }
}
console.log(`${bad?'FAIL':'PASS'}: ${carriers.length} records; Python/JS grade, reasons and factors`);
process.exit(bad?1:0);
