export interface BraveSearchResult {
  web: {
    results: Array<{
      title: string;
      description: string;
    }>;
  }
}

export interface BraveSearchConfig {
  maxResults?: number;
}

export type SearchResultData = {
  title: string;
  description: string;
  url?: string;
}

export async function brave_web_search(
  query: string, 
  config: BraveSearchConfig = {}
): Promise<SearchResultData[]> {
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY
  if (!BRAVE_API_KEY) {
    throw new Error('BRAVE_API_KEY not found in environment variables')
  }

  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'X-Subscription-Token': BRAVE_API_KEY,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.statusText}`)
    }

    const data = await response.json() as BraveSearchResult
    return data.web.results.map(result => ({
      title: result.title,
      description: result.description
    })).slice(0, config.maxResults)
  } catch (error: unknown) {
    console.error('Brave search error:', error instanceof Error ? error.message : 'Unknown error')
    return []
  }
}