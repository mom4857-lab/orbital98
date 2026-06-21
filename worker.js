// worker.js
//
// 이 프로젝트는 "Pages"가 아니라 진짜 Cloudflare Worker(빌드 명령: npx wrangler
// deploy)로 설정되어 있습니다. 그래서 functions/api/fred-data.js 같은 Pages
// Functions 방식 대신, 이 파일 하나가 두 가지 역할을 모두 합니다.
//   1) /api/fred-data 로 들어오는 요청 -> FRED 공식 API 호출 (기존 로직과 동일)
//   2) 그 외 모든 요청 -> wrangler.toml에 설정된 정적 파일(index.html 등)을 그대로 서빙
//
// 필요한 환경변수 (Cloudflare 대시보드 > Workers & Pages > 해당 프로젝트 >
// Settings > Variables and secrets):
//   FRED_API_KEY = (https://fredaccount.stlouisfed.org/apikeys 에서 무료 발급)

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// 대시보드 키 -> FRED 시리즈 ID
const SERIES = {
  base_rate: 'DFEDTARU',     // 연방기금금리 목표 상단
  dgs2:      'DGS2',         // 2년물 국채금리
  dgs10:     'DGS10',        // 10년물 국채금리
  dgs30:     'DGS30',        // 30년물 국채금리
  t10y2y:    'T10Y2Y',       // 10년-2년 금리차
  wti:       'DCOILWTICO',   // WTI 유가
  brent:     'DCOILBRENTEU', // 브렌트 유가
  hyspread:  'BAMLH0A0HYM2', // ICE BofA 美 하이일드 OAS 스프레드
  m2:        'M2SL',         // M2 통화량 (월간, 계절조정)
  walcl:     'WALCL',        // 연준 대차대조표 총자산 (주간)
  tga:       'WTREGEN',      // 재무부 일반계정(TGA) 잔고
  rrp:       'RRPONTSYD',    // 익일 역레포(ON RRP)
};

// 시리즈별 단위 보정 — WALCL·WTREGEN(TGA)은 FRED가 "백만 달러" 단위라서
// 100으로 나눠 "억 달러" 단위로 맞춥니다. M2SL·RRPONTSYD는 이미 "십억 달러" 단위.
const SCALE = { walcl: 0.01, tga: 0.01 };

async function fetchSeries(seriesId, apiKey, scaleKey) {
  // limit=15: 공휴일/결측치("." 값)가 여러 날 이어져도 최신 유효값 2개를 확보하기 위한 여유분
  const url = `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=15`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FRED ${seriesId} HTTP ${r.status}`);
  const data = await r.json();
  const obs = (data.observations || []).filter(o => o && o.value !== '.' && o.value != null);
  if (!obs.length) throw new Error(`FRED ${seriesId}: no valid observations`);

  const scale = SCALE[scaleKey] || 1;
  const latest = parseFloat(obs[0].value) * scale;
  const prevRaw = obs[1] ? parseFloat(obs[1].value) : null;
  const chg = (prevRaw != null && prevRaw !== 0 && !isNaN(prevRaw)) ? (parseFloat(obs[0].value) - prevRaw) / prevRaw : null;

  return { value: latest, chg, date: obs[0].date };
}

async function handleFredData(env) {
  const apiKey = env.FRED_API_KEY;
  const jsonHeaders = { 'Content-Type': 'application/json' };

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'FRED_API_KEY가 Cloudflare 환경변수에 설정되어 있지 않습니다.' }),
      { status: 500, headers: jsonHeaders }
    );
  }

  const entries = Object.entries(SERIES);
  const settled = await Promise.allSettled(
    entries.map(([key, seriesId]) => fetchSeries(seriesId, apiKey, key).then(r => [key, r]))
  );

  const data = {};
  const errors = [];
  settled.forEach((res, idx) => {
    const [key] = entries[idx];
    if (res.status === 'fulfilled') {
      data[key] = res.value[1];
    } else {
      errors.push({ key, error: String(res.reason && res.reason.message || res.reason) });
    }
  });

  return new Response(
    JSON.stringify({ data, errors, fetchedAt: new Date().toISOString() }),
    { status: 200, headers: jsonHeaders }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/fred-data') {
      return handleFredData(env);
    }

    // 그 외 요청은 전부 정적 파일(index.html 등)로 넘깁니다.
    return env.ASSETS.fetch(request);
  },
};
