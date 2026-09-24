const fs = require('node:fs')

function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a,b)=>a-b)
  return sorted[Math.max(0, Math.ceil(sorted.length*p)-1)]
}
function summarize(events) {
  const groups = new Map()
  for (const event of events) {
    if (event?.event !== 'food_baseline' || event.version !== 1) continue
    const key = `${event.inputClass}/${event.stage}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }
  return [...groups].map(([group, rows]) => {
    const duration = rows.map(r=>r.durationMs).filter(n=>Number.isFinite(n)&&n>=0)
    const costs = rows.map(r=>r.costUsd).filter(n=>Number.isFinite(n)&&n>=0)
    return {group, samples:rows.length, errors:rows.filter(r=>r.outcome==='error').length,
      statuses:rows.reduce((out,r)=>{if(r.status)out[r.status]=(out[r.status]||0)+1;return out},{}),
      comparisons:rows.reduce((out,r)=>{if(r.agentComparison)out[r.agentComparison]=(out[r.agentComparison]||0)+1;return out},{}),
      routes:rows.reduce((out,r)=>{if(r.agentRoute)out[r.agentRoute]=(out[r.agentRoute]||0)+1;return out},{}),
      fallbackReasons:rows.reduce((out,r)=>{if(r.agentFallbackReason)out[r.agentFallbackReason]=(out[r.agentFallbackReason]||0)+1;return out},{}),
      p50Ms:percentile(duration,.5), p95Ms:percentile(duration,.95),
      promptTokens:rows.reduce((n,r)=>n+(Number.isFinite(r.promptTokens)?r.promptTokens:0),0),
      completionTokens:rows.reduce((n,r)=>n+(Number.isFinite(r.completionTokens)?r.completionTokens:0),0),
      reportedCostUsd:costs.length?costs.reduce((a,b)=>a+b,0):null, costSamples:costs.length}
  })
}
if (require.main === module) {
  const filename = process.argv[2]
  if (!filename) throw Error('Usage: node scripts/food-baseline/report.cjs telemetry.jsonl')
  const events = fs.readFileSync(filename,'utf8').split('\n').flatMap(line=>{
    try {return [JSON.parse(line)]} catch {return []}
  })
  console.log(JSON.stringify({note:'Operational outcomes are not reviewed matching accuracy. Missing costs are unknown.',groups:summarize(events)},null,2))
}
module.exports = {summarize}
