const clean = (value) => String(value ?? '').trim();
const normalizeId = (value) => clean(value).split(':')[0].toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];

function uniqueIds(values = []) {
  return [...new Set(asArray(values).map((value) => normalizeId(value?.baseId || value)).filter(Boolean))];
}

function normalizedBanners(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function resultDraft(statusInput, options = {}) {
  const status = clean(statusInput).toLowerCase();
  if (!['win','loss'].includes(status)) return Object.freeze({ valid:false, status:'', banners:null, postAttempt:null, error:'Result must be win or loss.' });
  const banners = normalizedBanners(options?.banners);
  if (status === 'win') {
    return Object.freeze({
      valid:true,
      status:'win',
      banners,
      postAttempt:Object.freeze({ defenseState:'cleared', survivorBaseIds:Object.freeze([]) }),
      error:'',
    });
  }
  const mode = clean(options?.lossState).toLowerCase() === 'survivors-confirmed' ? 'survivors-confirmed' : 'unknown';
  const defenseIds = uniqueIds(options?.defenseMembers);
  const survivors = uniqueIds(options?.survivorBaseIds);
  if (mode === 'survivors-confirmed') {
    if (!survivors.length) return Object.freeze({ valid:false, status:'loss', banners, postAttempt:null, error:'Select at least one surviving defender or leave survivor state unknown.' });
    const invalid = survivors.filter((id) => !defenseIds.includes(id));
    if (invalid.length) return Object.freeze({ valid:false, status:'loss', banners, postAttempt:null, error:`Invalid survivors: ${invalid.join(', ')}` });
  }
  return Object.freeze({
    valid:true,
    status:'loss',
    banners,
    postAttempt:Object.freeze({
      defenseState:mode,
      survivorBaseIds:Object.freeze(mode === 'survivors-confirmed' ? survivors : []),
    }),
    error:'',
  });
}

function latestPostAttempt(assignment = {}) {
  const attempts = asArray(assignment?.attemptLog);
  const latest = attempts.length ? attempts[attempts.length - 1] : null;
  if (!latest) return null;
  const status = clean(latest?.status).toLowerCase();
  const post = latest?.postAttempt || {};
  const defenseState = status === 'win' ? 'cleared' : clean(post?.defenseState).toLowerCase() === 'survivors-confirmed' ? 'survivors-confirmed' : 'unknown';
  return Object.freeze({
    status,
    banners: latest?.banners == null ? null : normalizedBanners(latest.banners),
    defenseState,
    survivorBaseIds:Object.freeze(defenseState === 'survivors-confirmed' ? uniqueIds(post?.survivorBaseIds) : []),
    source:clean(post?.source || 'user-confirmed-result'),
    tmState:'unknown',
    healthState:'unknown',
    protectionState:'unknown',
    at:clean(latest?.at),
  });
}

function resultTruthLabel(post = {}) {
  if (!post) return Object.freeze({ code:'none', title:'NO RESULT CAPTURED', detail:'No completed attempt is recorded.' });
  if (post.status === 'win' || post.defenseState === 'cleared') {
    return Object.freeze({ code:'cleared', title:'WIN · DEFENSE CLEARED', detail:'Clear state confirmed by the recorded result.' });
  }
  if (post.defenseState === 'survivors-confirmed') {
    return Object.freeze({ code:'survivors', title:'LOSS · SURVIVORS CONFIRMED', detail:`${post.survivorBaseIds.length} surviving defender${post.survivorBaseIds.length===1?'':'s'} confirmed from the game.` });
  }
  return Object.freeze({ code:'unknown', title:'LOSS · SURVIVOR STATE UNKNOWN', detail:'The loss is recorded, but surviving defenders were not confirmed.' });
}

export {
  latestPostAttempt,
  normalizeId,
  normalizedBanners,
  resultDraft,
  resultTruthLabel,
  uniqueIds,
};
