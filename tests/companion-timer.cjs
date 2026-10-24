const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../js/features/companion.js'),'utf8');
const a=source.indexOf('    function recomputeTimerFromAnchor()'),b=source.indexOf('    function startTimer()',a);
function run(countdown,seconds,elapsed){let ended=0;const c={_timerAnchorAt:1000,_timerAnchorSeconds:seconds,isCountdown:countdown,timerSeconds:seconds,Date:{now:()=>1000+elapsed*1000},Math,updateTimerDisplay(){},stopTimer(){},onTimerEnd(){ended++;}};vm.createContext(c);vm.runInContext(source.slice(a,b)+';recomputeTimerFromAnchor();',c);return {seconds:c.timerSeconds,ended};}
assert.deepEqual(run(true,300,100),{seconds:200,ended:0});assert.deepEqual(run(true,300,900),{seconds:0,ended:1});assert.deepEqual(run(false,40,3600),{seconds:3640,ended:0});console.log('PASS timestamp countdown, background expiry, count-up recovery');
