const { generateAssForClip } = require('./src/utils/assGenerator');
const fs = require('fs');
const ass = generateAssForClip({ segments:[{start:0,end:2,text:'hello world again',words:[{word:'hello',start:0,end:0.4},{word:'world',start:0.4,end:0.8},{word:'again',start:0.8,end:1.2}]}]},0,1.2,'',{preset:'word_pop'});
fs.writeFileSync('test.ass', ass);
console.log(ass.split('\n').slice(-5).join('\n'));
