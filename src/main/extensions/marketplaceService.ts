import https from 'https';

export interface MarketplaceSearchItem {
  identifier: string;
  publisher: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  downloadUrl: string;
  iconUrl: string | null;
  installs: number | null;
  rating: number | null;
  ratingCount: number | null;
}

interface GalleryQueryResponse {
  results?: Array<{
    extensions?: Array<{
      extensionName?: string;
      displayName?: string;
      shortDescription?: string;
      versions?: Array<{
        version?: string;
        files?: Array<{ assetType?: string; source?: string }>;
      }>;
      statistics?: Array<{ statisticName?: string; value?: number }>;
      publisher?: { publisherName?: string };
    }>;
  }>;
}

function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
          'User-Agent': 'NexCode-IDE',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Marketplace request failed (${res.statusCode ?? 0}): ${text}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getStatistic(
  stats: Array<{ statisticName?: string; value?: number }> | undefined,
  key: string,
): number | null {
  const value = stats?.find((s) => s.statisticName === key)?.value;
  return typeof value === 'number' ? value : null;
}

function pickAsset(
  files: Array<{ assetType?: string; source?: string }> | undefined,
  assetType: string,
): string | null {
  return files?.find((f) => f.assetType === assetType)?.source ?? null;
}

export async function searchMarketplaceExtensions(query: string, limit = 20): Promise<MarketplaceSearchItem[]> {
  const normalizedLimit = Math.max(1, Math.min(50, limit));
  const body = {
    filters: [
      {
        criteria: [
          { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
          { filterType: 10, value: query },
        ],
        pageNumber: 1,
        pageSize: normalizedLimit,
        sortBy: 0,
        sortOrder: 0,
      },
    ],
    assetTypes: [
      'Microsoft.VisualStudio.Services.Icons.Default',
      'Microsoft.VisualStudio.Services.VSIXPackage',
    ],
    flags: 914,
  };

  const response = await postJson<GalleryQueryResponse>(
    'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1',
    body,
    {
      Accept: 'application/json;api-version=7.2-preview.1;excludeUrls=true',
      'X-Market-Client-Id': 'NexCodeIDE',
    },
  );

  const extensions = response.results?.[0]?.extensions ?? [];
  return extensions
    .map((ext) => {
      const publisher = ext.publisher?.publisherName ?? '';
      const name = ext.extensionName ?? '';
      const latest = ext.versions?.[0];
      const downloadUrl =
        pickAsset(latest?.files, 'Microsoft.VisualStudio.Services.VSIXPackage') ??
        `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${latest?.version ?? 'latest'}/vspackage`;
      return {
        identifier: `${publisher}.${name}`,
        publisher,
        name,
        displayName: ext.displayName ?? name,
        description: ext.shortDescription ?? '',
        version: latest?.version ?? 'unknown',
        downloadUrl,
        iconUrl: pickAsset(latest?.files, 'Microsoft.VisualStudio.Services.Icons.Default'),
        installs: getStatistic(ext.statistics, 'install'),
        rating: getStatistic(ext.statistics, 'averagerating'),
        ratingCount: getStatistic(ext.statistics, 'ratingcount'),
      } satisfies MarketplaceSearchItem;
    })
    .filter((item) => item.publisher && item.name);
}
