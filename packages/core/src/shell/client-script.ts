import { createHash } from "node:crypto";

/**
 * The page client: search, and the copy control on code blocks.
 *
 * One script, not two. ADR 4 set the precedent that every script Tsumugu ships
 * costs an argument, and the cheapest third script is the one that does not
 * exist: copy-to-clipboard lives inside the same file as search, under the same
 * hash, so the policy still names exactly two scripts — this one, and live
 * reload in development. See `docs/decisions/0004-client-side-search.md`.
 *
 * Everything here is progressive enhancement. The search form submits to a real
 * page without it; the copy buttons are **created** by the script rather than
 * server-rendered, because a button that does nothing is worse than no button.
 *
 * ## Search ranking
 *
 * Defined in {@link scoreEntry} and {@link normalizeForSearch}, which are
 * embedded into the script verbatim — the tests call the same functions the
 * browser runs, so the ranking cannot drift from its tests.
 *
 * - The query is normalized (lowercase, Unicode NFKD, combining marks removed)
 *   and split on whitespace. Every term must match somewhere: two words narrow
 *   a search, they do not widen it.
 * - A match in the section heading outweighs one in the document title, which
 *   outweighs one in the body text — a reader typing "install" wants the
 *   section called Install before a page that mentions installing.
 * - A match at the start of a word outweighs one inside it, so "con" finds
 *   "Configure" before "second".
 * - Ties keep document order, and no document contributes more than three
 *   results, so one long page cannot fill the whole list.
 */

/** Lowercases, decomposes, and strips combining marks: "Café" matches "cafe". */
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** The fields ranking reads. The index's entries satisfy this. */
export interface ScoredEntry {
  readonly document: string;
  readonly section?: string;
  readonly text: string;
}

/**
 * Scores one entry against normalized query terms. 0 means "not a result".
 *
 * Self-contained on purpose: it is embedded into the client script by its
 * source text, so it must not reach for anything outside its own parameters.
 */
export function scoreEntry(
  entry: ScoredEntry,
  terms: readonly string[],
): number {
  const normalize = (value: string): string =>
    value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

  const section = normalize(entry.section ?? "");
  const document = normalize(entry.document);
  const text = normalize(entry.text);

  let total = 0;

  for (const term of terms) {
    let score = 0;

    // A match at the start of a word says the reader is typing this word; one
    // in the middle is often an accident of spelling.
    const wordStart = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "u",
    );

    if (section.includes(term)) {
      score = wordStart.test(section) ? 6 : 4;
    } else if (document.includes(term)) {
      score = wordStart.test(document) ? 5 : 3;
    } else if (text.includes(term)) {
      score = wordStart.test(text) ? 2 : 1;
    }

    if (score === 0) {
      // Every term must match somewhere. Two words narrow a search.
      return 0;
    }
    total += score;
  }

  return total;
}

/**
 * The script, assembled from the functions above plus the DOM wiring.
 *
 * The wiring is a template string because it is DOM code with nothing to unit
 * test; the ranking is embedded from real functions because it is logic with
 * everything to unit test.
 */
export const clientScript = `(()=>{
const normalizeForSearch=${normalizeForSearch.toString()};
const scoreEntry=${scoreEntry.toString()};

// --- Copy buttons on code blocks -------------------------------------------
// Created here rather than server-rendered: without this script they would be
// controls that do nothing.
if(navigator.clipboard){
for(const pre of document.querySelectorAll(".tsumugu-doc pre")){
const code=pre.querySelector("code");
if(!code)continue;
const button=document.createElement("button");
button.type="button";
button.className="tsumugu-copy";
button.textContent="Copy";
button.setAttribute("aria-label","Copy code");
button.setAttribute("aria-live","polite");
let timer;
button.addEventListener("click",async()=>{
try{
await navigator.clipboard.writeText(code.textContent??"");
button.textContent="Copied";
button.setAttribute("aria-label","Copied");
}catch{
button.textContent="Copy failed";
}
clearTimeout(timer);
timer=setTimeout(()=>{
button.textContent="Copy";
button.setAttribute("aria-label","Copy code");
},2000);
});
pre.append(button);
}
}

// --- Search ----------------------------------------------------------------
const form=document.querySelector("[data-tsumugu-search]");
if(!form)return;
const input=form.querySelector("input");
const list=document.getElementById("tsumugu-search-results");
const status=document.getElementById("tsumugu-search-status");
let entries=null,loading=false,active=-1;
const load=async()=>{
if(entries||loading)return;
loading=true;
try{const r=await fetch("/search.json");entries=(await r.json()).entries||[]}
catch{entries=[];status.textContent="Search is unavailable. Reload the page to try again."}
loading=false;render(input.value)};
const rank=(query)=>{
const terms=normalizeForSearch(query.trim()).split(/\\s+/).filter(Boolean);
if(!terms.length)return[];
const scored=[];
for(let i=0;i<entries.length;i+=1){
const score=scoreEntry(entries[i],terms);
if(score>0)scored.push({entry:entries[i],score,i});
}
scored.sort((a,b)=>b.score-a.score||a.i-b.i);
// One long page must not fill the whole list.
const perDocument=new Map();
const hits=[];
for(const{entry}of scored){
const seen=perDocument.get(entry.document)??0;
if(seen>=3)continue;
perDocument.set(entry.document,seen+1);
hits.push(entry);
if(hits.length===12)break;
}
return hits};
const render=(query)=>{
list.innerHTML="";active=-1;
if(!query.trim()){list.hidden=true;input.setAttribute("aria-expanded","false");status.textContent="";return}
if(!entries){status.textContent="Loading…";return}
const hits=rank(query);
status.textContent=hits.length===1?"1 result":hits.length+" results";
list.hidden=hits.length===0;
input.setAttribute("aria-expanded",hits.length?"true":"false");
hits.forEach((e,i)=>{
const li=document.createElement("li");
li.id="tsumugu-search-result-"+i;li.setAttribute("role","option");li.setAttribute("aria-selected","false");
const a=document.createElement("a");a.href=e.url;a.tabIndex=-1;
const t=document.createElement("span");t.className="tsumugu-search-title";t.textContent=e.section||e.document;
const c=document.createElement("span");c.className="tsumugu-search-context";c.textContent=e.section?e.document:(e.description||"");
a.append(t,c);li.append(a);list.append(li)})};
const move=(step)=>{
const items=[...list.children];if(!items.length)return;
if(active>=0)items[active].setAttribute("aria-selected","false");
active=(active+step+items.length)%items.length;
const chosen=items[active];chosen.setAttribute("aria-selected","true");
input.setAttribute("aria-activedescendant",chosen.id);
chosen.scrollIntoView({block:"nearest"})};
input.addEventListener("focus",load,{once:true});
input.addEventListener("input",()=>{entries?render(input.value):load()});
input.addEventListener("keydown",(event)=>{
if(event.key==="ArrowDown"){event.preventDefault();move(1)}
else if(event.key==="ArrowUp"){event.preventDefault();move(-1)}
else if(event.key==="Enter"&&active>=0){event.preventDefault();list.children[active].querySelector("a").click()}
else if(event.key==="Escape"){input.value="";render("")}});
document.addEventListener("click",(event)=>{if(!form.contains(event.target)){list.hidden=true;input.setAttribute("aria-expanded","false")}});
})();`;

/** The CSP source expression that allows exactly the script above. */
export const clientScriptHash = `'sha256-${createHash("sha256")
  .update(clientScript, "utf8")
  .digest("base64")}'`;
