// Rebuild a compact, auditable report from saved results; never calls a provider.
const fs=require('node:fs'),path=require('node:path')
const {summarize,variants}=require('./benchmark.cjs')
function report(dir){
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'))
 const rows=fs.readFileSync(path.join(dir,'results.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
 const expected=manifest.cases.length*manifest.repeats*manifest.variants.length
 if(rows.length!==expected)throw Error(`Incomplete run: ${rows.length}/${expected}`)
 if(new Set(rows.map(r=>`${r.variant}/${r.caseId}/${r.repeat}`)).size!==expected)throw Error('Duplicate/missing trials')
 const stats=summarize(rows),sec=ms=>(ms/1000).toFixed(2),money=n=>'$'+n.toFixed(4)
 const lines=[`# Food resolver benchmark — ${manifest.runId}`,'',
  `${manifest.cases.length} synthetic cases × ${manifest.repeats} repetitions × ${manifest.variants.length} variants = ${rows.length} attempts. This is an exploratory fixture evaluation, not measured production accuracy or app end-to-end latency.`,
  '', '| Path | Contract passes | Ordinary | Personal | Abstention | Median | Sample p95 | Calls | Reported cost |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
 for(const v of variants){const s=stats[v.id];if(!s)continue
  const group=k=>s.groups[k]?`${s.groups[k].correct}/${s.groups[k].attempts}`:'—'
  lines.push(`| ${v.id} | ${s.correct}/${s.attempts} | ${group('ordinary')} | ${group('personal')} | ${group('abstention')} | ${sec(s.p50Ms)} s | ${sec(s.p95Ms)} s | ${s.requests} | ${s.incompleteCostRuns?'≥ ':''}${money(s.reportedCostUsd)} |`)
 }
 lines.push('','## Failures and policy differences','','A rejected proposal is a failed decision, not a correct abstention. The standard pipeline is assessed against the new conservative contract: it intentionally estimates vague servings and does not consume general history ranking. An external-search handoff counts as no local match; the external search itself is not run.','',
 '| Path | Case | Nonpassing runs | Observed outcome |','| --- | --- | ---: | --- |')
 for(const v of variants)for(const c of manifest.cases){const rs=rows.filter(r=>r.variant===v.id&&r.caseId===c.id&&!r.correct);if(!rs.length)continue
  const outcome=[...new Set(rs.map(r=>r.status==='matched'?`matched ${r.resolution.foodId}, ${r.resolution.grams} g, ${Number(r.resolution.kcal.toFixed(2))} kcal`:r.status))].join('; ')
  lines.push(`| ${v.id} | ${c.id} | ${rs.length}/${manifest.repeats} | ${outcome} |`)
 }
 lines.push('','## Jev confidence','','Confidence is distribution concentration, not a calibrated correctness probability. Thresholds below are descriptive on this same small test set, not tuned/validated rollout gates.','',
 '| Path | Confidence ≥ | Proposed matches | Correct | Rejected by validator | Accepted incorrect |','| --- | ---: | ---: | ---: | ---: | ---: |')
 for(const variant of manifest.variants.filter(v=>v.kind==='jev'&&!v.fallback))for(const threshold of [.8,.9,.95]){const rs=rows.filter(r=>r.variant===variant.id&&r.confidence>=threshold&&r.selected)
 lines.push(`| ${variant.id} | ${threshold} | ${rs.length} | ${rs.filter(r=>r.correct).length} | ${rs.filter(r=>r.status==='invalid_proposal').length} | ${rs.filter(r=>r.wrongAccepted).length} |`)}
 lines.push('','## Runtime details','','| Path | Zero-call runs | Timeouts | Incomplete cost runs | Providers |','| --- | ---: | ---: | ---: | --- |')
 for(const v of variants){const s=stats[v.id];if(s)lines.push(`| ${v.id} | ${s.zeroCallRuns} | ${s.deadlines} | ${s.incompleteCostRuns} | ${s.providers.join(', ')} |`)}
 lines.push('',`Recorded API cost: ${money(rows.reduce((n,r)=>n+r.reportedCostUsd,0))}. Timeout/incomplete requests may incur unreported charges. No subscription/infra/database cost included.`,
 '', 'All-attempt latency includes failures and capped timeouts. p95 uses nearest rank over this small sample; repetitions of the same 24 cases are not 72 independent food examples. Calls measure full request-to-response time, not streaming decode tokens/second.',
 '', '## Scope and reproduction','',
 '- Inputs already have one extracted food item and a small retrieved catalogue. Retrieval, embeddings, extraction, queueing, writes, icons and app/network rendering are excluded for all paths.',
 '- Standard replays current application exact lookup, semantic matching, serving and nutrition code against in-memory data, preserving prompts, 4096 token minimum, retry behavior and default OpenRouter routing. Non-exact candidates are assigned 0.85 similarity to exercise semantic matching; the ≥0.975 shortcut is not measured. The harness records an external handoff without importing foods or trying another provider.',
 '- Phase 3 replays the real three-turn resolver with in-memory tools. Searches return the full tiny fixture catalogue/history; retrieval relevance, truncation and database latency are not evaluated. Exact matches are included counterfactually here; production currently bypasses the shadow resolver for them. General history ranking is available to the new paths only, reflecting the proposed capability.',
 '- One-call paths get the same prefetched evidence and decision policy. Joint food/serving choices are shuffled and require a typed selection or none. Existing server validation owns grams and calories.',
 ...(manifest.variants.some(v=>v.prefilter)?['- Filtered paths apply that same server validator before the model call, removing impossible food/serving options and associated evidence. The filter checks explicit brand, preparation, supported quantity and nutrition, but does not infer semantic identity. Empty options return unmatched without a model; one remaining option still requires semantic selection. Post-selection validation remains in place. Negative fixtures in this set can all be handled by these existing deterministic rules.','- This follow-up reuses the first run\'s case seeds and labels. Filtering was added after observing the first run, so this is a targeted regression check on the same cases, not an independent holdout.']:[]),
 ...(manifest.variants.some(v=>v.fallback)?[`- Cascade is measured sequentially: filter, Jev, then Gemini for a non-match, rejected proposal or confidence below 0.9. It used Gemini on ${rows.filter(r=>r.usedFallback).length} runs. The entire cascade shares the 12-second limit. This threshold is illustrative, not calibrated on a held-out dataset. Transport errors are reported as failures, not hidden by this experimental cascade.`]:[]),
 '- A common 12-second whole-resolution benchmark deadline is applied. The standard production provider normally has a longer per-call timeout. No harness retries; existing standard-parser retries remain part of its code.',
 '- Default OpenRouter routing is preserved, so providers may differ across API schemas and over time. This measures concrete model+prompt+API configurations, not isolated model intelligence.',
 '- All fixtures and histories are synthetic, no hosted records or credentials are stored. Labels are handwritten and excluded from requests. Shared code hashes, seed, options and fixtures are in manifest.json; per-attempt sanitized evidence is in results.jsonl.',
 '', '```bash','node --test tests/food-benchmark.test.cjs','node scripts/food-agent/benchmark.cjs --live --smoke',
 manifest.referenceRun?`BENCHMARK_VARIANT=${manifest.variants.map(v=>v.id).join(',')} node scripts/food-agent/benchmark.cjs --live --compare-to scripts/food-agent/results/${manifest.referenceRun}`:'node scripts/food-agent/benchmark.cjs --live',
 `node scripts/food-agent/benchmark-report.cjs ${path.relative(process.cwd(),dir)}`,'```','')
 fs.writeFileSync(path.join(dir,'RESULTS.md'),lines.join('\n'))
 fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(stats,null,2))
 return stats
}
module.exports={report}
if(require.main===module){if(!process.argv[2])throw Error('Pass a completed result directory');report(path.resolve(process.argv[2]));console.log('Report written')}
