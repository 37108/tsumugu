import { createHash } from "node:crypto";

/**
 * The search client.
 *
 * This is the second and last script Tsumugu ships, and it is allowed the same
 * way the first one is: by the hash of these exact bytes, in a policy that
 * still refuses every other script on the page. See
 * `docs/decisions/0004-client-side-search.md` for why search is worth the
 * exception and what was rejected.
 *
 * It is written as one small function on purpose. There is no framework, no
 * bundler and no build step: what is served is what is written here, which is
 * also what a reader sees in view-source and what the hash is taken over.
 *
 * ## Behaviour
 *
 * - The index is fetched **once, on first use** — not on page load. A reader
 *   who never searches never downloads it.
 * - Matching is substring, case- and accent-insensitive, over the section text
 *   and its headings. It is not fuzzy: a documentation search that guesses is a
 *   documentation search that hides the exact page you asked for.
 * - Results are a listbox the arrow keys walk, Enter follows, Escape closes.
 *   The input owns the focus throughout, which is what the combobox pattern
 *   requires and what stops focus jumping under a screen reader.
 * - With JavaScript off, the form submits to `/search`, which is a real page
 *   listing every document.
 */
export const searchScript = `(()=>{
const form=document.querySelector("[data-tsumugu-search]");
if(!form)return;
const input=form.querySelector("input");
const list=document.getElementById("tsumugu-search-results");
const status=document.getElementById("tsumugu-search-status");
let entries=null,loading=false,active=-1;
const norm=(s)=>s.toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g,"");
const load=async()=>{
if(entries||loading)return;
loading=true;
try{const r=await fetch("/search.json");entries=(await r.json()).entries||[]}
catch{entries=[];status.textContent="Search is unavailable. Reload the page to try again."}
loading=false;render(input.value)};
const render=(query)=>{
const q=norm(query.trim());
list.innerHTML="";active=-1;
if(!q){list.hidden=true;input.setAttribute("aria-expanded","false");status.textContent="";return}
if(!entries){status.textContent="Loading…";return}
const hits=entries.filter((e)=>norm((e.section?e.section+" ":"")+e.document+" "+e.text).includes(q)).slice(0,12);
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
export const searchScriptHash = `'sha256-${createHash("sha256")
  .update(searchScript, "utf8")
  .digest("base64")}'`;
