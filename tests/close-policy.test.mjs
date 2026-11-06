import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {closeWithPolicy}=await import('../src/lib/close-policy.mjs');
function fixture(){let time=0,active=true,requests=0;const logs=[];return {logs,get time(){return time},get requests(){return requests},set active(v){active=v},args:{running:async()=>active,requestClose:async()=>{requests++;active=false},now:()=>time,sleep:async ms=>{time+=ms},log:s=>logs.push(s)}}}
test('未运行时直接继续，不请求关闭',async()=>{const f=fixture();f.active=false;await closeWithPolicy(f.args);assert.equal(f.time,0);assert.equal(f.requests,0)});
test('运行状态未知时完整等待60秒再正常关闭',async()=>{const f=fixture();await closeWithPolicy(f.args);assert.equal(f.time,60000);assert.equal(f.requests,1);assert.ok(f.logs.some(s=>s.includes('60 秒')))});
test('用户自行退出后立即继续，不重复关闭',async()=>{const f=fixture();const sleep=f.args.sleep;f.args.sleep=async ms=>{await sleep(ms);if(f.time>=10000)f.active=false};await closeWithPolicy(f.args);assert.equal(f.time,10000);assert.equal(f.requests,0)});
test('正常退出被阻止时停止，不强制终止',async()=>{const f=fixture();let requested=0;f.args.requestClose=async()=>requested++;await assert.rejects(closeWithPolicy(f.args),/未退出/);assert.equal(requested,1);assert.equal(f.time,75000)});
test('无法读取进程状态时不当作空闲',async()=>{const f=fixture();f.args.running=async()=>{throw Error('读取失败')};await assert.rejects(closeWithPolicy(f.args),/读取失败/);assert.equal(f.requests,0)});
test('退出请求被拒绝时不继续后续操作',async()=>{const f=fixture();f.args.requestClose=async()=>{throw Error('拒绝退出')};await assert.rejects(closeWithPolicy(f.args),/拒绝退出/);assert.equal(f.time,60000)});
