// A barcode no food database knows (supplements mostly), looked up the way a person would: search its digits, open the
// shops' pages that print it, read their facts panel. The pages are fetched here, so every fact cites a page that was
// actually read (meals 30404 and 30405: Life Extension glycine and Nutricost psyllium, found on Vitacost and others).

export type BarcodePage={url:string;title:string;description:string;
  /** The page's facts panel ("Supplement Facts Serving Size: 3 Capsules …"), when it has one. */ facts:string|null}

const PANEL=/supplement facts|nutrition facts|nutrition information|nutritional information|nutrition declaration/i
const BROWSER="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

/** Brave's web results for a query; throws when search is unavailable (no key, an error) so the caller can fall back. */
export async function braveSearch(query:string,signal?:AbortSignal):Promise<{url:string;title:string;description:string}[]> {
  const key=process.env.BRAVE_API_KEY
  if (!key) throw new Error("search_unavailable")
  const response=await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
    {headers:{Accept:"application/json","X-Subscription-Token":key},signal:anySignal(signal,5000)})
  if (!response.ok) {await response.body?.cancel();throw new Error("search_unavailable")}
  const body=await response.json() as {web?:{results?:{url?:string;title?:string;description?:string}[]}}
  return (body.web?.results??[]).flatMap(row=>typeof row.url==="string"&&/^https:\/\//.test(row.url)?
    [{url:row.url,title:plain(row.title??""),description:plain(row.description??"")}]:[])
}

/** A page's readable text: scripts, styles and tags removed. */
export function pageText(html:string) {
  return plain(html.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi," "))
}

/** The facts panel in a page's text, about one label long. */
export function factsPanel(text:string):string|null {
  const at=text.search(PANEL)
  return at<0?null:text.slice(at,at+1200)
}

/** The search results for a barcode, each with its facts panel when the page prints this barcode. Pages that block
 * readers or don't mention the digits keep only their title (enough to tell a book from a food). */
export async function barcodePages(gtin:string,signal?:AbortSignal,
  deps:{search?:typeof braveSearch;fetchPage?:(url:string,signal:AbortSignal)=>Promise<string|null>}={}):Promise<BarcodePage[]> {
  const digits=gtin.replace(/^0+(?=\d{12})/,"")
  const results=(await (deps.search??braveSearch)(digits,signal)).slice(0,8)
  const fetchPage=deps.fetchPage??readPage
  return Promise.all(results.map(async (result,index)=>{
    // The first six results are opened; the rest keep their titles.
    const html=index<6?await fetchPage(result.url,anySignal(signal,6000)).catch(()=>null):null
    const text=html?pageText(html):""
    const printsBarcode=[digits,digits.replace(/^0/,""),gtin].some(form=>text.includes(form)||result.title.includes(form)||result.url.includes(form))
    return {...result,facts:printsBarcode?factsPanel(text):null}
  }))
}

async function readPage(url:string,signal:AbortSignal):Promise<string|null> {
  const response=await fetch(url,{headers:{"User-Agent":BROWSER,Accept:"text/html"},signal,redirect:"follow"})
  if (!response.ok||!(response.headers.get("content-type")??"").includes("html")) {await response.body?.cancel();return null}
  return (await response.text()).slice(0,3_000_000)
}

const plain=(value:string)=>decodeEntities(value.replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim()
function decodeEntities(value:string) {
  const named:Record<string,string>={amp:"&",lt:"<",gt:">",quot:"\"",apos:"'",nbsp:" ",ndash:"–",mdash:"—",reg:"®",trade:"™",copy:"©"}
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(entity,code:string)=>code[0]==="#"?
    String.fromCodePoint(code[1]==="x"||code[1]==="X"?parseInt(code.slice(2),16):Number(code.slice(1))):named[code.toLowerCase()]??entity)
}
/** Aborts after ms, or with the caller's signal. */
export function anySignal(signal:AbortSignal|undefined,ms:number) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms)
  const stop=()=>{clearTimeout(timer);controller.abort()}
  if (signal?.aborted) stop(); else signal?.addEventListener("abort",stop,{once:true})
  return controller.signal
}
