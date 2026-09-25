import { decisionModel } from "@/ai/models"
export type DecisionTask = {options:Record<string,unknown>;state:unknown;questions:{selection:{type:"choice";instructions:string;criteria:Record<string,string>}}}
export type JevResult = {status:"ok" | "unavailable" | "invalid_response"; choice?: string; confidence?: number;
  model:string; durationMs:number; promptTokens:number; completionTokens:number; costUsd?:number}
const number = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0
export async function selectWithJev(task: DecisionTask, signal: AbortSignal,
  dependencies: {env?:NodeJS.ProcessEnv; fetch?:typeof fetch; timeoutMs?:number} = {}): Promise<JevResult> {
  const env = dependencies.env ?? process.env, model = decisionModel(env)
  const start = performance.now(), controller = new AbortController()
  const result: JevResult = {status:"unavailable",model,durationMs:0,promptTokens:0,completionTokens:0}
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = () => controller.abort()
  try {
    const key = env.OPENROUTER_API_KEY || env.OPEN_ROUTER_API_KEY
    if (!key) return result
    signal.addEventListener("abort",abort,{once:true})
    if (signal.aborted) controller.abort()
    controller.signal.throwIfAborted()
    const deadline = new Promise<never>((_,reject)=>{
      controller.signal.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true})
      timer = setTimeout(abort,dependencies.timeoutMs ?? 2000)
    })
    await Promise.race([(async()=>{
      const response = await (dependencies.fetch ?? fetch)("https://openrouter.ai/api/alpha/decisions",{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},signal:controller.signal,
        body:JSON.stringify({model,state:task.state,questions:task.questions})})
      if (!response.ok) {await response.body?.cancel();return}
      const body = await response.json()
      controller.signal.throwIfAborted()
      const usage = body.usage
      result.promptTokens = number(usage?.input_tokens) ? usage.input_tokens : 0
      result.completionTokens = number(usage?.output_tokens) ? usage.output_tokens : 0
      if (number(usage?.cost)) result.costUsd = usage.cost
      const answer = body.answers?.selection
      if (body.error || answer?.type !== "choice" || typeof answer.choice !== "string" ||
          !Object.prototype.hasOwnProperty.call(task.options,answer.choice) || !number(answer.confidence) || answer.confidence > 1) {
        result.status = "invalid_response";return
      }
      result.status = "ok";result.choice = answer.choice;result.confidence = answer.confidence
    })(),deadline])
  } catch { /* Keep credentials, response bodies and provider errors out of telemetry. */ }
  finally {clearTimeout(timer);signal.removeEventListener("abort",abort);controller.abort();result.durationMs=performance.now()-start}
  return {...result}
}
