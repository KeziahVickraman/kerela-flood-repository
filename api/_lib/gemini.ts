import { GoogleGenAI, Type } from '@google/genai';
import {
  GEMINI_MODEL,
  KERALA_DISTRICTS,
  REQUIRED_CAVEATS,
  type DistrictPriority,
  type NormalizedArticle,
} from './data.ts';
import { ApiError } from './errors.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiError(
      500,
      'gemini_error',
      'GEMINI_API_KEY is not configured on the server.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function truncateQuery(raw: string): string {
  const cleaned = raw.replace(/[\r\n"`]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 100) return cleaned;
  const sliced = cleaned.slice(0, 100);
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = lastSpace > 40 ? sliced.slice(0, lastSpace).trim() : sliced.trim();
  return trimmed.replace(/\b(OR|AND|NOT)$/i, '').trim().slice(0, 100);
}

function ensureAnchoredToRegion(query: string, region: string): string {
  const cleanRegion = region.trim() || 'Kerala';
  const normalized = query.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hasRegion = new RegExp(`\\b${cleanRegion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
    normalized
  );

  if (hasRegion && normalized.length <= 100) {
    return normalized;
  }

  const candidate = hasRegion
    ? normalized
    : `${cleanRegion} AND (${normalized.replace(/^\(|\)$/g, '')})`;

  if (candidate.length <= 100) {
    return candidate;
  }

  // Safely fall back to anchored form within 100 chars without leaving dangling parentheses
  const defaultTerms = 'flood OR landslide OR rain OR road';
  const anchored = `${cleanRegion} AND (${defaultTerms})`;
  if (anchored.length <= 100) return anchored;
  return truncateQuery(`${cleanRegion} flood OR rain`);
}

export async function generateSearchQueryWithGemini(
  situation: string,
  region: string = 'Kerala'
): Promise<string> {
  const cleanRegion = region.trim() || 'Kerala';
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Target region: "${cleanRegion}" (India)
Situation from a flood-relief NGO:
"${situation}"

Return ONE concise NewsData.io search query string (at most 100 characters) that MUST anchor every match to "${cleanRegion}", for example:
${cleanRegion} AND (flood OR landslide OR rain OR "road closed")`,
      config: {
        systemInstruction: `Return structured JSON matching {"query": string}. The query MUST be anchored to "${cleanRegion}" (e.g. "${cleanRegion} AND (flood OR landslide OR rain OR road)") and MUST be <= 100 characters total.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: `Anchored NewsData search query starting with ${cleanRegion} AND (...) of at most 100 characters.`,
            },
          },
          required: ['query'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as { query?: string };
    const rawCandidate = (parsed.query ?? '').trim();
    if (!rawCandidate) {
      throw new Error('Gemini returned an empty search query.');
    }
    return ensureAnchoredToRegion(rawCandidate, cleanRegion);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini query generation failed.';
    throw new ApiError(502, 'gemini_error', `Gemini step A failed: ${message}`);
  }
}

export async function rankDistrictsWithGemini(
  situation: string,
  articles: NormalizedArticle[],
  region: string = 'Kerala'
) {
  const cleanRegion = region.trim() || 'Kerala';
  const isKerala = cleanRegion.toLowerCase() === 'kerala';
  const ai = getGeminiClient();
  const validArticleIds = new Set(articles.map((a) => a.id));

  const compactArticles = articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description ?? '',
    language: a.language ?? 'unknown',
    sourceName: a.sourceName,
    pubDate: a.pubDate ?? '',
  }));

  const districtInstruction = isKerala
    ? `Rank all 14 districts of Kerala (${KERALA_DISTRICTS.join(', ')}) for relief supply runs this week.`
    : `Identify and rank up to 14 key districts or cities in "${cleanRegion}" mentioned in the headlines for relief supply runs this week (if none are mentioned, return major districts of "${cleanRegion}" marked "no signal").`;

  const prompt = `Target region: "${cleanRegion}"
NGO Situation: "${situation}"

Returned NewsData articles (some headlines and descriptions are in Malayalam — translate them internally into English before judging district relevance; ONLY cite these exact article IDs):
${compactArticles.length > 0 ? JSON.stringify(compactArticles, null, 2) : '[]'}

${districtInstruction}
Priority rubric:
- "high": Direct reports of flooding, landslides, red/orange alerts, submerged roads, or evacuations in that district.
- "medium": Heavy rain alerts, rising river/dam levels, or nearby disruptions affecting that district.
- "low": Mentioned with minor rain or normal precautions without acute disruption.
- "no signal": No returned article provides evidence for that district. Never guess or fabricate evidence.

Rules:
1. ${isKerala ? 'Return an entry for all 14 Kerala districts.' : `Return entries for districts in ${cleanRegion}.`}
2. In "articleIds", cite ONLY exact "id" values from the provided articles list (empty array if "no signal").
3. Translate any Malayalam ("ml" / "malayalam") headlines internally before matching districts and summarize the "reason" clearly in English.
4. Always include caveats noting that the data is about 12 hours old and headline-only (no full article text).`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'You are a careful humanitarian logistics planner fluent in English and Malayalam. Translate Malayalam headlines internally before judging, rely strictly on the provided article IDs, and mark districts with no evidence as "no signal".',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            districts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  priority: {
                    type: Type.STRING,
                    enum: ['high', 'medium', 'low', 'no signal'],
                  },
                  reason: { type: Type.STRING },
                  articleIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['name', 'priority', 'reason', 'articleIds'],
              },
            },
            caveats: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['districts', 'caveats'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      districts?: Array<{
        name?: string;
        priority?: DistrictPriority;
        reason?: string;
        articleIds?: string[];
      }>;
      caveats?: string[];
    };

    const normalizeDistrictEntry = (
      districtName: string,
      match?: {
        name?: string;
        priority?: DistrictPriority;
        reason?: string;
        articleIds?: string[];
      }
    ) => {
      const validIds = Array.from(
        new Set(
          (match?.articleIds ?? []).filter(
            (id): id is string => typeof id === 'string' && validArticleIds.has(id)
          )
        )
      );

      let priority: DistrictPriority =
        match?.priority && ['high', 'medium', 'low', 'no signal'].includes(match.priority)
          ? match.priority
          : 'no signal';

      if (validIds.length === 0 && priority !== 'no signal') {
        priority = 'no signal';
      }

      const reason =
        priority === 'no signal' && validIds.length === 0
          ? match?.reason?.trim() || 'No returned headlines mentioned this district.'
          : match?.reason?.trim() || 'Referenced in recent monsoon headlines.';

      return {
        name: districtName,
        priority,
        reason,
        articleIds: validIds,
      };
    };

    const byName = new Map(
      (parsed.districts ?? []).map((d) => [(d.name ?? '').trim().toLowerCase(), d])
    );

    const districts = isKerala
      ? KERALA_DISTRICTS.map((districtName) =>
          normalizeDistrictEntry(districtName, byName.get(districtName.toLowerCase()))
        )
      : (parsed.districts ?? [])
          .filter((d) => typeof d.name === 'string' && d.name.trim().length > 0)
          .slice(0, 14)
          .map((d) => normalizeDistrictEntry(d.name!.trim(), d));

    const rawCaveats = Array.isArray(parsed.caveats)
      ? parsed.caveats.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];

    const hasDelayCaveat = rawCaveats.some((c) => /12\s*hour|delay/i.test(c));
    const hasHeadlineCaveat = rawCaveats.some((c) => /headline|full\s*text/i.test(c));
    const caveats = [...rawCaveats];
    if (!hasDelayCaveat) caveats.unshift(REQUIRED_CAVEATS[0]);
    if (!hasHeadlineCaveat) caveats.push(REQUIRED_CAVEATS[1]);

    return { districts, caveats };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini district ranking failed.';
    throw new ApiError(502, 'gemini_error', `Gemini step C failed: ${message}`);
  }
}
