import { resolveMeal } from "@/mealResolution/resolve"
import sharp from "sharp"

// A synthetic solid-color image exercises the real multimodal provider path
// without reading or transmitting any account's uploaded photos.
const input={userId:"00000000-0000-4000-8000-000000000001",
  operationId:"00000000-0000-4000-8000-000000000002",messageId:42,
  originalText:"What food is in this photo?",consumedOn:"2026-09-24T18:00:00Z",
  submittedAt:"2026-09-24T18:00:00Z",timezone:"America/New_York",
  locale:"en-US",attachmentIds:[7]}
const evidence={foods:new Map(),events:new Map(),
  async listMealEvents(){return {status:"ok",events:[],nextCursor:null}},
  async getMealEvent(){return {status:"unavailable"}},
  async searchFoods(){return {status:"empty",candidates:[],nextCursor:null}},
  async getFoodsAndServings(){return {status:"ok",foods:[],missingIds:[]}}}

async function main() {
  const imageBytes=await sharp({create:{width:256,height:256,channels:3,
    background:{r:255,g:220,b:0}}}).png().toBuffer()
  const image=new URL(`data:image/png;base64,${imageBytes.toString("base64")}`)
  const result=await resolveMeal(input,{evidence:evidence as any,
    loadPhotos:async()=>[{id:7,url:image}],deadlineMs:45000})
  console.log(JSON.stringify({outcome:result.proposal.outcome,photoIds:result.photoIds,
    steps:result.steps,toolCalls:result.toolCalls,durationMs:Math.round(result.durationMs)}))
  if(result.photoIds.length!==1) process.exitCode=1
}
void main()
