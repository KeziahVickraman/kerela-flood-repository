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

export async function generateSearchQueryWithGemini(situation: string): Promise<string> {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Situation from a flood-relief NGO in Kerala, India:\n"${situation}"\n\nReturn ONE concise NewsData.io search query string (at most 100 characters) joining key terms with OR so it retrieves recent headlines about floods, landslides, heavy rain, or road closures in Kerala.`,
      config: {
        systemInstruction:
          'Return structured JSON matching {"query": string}. Keep query <= 100 characters, joining terms with OR (e.g. "Kerala flood OR landslide OR monsoon OR road closure").',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description:
                'Single NewsData search query string of at most 100 characters joining terms with OR.',
            },
          },
          required: ['query'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as { query?: string };
    const candidate = truncateQuery(parsed.query ?? '');
    if (!candidate) {
      throw new Error('Gemini returned an empty search query.');
    }
    return candidate.slice(0, 100);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini query generation failed.';
    throw new ApiError(502, 'gemini_error', `Gemini step A failed: ${message}`);
  }
}

export async function rankDistrictsWithGemini(
  situation: string,
  articles: NormalizedArticle[]
) {
  const ai = getGeminiClient();
  const validArticleIds = new Set(articles.map((a) => a.id));

  const compactArticles = articles.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description ?? '',
    sourceName: a.sourceName,
    pubDate: a.pubDate ?? '',
  }));

  const prompt = `NGO Situation: "${situation}"

Returned NewsData articles (ONLY use these exact article IDs):
${compactArticles.length > 0 ? JSON.stringify(compactArticles, null, 2) : '[]'}

Rank all 14 districts of Kerala (${KERALA_DISTRICTS.join(', ')}) for relief supply runs this week:
- "high": Direct reports of flooding, landslides, red/orange alerts, submerged roads, or evacuations in that district.
- "medium": Heavy rain alerts, rising river/dam levels, or nearby disruptions affecting that district.
- "low": Mentioned with minor rain or normal precautions without acute disruption.
- "no signal": No returned article provides evidence for that district. Never guess or fabricate evidence.

Rules:
1. Return an entry for all 14 Kerala districts.
2. In "articleIds", cite ONLY exact "id" values from the provided articles list (empty array if "no signal").
3. Always include caveats noting that the data is about 12 hours old and headline-only (no full article text).`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction:
          'You are a careful humanitarian logistics planner. Rely strictly on the provided article IDs and headlines. Mark districts with no evidence as "no signal".',
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

    const byName = new Map(
      (parsed.districts ?? []).map((d) => [(d.name ?? '').trim().toLowerCase(), d])
    );

    const districts = KERALA_DISTRICTS.map((districtName) => {
      const match = byName.get(districtName.toLowerCase());
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
    });

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
