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
const PAGE_TIMEOUT_MS = 12_000;

export async function collectResearchWebEvidence(query: string) {
  const cleanQuery = query.replace(/\s+/g, " ").trim().slice(0, 160);
  if (cleanQuery.length < 2) return { sources: [], images: [] };

  const sources = await searchRelevantPages(cleanQuery);
  const images = (await Promise.all(sources.slice(0, 5).map((source) => extractImageFromPage(source, cleanQuery))))
    .filter((image): image is ResearchWebImage => Boolean(image))
    .filter((image, index, all) => all.findIndex((item) => item.url === image.url) === index)
    .slice(0, 2);
  return { sources, images };
}

async function searchRelevantPages(query: string): Promise<ResearchWebSource[]> {
  const queryVariants = buildSearchQueryVariants(query);
  const bingResults = (await Promise.all(queryVariants.map(searchBingHtml)))
    .flat()
    .filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index);
  const minimumScore = minimumRelevanceScore(query);
  const rankedBingResults = bingResults
    .map((source) => ({ source, score: scoreRelevance(source, query) }))
    .filter((item) => item.score >= minimumScore && hasEnoughMatchedTerms(item.source, query))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.source);
  if (rankedBingResults.length >= 2) return rankedBingResults.slice(0, 7);

  const wikipediaResults = await searchWikipediaPages(query);
  return [...rankedBingResults, ...wikipediaResults]
    .filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index)
    .slice(0, 7);
}

function buildSearchQueryVariants(query: string) {
  const exactEntity = extractQueryTerms(query)
    .filter((term) => /\d/.test(term) || /-/.test(term))
    .sort((a, b) => b.length - a.length)[0];
  return [...new Set([
    query,
    exactEntity ? `"${exactEntity}"` : ""
  ].filter(Boolean))].slice(0, 2);
}

async function searchBingHtml(query: string): Promise<ResearchWebSource[]> {
  try {
    const searchUrl = new URL("https://cn.bing.com/search");
    searchUrl.search = new URLSearchParams({
      q: query,
      setlang: "zh-hans",
      cc: "CN",
      count: "10"
    }).toString();
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7"
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      cache: "no-store"
    });
    if (!response.ok) return searchBingRss(query);
    const html = await response.text();
    const results = (html.match(/<li class=["']b_algo["'][\s\S]*?<\/li>/gi) || []).flatMap((item) => {
      const heading = item.match(/<h2[^>]*>[\s\S]*?<\/h2>/i)?.[0] || "";
      const anchor = heading.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      const url = decodeHtml(anchor?.[1] || "");
      const title = stripMarkup(decodeHtml(anchor?.[2] || ""));
      const snippet = stripMarkup(decodeHtml(
        item.match(/<div[^>]+class=["'][^"']*b_caption[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""
      )).slice(0, 700);
      if (!title || !/^https?:\/\//i.test(url) || /(?:bing\.com|microsoft\.com)\/ck\//i.test(url)) return [];
      try {
        return [{ title, url, snippet, domain: new URL(url).hostname.replace(/^www\./, "") }];
      } catch { return []; }
    });
    return results.length ? results : searchBingRss(query);
  } catch {
    return searchBingRss(query);
  }
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
    })).filter((source) => scoreRelevance(source, query) >= minimumRelevanceScore(query)).slice(0, 7);
  } catch { return []; }
}

async function extractImageFromPage(source: ResearchWebSource, query: string): Promise<ResearchWebImage | null> {
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PerdesignResearch/1.0)", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7" },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store"
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
    const html = (await response.text()).slice(0, 900_000);
    const pageScore = scoreRelevance(source, query);
    const minimumScore = minimumRelevanceScore(query);
    const pageHasStrongTitleMatch = scoreTextRelevance(source.title, query) >= minimumScore;
    const candidates: ImageCandidate[] = [
      ...readContentImages(html),
      { url: readMeta(html, "property", "og:image"), alt: readMeta(html, "property", "og:image:alt"), kind: "social" as const },
      { url: readMeta(html, "name", "twitter:image"), alt: readMeta(html, "name", "twitter:image:alt"), kind: "social" as const }
    ]
      .filter((candidate) => Boolean(candidate.url))
      .filter((candidate) => {
        const imageText = `${candidate.alt} ${safeUrlText(candidate.url)}`;
        const imageScore = scoreTextRelevance(imageText, query);
        if (candidate.kind === "content") return imageScore >= Math.min(2, minimumScore);
        return pageScore >= minimumScore + 2 && pageHasStrongTitleMatch && imageScore >= minimumScore;
      })
      .sort((a, b) => scoreTextRelevance(`${b.alt} ${safeUrlText(b.url)}`, query) - scoreTextRelevance(`${a.alt} ${safeUrlText(a.url)}`, query));
    for (const candidate of candidates) {
      try {
        const imageUrl = new URL(decodeXml(candidate.url), response.url).toString();
        if (!isUsableResearchImageUrl(imageUrl)) continue;
        return {
          url: imageUrl,
          sourceUrl: source.url,
          sourceTitle: source.title,
          alt: candidate.alt || source.title
        };
      } catch { /* Try the next image candidate. */ }
    }
  } catch { /* A source may block server-side page reads. */ }
  return null;
}

function scoreRelevance(source: ResearchWebSource, query: string) {
  return scoreTextRelevance(`${source.title} ${source.snippet}`, query);
}

function hasEnoughMatchedTerms(source: ResearchWebSource, query: string) {
  const terms = extractQueryTerms(query);
  if (terms.length <= 1) return true;
  const text = `${source.title} ${source.snippet}`.toLowerCase();
  const matches = terms.filter((term) => text.includes(term.toLowerCase())).length;
  return matches >= Math.min(2, terms.length);
}

function scoreTextRelevance(text: string, query: string) {
  const haystack = text.toLowerCase();
  return extractQueryTerms(query).reduce(
    (score, term) => score + (haystack.includes(term.toLowerCase()) ? Math.min(term.length, 8) : 0),
    0
  );
}

function extractQueryTerms(query: string) {
  return [...new Set(
    query
      .split(/\s+/)
      .flatMap((part) => part.match(/[A-Za-z][A-Za-z0-9-]{1,}|[\u4e00-\u9fa5]{2,}/g) || [])
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
  )];
}

function minimumRelevanceScore(query: string) {
  return extractQueryTerms(query).length >= 2 ? 4 : 2;
}

function readMeta(html: string, key: string, value: string) {
  for (const tag of html.match(/<meta\s+[^>]*>/gi) || []) {
    const keyMatch = tag.match(new RegExp(`${key}=["']([^"']+)["']`, "i"));
    if (keyMatch?.[1].toLowerCase() !== value.toLowerCase()) continue;
    return tag.match(/content=["']([^"']+)["']/i)?.[1] || "";
  }
  return "";
}

function readContentImages(html: string): ImageCandidate[] {
  return (html.match(/<img\s+[^>]*>/gi) || []).flatMap((tag) => {
    if (/(?:logo|icon|avatar|sprite|favicon|banner|header|footer|advert|placeholder|qrcode|qr-code)/i.test(tag)) return [];
    const width = Number(tag.match(/width=["']?(\d+)/i)?.[1] || 0);
    const height = Number(tag.match(/height=["']?(\d+)/i)?.[1] || 0);
    if ((width && width < 300) || (height && height < 180)) return [];
    const src = tag.match(/(?:data-src|data-original|src)=["']([^"']+)["']/i)?.[1];
    const alt = decodeXml(tag.match(/(?:alt|title)=["']([^"']+)["']/i)?.[1] || "");
    return src ? [{ url: src, alt, kind: "content" as const }] : [];
  }).slice(0, 12);
}

function safeUrlText(value: string) {
  try { return decodeURIComponent(value).replace(/[-_/?.=&]+/g, " "); }
  catch { return value; }
}

function isUsableResearchImageUrl(value: string) {
  return /^https?:\/\//i.test(value) &&
    !/(?:logo|icon|avatar|sprite|favicon|banner|header|footer|advert|placeholder|qrcode|qr-code|tracking|pixel)/i.test(value) &&
    !/\.(?:svg|gif)(?:$|[?#])/i.test(value);
}

function readXmlTag(xml: string, tag: string) { return xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"))?.[1]?.trim() || ""; }
function stripMarkup(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function decodeXml(value: string) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function decodeHtml(value: string) {
  return decodeXml(value)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&ensp;|&emsp;|&nbsp;/g, " ");
}

type WikipediaResponse = { query?: { pages?: Record<string, { title: string; index?: number; extract?: string }> } };
type ImageCandidate = { url: string; alt: string; kind: "content" | "social" };
