const MATCHUP_PATH = /^\/api\/gac\/matchup\/(\d{9})(?:\?.*)?$/;

function clean(value) { return String(value ?? '').trim(); }
function allyCode(value) { return clean(value).replace(/\D/g, '').slice(0, 9); }

function normalizeMatchup(body = {}, owner = '') {
  const opponent = body?.matchup?.opponent || body?.currentOpponent || body?.opponent || body?.event?.opponent || null;
  const opponentCode = allyCode(opponent?.allyCode || opponent?.ally_code);
  const round = Number(body?.event?.round || body?.opponentResolution?.round || 0);
  return {
    ...body,
    source: clean(body?.source || 'bracket-soft-matchup'),
    matchup: {
      ...(body?.matchup || {}),
      me: body?.matchup?.me || { allyCode: owner },
      opponent: opponentCode ? { ...opponent, allyCode: opponentCode } : null,
    },
    currentOpponent: opponentCode ? { ...opponent, allyCode: opponentCode } : null,
    event: { ...(body?.event || {}), ...(round ? { round } : {}) },
    defense: body?.defense || { mine: [], opponent: [], visibility: 'manual-required' },
    format: body?.format || body?.event?.format || '5v5',
    opponentResolution: {
      ...(body?.opponentResolution || {}),
      exact: body?.opponentResolution?.exact === true && Boolean(opponentCode),
    },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function installGacMatchupSoftSource() {
  if (typeof window === 'undefined' || window.__gacMatchupSoftSourceInstalled) return;
  window.__gacMatchupSoftSourceInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function gacSoftFetch(input, init) {
    const raw = typeof input === 'string' ? input : input?.url;
    if (!raw) return nativeFetch(input, init);
    let url;
    try { url = new URL(raw, location.origin); } catch { return nativeFetch(input, init); }
    if (url.origin !== location.origin) return nativeFetch(input, init);
    const match = `${url.pathname}${url.search}`.match(MATCHUP_PATH);
    if (!match) return nativeFetch(input, init);

    const owner = match[1];
    try {
      const bracketResponse = await nativeFetch(`/api/gac/bracket/by-player/${owner}?refresh=1`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const bracket = await bracketResponse.json().catch(() => ({}));
      if (bracketResponse.ok) return jsonResponse(normalizeMatchup(bracket, owner));
    } catch {}

    return jsonResponse(normalizeMatchup({
      source: 'manual-matchup-required',
      opponentResolution: { exact: false, method: 'manual-required' },
    }, owner));
  };
}

if (typeof window !== 'undefined') installGacMatchupSoftSource();

export { installGacMatchupSoftSource, normalizeMatchup };
