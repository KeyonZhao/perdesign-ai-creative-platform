export type ResearchWebSource = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
};

export type ResearchWebImage = {
  url: string;
  sourceUrl: string;
  sourceTitle: string;
  alt: string;
};

const SEARCH_TIMEOUT_MS = 9_000;
const PAGE_TIMEOUT_MS = 6_000;

export async function collectResearchWebEvidence(query: string) {
  const cleanQuery = query.replace(/\s+/g, " ").trim().slice(0, 160);
  if (cleanQuery.length < 2) return { sources: [], images: [] };

  const sources = await searchRelevantPages(cleanQuery);
  const images = (await Promise.all(sources.slice(0, 6).map(extractImageFromPage)))
    .filter((image): image is ResearchWebImage => Boolean(image))
    .filter((image, index, all) => all.findIndex((item) => item.url === image.url) === index)
    .slice(0, 4);
  return { sources, images };
}

async function searchRelevantPages(query: string): Promise<ResearchWebSource[]> {
  const bingResults = await searchBingRss(query);
  if (bingResults.length && resultsLookRelevant(bingResults, query)) return bingResults.slice(0, 7);
  return searchWikipediaPages(query);
}

async function searchBingRss(query: string): Promise<ResearchWebSource[]> {
  try {
    const response = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PerdesignResearch/1.0)", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7" },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      cache: "no-store"
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return (xml.match(/<item>[\s\S]*?<\/item>/gi) || []).flatMap((item) => {
      const title = decodeXml(readXmlTag(item, "title"));
      const url = decodeXml(readXmlTag(item, "link"));
      const snippet = stripMarkup(decodeXml(readXmlTag(item, "description"))).slice(0, 700);
      if (!title || !/^https?:\/\//i.test(url)) return [];
      try {
        return [{ title, url, snippet, domain: new URL(url).hostname.replace(/^www\./, "") }];
      } catch { return []; }
    });
  } catch { return []; }
}

async function searchWikipediaPages(query: string): Promise<ResearchWebSource[]> {
  try {
    const apiUrl = new URL("https://zh.wikipedia.org/w/api.php");
    apiUrl.search = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query, gsrlimit: "7", prop: "extracts", exintro: "1", explaintext: "1", format: "json", origin: "*" }).toString();
    const response = await fetch(apiUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; PerdesignResearch/1.0)" }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json() as WikipediaResponse;
    return Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 99) - (b.index || 99)).map((page) => ({
      title: page.title,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
      snippet: (page.extract || "").replace(/\s+/g, " ").trim().slice(0, 700),
      domain: "zh.wikipedia.org"
    })).filter((source) => scoreRelevance(source, query) > 0).slice(0, 7);
  } catch { return []; }
}

async function extractImageFromPage(source: ResearchWebSource): Promise<ResearchWebImage | null> {
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PerdesignResearch/1.0)", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7" },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store"
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
    const html = (await response.text()).slice(0, 900_000);
    const candidates = [readMeta(html, "property", "og:image"), readMeta(html, "name", "twitter:image"), ...readContentImages(html)].filter(Boolean);
    for (const value of candidates) {
      try {
        const imageUrl = new URL(decodeXml(value), response.url).toString();
        if (!/^https?:\/\//i.test(imageUrl) || /(?:logo|icon|avatar|sprite|favicon)/i.test(imageUrl)) continue;
        return { url: imageUrl, sourceUrl: source.url, sourceTitle: source.title, alt: source.title };
      } catch { /* Try the next image candidate. */ }
    }
  } catch { /* A source may block server-side page reads. */ }
  return null;
}

function resultsLookRelevant(results: ResearchWebSource[], query: string) {
  return results.filter((result) => scoreRelevance(result, query) > 0).length >= Math.min(2, results.length);
}

function scoreRelevance(source: ResearchWebSource, query: string) {
  const terms = query.match(/[A-Za-z][A-Za-z0-9-]{1,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const haystack = `${source.title} ${source.snippet}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term.toLowerCase()) ? Math.min(term.length, 8) : 0), 0);
}

function readMeta(html: string, key: string, value: string) {
  for (const tag of html.match(/<meta\s+[^>]*>/gi) || []) {
    const keyMatch = tag.match(new RegExp(`${key}=["']([^"']+)["']`, "i"));
    if (keyMatch?.[1].toLowerCase() !== value.toLowerCase()) continue;
    return tag.match(/content=["']([^"']+)["']/i)?.[1] || "";
  }
  return "";
}

function readContentImages(html: string) {
  return (html.match(/<img\s+[^>]*>/gi) || []).flatMap((tag) => {
    if (/(?:logo|icon|avatar|sprite|favicon)/i.test(tag)) return [];
    const width = Number(tag.match(/width=["']?(\d+)/i)?.[1] || 0);
    const height = Number(tag.match(/height=["']?(\d+)/i)?.[1] || 0);
    if ((width && width < 300) || (height && height < 180)) return [];
    const src = tag.match(/(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1];
    return src ? [src] : [];
  }).slice(0, 12);
}

function readXmlTag(xml: string, tag: string) { return xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"))?.[1]?.trim() || ""; }
function stripMarkup(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function decodeXml(value: string) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }

type WikipediaResponse = { query?: { pages?: Record<string, { title: string; index?: number; extract?: string }> } };
