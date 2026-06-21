// functions/api/fred-data.js
//
// Cloudflare Pages Function. 미국 세인트루이스 연방준비은행(FRED)의 공식
// 통계 API를 호출해 금리·유가·신용스프레드·유동성 지표를 가져옵니다.
// Anthropic API를 전혀 사용하지 않습니다 — 대시보드의 "FRED 공식 데이터 갱신"
// 버튼이 이 함수(/api/fred-data)를 호출합니다.
//
// 필요한 환경변수 (Cloudflare 대시보드 > Workers & Pages > 해당 프로젝트 >
// Settings > Environment variables):
//   FRED_API_KEY = (https://fredaccount.stlouisfed.org/apikeys 에서 무료 발급,
//                   가입 즉시 발급되며 결제수단 등록이 필요 없습니다)
//
// 참고: FRED는 정부(연준) 공식 1차 데이터이지만, 시리즈에 따라 발표 주기가
// 다릅니다. 국채금리·유가·스프레드는 거래일 기준 D+0~D+1, M2/연준 대차대조표/
// TGA는 주간·월간 발표라서 "실시간 시세"는 아니고 "가장 최근 공식 발표치"
// 입니다. 달러인덱스(DXY)·원달러환율·공포탐욕지수·쉴러PER은 FRED에 없거나
// 공식 무료 API가 없어서 이 함수에서 다루지 않고 수동 입력으로 남겨둡니다.

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

// 시리즈별 단위 보정 — FRED 원자료 단위를 대시보드 표시 단위에 맞춥니다.
// WALCL·WTREGEN(TGA)은 FRED가 "백만 달러" 단위라서 100으로 나눠 "억 달러" 단위로 맞춥니다.
// M2SL·RRPONTSYD는 FRED가 이미 "십억 달러" 단위라 그대로 사용합니다.
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
  // chg(변화율)는 배율을 곱해도 동일한 비율이므로 원본값으로 계산
  const chg = (prevRaw != null && prevRaw !== 0 && !isNaN(prevRaw)) ? (parseFloat(obs[0].value) - prevRaw) / prevRaw : null;

  return { value: latest, chg, date: obs[0].date };
}

// Cloudflare Pages Functions 규칙: GET 요청 핸들러는 onRequestGet으로 export.
// 환경변수는 process.env가 아니라 context.env로 들어옵니다.
export async function onRequestGet(context) {
  const apiKey = context.env.FRED_API_KEY;
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
