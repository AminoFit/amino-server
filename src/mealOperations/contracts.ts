import { z } from "zod"

const uuid = z.string().uuid()
const instant = z.string().datetime({offset:true})
const base = z.object({
  schemaVersion:z.literal(1),operationId:uuid,clientMealId:uuid,
  messageId:z.number().int().positive().nullable(),
  expectedPublishedRevision:z.number().int().nonnegative().nullable(),
  submittedAt:instant,timezone:z.string().min(1).max(80),
  locale:z.string().min(2).max(35).nullable().optional()
})
const languageInput = z.object({originalText:z.string().trim().max(8000),
  consumedOn:instant,localId:z.string().min(8).max(64).optional(),
  attachmentIds:z.array(z.number().int().positive()).max(10).default([])}).strict()
const structuredInput = z.object({originalText:z.string().max(8000),consumedOn:instant,
  targetLogicalItemId:uuid.optional(),foodId:z.number().int().positive().optional(),
  servingId:z.number().int().positive().nullable().optional(),
  servingAmount:z.number().positive().finite().optional(),grams:z.number().positive().finite().optional()}).strict()

export const operationRequest = z.discriminatedUnion("action",[
  base.extend({action:z.literal("create"),messageId:z.null(),expectedPublishedRevision:z.null(),input:languageInput}).strict(),
  base.extend({action:z.literal("replace"),messageId:z.number().int().positive(),
    expectedPublishedRevision:z.number().int().nonnegative(),input:languageInput}).strict(),
  base.extend({action:z.literal("portion"),messageId:z.number().int().positive(),
    expectedPublishedRevision:z.number().int().nonnegative(),input:structuredInput}).strict(),
  base.extend({action:z.literal("move"),messageId:z.number().int().positive(),
    expectedPublishedRevision:z.number().int().nonnegative(),input:structuredInput}).strict(),
  base.extend({action:z.literal("delete"),messageId:z.number().int().positive(),
    expectedPublishedRevision:z.number().int().nonnegative(),input:structuredInput}).strict()
]).superRefine((request,ctx)=>{
  if(request.action==="create"&&!request.input.originalText&&
    !request.input.attachmentIds.length)
    ctx.addIssue({code:"custom",path:["input"],message:"Food text or a photo is required"})
  try {new Intl.DateTimeFormat("en",{timeZone:request.timezone})}
  catch {ctx.addIssue({code:"custom",path:["timezone"],message:"Valid IANA timezone required"})}
  if(request.action==="portion") {
    const input=request.input
    if(!input.targetLogicalItemId||input.servingId==null&&input.grams==null||
      input.servingId!=null&&input.servingAmount==null||input.servingId!=null&&input.grams!=null)
      ctx.addIssue({code:"custom",path:["input"],message:"Choose one target and one explicit portion basis"})
  }
  if(request.action==="move"&&request.input.targetLogicalItemId)
    ctx.addIssue({code:"custom",path:["input","targetLogicalItemId"],
      message:"Moving an individual food requires a destination meal"})
})
export type OperationRequest = z.infer<typeof operationRequest>

export const quantity = z.discriminatedUnion("kind",[
  z.object({kind:z.literal("mass"),grams:z.number().positive().finite().max(5000)}).strict(),
  z.object({kind:z.literal("estimated_mass"),grams:z.number().positive().finite().max(5000),
    basis:z.string().trim().min(8).max(300)}).strict(),
  z.object({kind:z.literal("serving"),servingId:z.number().int().positive(),
    amount:z.number().positive().finite().max(1000)}).strict(),
  z.object({kind:z.literal("history"),sourceMessageId:z.number().int().positive(),
    sourceLoggedFoodItemId:z.number().int().positive(),scale:z.number().positive().finite().max(100)}).strict()
])

export const mealProposal = z.object({schemaVersion:z.literal(1),
  outcome:z.enum(["resolved","needs_clarification"]),
  consumedOn:instant,
  historyGroupSelections:z.array(z.object({sourceMessageId:z.number().int().positive(),
    groupId:z.string().min(1).max(80),scale:z.number().positive().finite().max(100),
    excludeLoggedFoodItemIds:z.array(z.number().int().positive()).max(30)}).strict()).max(10),
  items:z.array(z.object({foodId:z.number().int().positive().nullable(),quantity,
    groupId:z.string().max(80).nullable(),groupLabel:z.string().max(120).nullable(),
    evidence:z.array(z.string().max(180)).max(10)}).strict()).max(30),
  claims:z.array(z.object({sourceText:z.string().max(300),nutrient:z.enum(["kcal","proteinG","carbG","totalFatG"]),
    value:z.number().finite().nonnegative(),role:z.enum(["label_identity","portion_target","group_total"]),
    basis:z.enum(["consumed","per_serving","per_100g"]),
    relation:z.enum(["equal","approximate","minimum","maximum"]),
    itemIndexes:z.array(z.number().int().nonnegative()).max(30)}).strict()).max(30),
  clarification:z.string().trim().min(5).max(300).nullable()
}).strict().superRefine((plan,ctx)=>{
  if (plan.outcome==="resolved" && (!plan.items.length&&!plan.historyGroupSelections.length || plan.clarification))
    ctx.addIssue({code:"custom",message:"Resolved plans need foods and no clarification"})
  if (plan.outcome==="needs_clarification" && (!plan.clarification || plan.items.length||plan.historyGroupSelections.length))
    ctx.addIssue({code:"custom",message:"Clarification plans need a question and no foods"})
  for (const claim of plan.claims) if (!plan.historyGroupSelections.length&&claim.itemIndexes.some(i=>i>=plan.items.length))
    ctx.addIssue({code:"custom",message:"Claim references an absent item"})
})
export type MealProposal = z.infer<typeof mealProposal>

export const operationClaim = z.object({operationId:uuid,messageId:z.number().int().positive(),userId:uuid,
  generation:z.number().int().positive(),operationVersion:z.number().int().positive(),workerToken:uuid,
  attempts:z.number().int().positive(),
  action:z.enum(["create","replace","portion","move","delete"]),
  input:z.record(z.unknown()),answers:z.array(z.object({text:z.string(),at:z.string()})),
  expectedPublishedRevision:z.number().int().nonnegative().nullable()})
export type OperationClaim = z.infer<typeof operationClaim>
