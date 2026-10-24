const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'..');const source=fs.readFileSync(path.join(root,'js/core.js'),'utf8');
const part=source.slice(source.indexOf('window._triggerDelayedReply = function()'),source.indexOf('        window.simulateReply = function('));
function setup(config={}){let jobs=[],count=0;const c={window:{},settings:{replyDelayMin:3000,replyDelayMax:3000,typingIndicatorEnabled:false,allowReadNoReply:false,...config},messages:[],Math:Object.create(Math),Number,setTimeout(fn,delay){jobs.push({fn,delay});return jobs.length},clearTimeout(){throw Error('must not cancel promised reply')},_updateReadReceiptsDOM(){},throttledSaveData(){},simulateReply(){count++}};c.Math.random=()=>0.5;vm.createContext(c);vm.runInContext(part,c);return {c,jobs,get count(){return count}}}
let t=setup();t.c.window._triggerDelayedReply();assert.equal(t.jobs[1].delay,3000);t.jobs[1].fn();assert.equal(t.count,1); // no companion page required
 t=setup();t.c.window._triggerDelayedReply();t.c.settings.allowReadNoReply=true;t.c.settings.readNoReplyChance=1;t.c.window._triggerDelayedReply();assert.equal(t.jobs.filter(j=>j.delay===3000).length,1);t.jobs[1].fn();assert.equal(t.count,1);
t=setup({replyDelayMin:'3000',replyDelayMax:'5000'});t.c.window._triggerDelayedReply();assert.equal(t.jobs[1].delay,4000);
t=setup({allowReadNoReply:true,readNoReplyChance:1});t.c.window._triggerDelayedReply();assert.equal(t.jobs.length,1);
t=setup({replyDelayMin:300000,replyDelayMax:300000});t.c.window._triggerDelayedReply();assert.equal(t.jobs[1].delay,300000);
const host=fs.readFileSync(path.join(root,'js/features/companion-host.js'),'utf8');assert(!/window\._triggerDelayedReply\s*=/.test(host));
console.log('PASS normal chat without companion, promised reply survives followups, numeric settings, no-reply option, 5-minute maximum, no host override');
