import {
  GeneratedAiImage,
  VerifiedWebLink,
  WebImageResult,
} from './components/VortexRichBlocks';
import { ghostBrowserController } from './components/VortexGhostBrowser';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; Redmi Note 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
};

function stripHtmlToCleanText(html: string): { title: string; bodyText: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: title || 'Verified Web Page',
    bodyText: cleaned.slice(0, 6500),
  };
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function generateFreeAiImage(
  prompt: string,
  options?: { model?: string; width?: number; height?: number; apiKey?: string }
): Promise<GeneratedAiImage> {
  const cleanPrompt = prompt.trim();
  const model = options?.model || 'flux';
  const width = options?.width || 1024;
  const height = options?.height || 1024;
  const seed = Math.floor(100000 + Math.random() * 899999);
  const encoded = encodeURIComponent(cleanPrompt);

  const primaryUrl = `https://gen.pollinations.ai/image/${encoded}?width=${width}&height=${height}&model=${encodeURIComponent(
    model
  )}&seed=${seed}&nologo=true`;
  const fallbackUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const headers: Record<string, string> = {};
    if (options?.apiKey && options.apiKey.trim().length > 5) {
      headers.Authorization = `Bearer ${options.apiKey.trim()}`;
    }
    const res = await fetch(primaryUrl, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return {
        prompt: cleanPrompt,
        imageUrl: primaryUrl,
        model,
        seed,
      };
    }
  } catch {}

  return {
    prompt: cleanPrompt,
    imageUrl: fallbackUrl,
    model: 'flux-free',
    seed,
  };
}

export async function fetchAndReadLiveUrl(
  url: string,
  useGhostFallback = true
): Promise<VerifiedWebLink | null> {
  const normalized = url.startsWith('http') ? url.trim() : `https://${url.trim()}`;
  const domain = extractDomain(normalized);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(normalized, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const html = await res.text();
      const { title, bodyText } = stripHtmlToCleanText(html);
      if (bodyText.length >= 120) {
        return {
          url: normalized,
          title,
          domain,
          snippet: bodyText.slice(0, 240) + '...',
          extractedContent: bodyText,
          verified: true,
          httpStatus: res.status,
          readViaGhost: false,
        };
      }
    }
  } catch {}

  if (useGhostFallback) {
    try {
      const snap = await ghostBrowserController.openUrl(normalized, false);
      if (snap.textContent && snap.textContent.length >= 60) {
        return {
          url: snap.url || normalized,
          title: snap.title || domain,
          domain,
          snippet: snap.textContent.slice(0, 240) + '...',
          extractedContent: snap.textContent,
          verified: true,
          httpStatus: 200,
          readViaGhost: true,
        };
      }
    } catch {}
  }

  return null;
}

export async function searchWebAndVerifyLinks(
  query: string,
  maxLinksToVisit = 3
): Promise<VerifiedWebLink[]> {
  const candidateUrls: Array<{ url: string; fallbackTitle: string; fallbackSnippet: string }> = [];

  // 1. DuckDuckGo Lite Search
  try {
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(ddgUrl, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const html = await res.text();
      const linkRegex = /<a[^>]+class=['"]result-link['"][^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRegex.exec(html)) !== null && candidateUrls.length < 6) {
        let rawHref = m[1];
        if (rawHref.includes('uddg=')) {
          const decoded = decodeURIComponent(rawHref.split('uddg=')[1].split('&')[0]);
          rawHref = decoded;
        }
        const cleanTitle = m[2].replace(/<[^>]+>/g, '').trim();
        if (rawHref.startsWith('http') && !rawHref.includes('duckduckgo.com')) {
          candidateUrls.push({
            url: rawHref,
            fallbackTitle: cleanTitle || extractDomain(rawHref),
            fallbackSnippet: '',
          });
        }
      }
    }
  } catch {}

  // 2. Wikipedia OpenSearch Fallback if needed
  if (candidateUrls.length < 2) {
    try {
      const wikiApi = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        query
      )}&limit=3&format=json&origin=*`;
      const res = await fetch(wikiApi, { headers: BROWSER_HEADERS });
      if (res.ok) {
        const data = await res.json();
        const titles: string[] = data[1] || [];
        const urls: string[] = data[3] || [];
        for (let i = 0; i < urls.length; i++) {
          if (urls[i] && !candidateUrls.some((c) => c.url === urls[i])) {
            candidateUrls.push({
              url: urls[i],
              fallbackTitle: titles[i] || extractDomain(urls[i]),
              fallbackSnippet: '',
            });
          }
        }
      }
    } catch {}
  }

  // 3. Visit and actually read each candidate link in parallel so zero dead links are ever returned
  const targets = candidateUrls.slice(0, maxLinksToVisit);
  const visited = await Promise.all(
    targets.map(async (item) => {
      const read = await fetchAndReadLiveUrl(item.url, true);
      if (read) {
        if (!read.title || read.title === 'Verified Web Page') {
          read.title = item.fallbackTitle;
        }
        return read;
      }
      return null;
    })
  );

  return visited.filter((v): v is VerifiedWebLink => v !== null);
}

export async function searchRealWebImages(query: string, limit = 6): Promise<WebImageResult[]> {
  const results: WebImageResult[] = [];

  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
    const res = await fetch(commonsUrl, { headers: BROWSER_HEADERS });
    if (res.ok) {
      const json = await res.json();
      const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
      for (const p of pages as any[]) {
        const info = p?.imageinfo?.[0];
        const imgUrl: string = info?.thumburl || info?.url || '';
        const title = String(p?.title || query)
          .replace(/^File:/i, '')
          .replace(/\.[a-zA-Z0-9]+$/, '');
        if (imgUrl && /\.(jpg|jpeg|png|webp)/i.test(imgUrl)) {
          results.push({
            imageUrl: imgUrl,
            title,
            sourceUrl: info?.descriptionurl || imgUrl,
          });
        }
      }
    }
  } catch {}

  if (results.length < 2) {
    try {
      const wpImgApi = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        query
      )}&gsrlimit=${limit}&prop=pageimages&piprop=thumbnail&pithumbsize=640&format=json&origin=*`;
      const res = await fetch(wpImgApi, { headers: BROWSER_HEADERS });
      if (res.ok) {
        const json = await res.json();
        const pages = json?.query?.pages ? Object.values(json.query.pages) : [];
        for (const p of pages as any[]) {
          const thumb = p?.thumbnail?.source;
          if (thumb && !results.some((r) => r.imageUrl === thumb)) {
            results.push({
              imageUrl: thumb,
              title: String(p?.title || query),
              sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p?.title || ''))}`,
            });
          }
        }
      }
    } catch {}
  }

  return results.slice(0, limit);
}

export function extractUrlsFromPrompt(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  return Array.from(new Set(matches.map((u) => u.replace(/[),.;]+$/, ''))));
}
