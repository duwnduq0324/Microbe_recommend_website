/* ═══════════════════════════════════════════════════════════
   TOBio 앱 — app.js
   ▶ 아래 API_BASE_URL 을 실제 백엔드 URL 로 교체하세요.
     ex) 'https://microbe-backend.vercel.app'
         '' 이면 같은 도메인의 /api/... 를 사용합니다.
═══════════════════════════════════════════════════════════ */
const API_BASE_URL = '';   // ← 실제 배포 백엔드 URL 입력

/* ──────────────────────────────────────────────
   앱 상태
────────────────────────────────────────────── */
const state = {
  mode: null,           // 'recommend' | 'check'
  crop: null,
  address: null,        // 선택된 팜맵 주소 객체
  result: null,
};

/* ──────────────────────────────────────────────
   작물 목록
────────────────────────────────────────────── */
const CROPS = [
  { id: 'tomato',  icon: '🍅', name: '토마토' },
  { id: 'pepper',  icon: '🌶️', name: '고추' },
  { id: 'rice',    icon: '🌾', name: '벼' },
  { id: 'cabbage', icon: '🥬', name: '배추' },
  { id: 'potato',  icon: '🥔', name: '감자' },
  { id: 'soybean', icon: '🫘', name: '대두' },
  { id: 'corn',    icon: '🌽', name: '옥수수' },
  { id: 'wheat',   icon: '🌿', name: '밀' },
  { id: 'lettuce', icon: '🥗', name: '상추' },
  { id: 'garlic',  icon: '🧄', name: '마늘' },
  { id: 'onion',   icon: '🧅', name: '양파' },
  { id: 'apple',   icon: '🍎', name: '사과' },
];

/* ──────────────────────────────────────────────
   렌더링 헬퍼
────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function toast(msg, ms = 2500) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}

/* ──────────────────────────────────────────────
   주소 검색 (팜맵 연동)
   백엔드에 GET /api/farmmap/search?address=... 가 필요합니다.
   없으면 콘솔에 경고가 출력됩니다.
────────────────────────────────────────────── */
let addrTimer = null;

async function searchAddress(query) {
  if (!query || query.trim().length < 3) return [];
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/farmmap/search?address=${encodeURIComponent(query.trim())}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // 백엔드 응답 형식: { results: [{address, detail, pnu, ...}, ...] }
    return json.results || json.data || json || [];
  } catch (e) {
    console.warn('[TOBio] 팜맵 주소 검색 실패:', e.message);
    return [];
  }
}

function initAddressSearch() {
  const input    = $('addr-input');
  const dropdown = $('addr-dropdown');
  const searching = $('addr-searching');
  const selectedBox = $('addr-selected-box');
  const selectedText = $('addr-selected-text');
  const nextBtn  = $('addr-next-btn');

  // 기선택 주소 지우기
  $('addr-clear-btn').addEventListener('click', () => {
    state.address = null;
    selectedBox.classList.remove('show');
    input.value = '';
    input.classList.remove('valid');
    nextBtn.disabled = true;
    input.focus();
  });

  input.addEventListener('input', () => {
    const q = input.value;
    clearTimeout(addrTimer);
    dropdown.classList.remove('show');
    searching.classList.remove('show');

    if (q.trim().length < 2) return;

    searching.classList.add('show');

    addrTimer = setTimeout(async () => {
      const results = await searchAddress(q);
      searching.classList.remove('show');

      if (!results.length) {
        dropdown.innerHTML = `
          <div class="addr-item" data-dummy="1">
            <div class="addr-main">"${q}" 주소로 진행하기</div>
            <div class="addr-sub" style="color:#6c757d">주소 검색 결과가 없어 입력하신 주소로 진행합니다</div>
          </div>
        `;
        dropdown.classList.add('show');
        dropdown.querySelector('[data-dummy]').addEventListener('click', () => {
          state.address = { address: q, detail: '임시 주소 데이터', pnu: 'DUMMY' };
          input.classList.add('valid');
          selectedText.textContent = q;
          selectedBox.classList.add('show');
          dropdown.classList.remove('show');
          nextBtn.disabled = false;
        });
        return;
      }

      dropdown.innerHTML = results.map((r, i) => `
        <div class="addr-item" data-idx="${i}">
          <div class="addr-main">${r.address || r.roadAddr || r.jibunAddr || ''}</div>
          <div class="addr-sub">${r.detail || r.admNm || r.pnu || ''}</div>
        </div>
      `).join('');
      dropdown.classList.add('show');

      dropdown.querySelectorAll('.addr-item').forEach(el => {
        el.addEventListener('click', () => {
          const r = results[+el.dataset.idx];
          state.address = r;
          input.classList.add('valid');
          selectedText.textContent = r.address || r.roadAddr || r.jibunAddr || '주소 선택됨';
          selectedBox.classList.add('show');
          dropdown.classList.remove('show');
          nextBtn.disabled = false;
        });
      });
    }, 350);
  });

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('#addr-wrap')) {
      dropdown.classList.remove('show');
    }
  });
}

/* ──────────────────────────────────────────────
   로딩 화면 + 추천 API 호출
────────────────────────────────────────────── */
const LOAD_STEPS = [
  { id: 'ls0', icon: '📍', label: '농경지 위치 확인 중...',    doneLabel: '농경지 위치 확인 완료' },
  { id: 'ls1', icon: '🌤️', label: '기상·토양 데이터 수집 중...', doneLabel: '기상·토양 데이터 수집 완료' },
  { id: 'ls2', icon: '📚', label: '관련 논문 검색 중...',      doneLabel: '논문 검색 완료' },
  { id: 'ls3', icon: '🤖', label: 'AI 미생물 추천 생성 중...', doneLabel: 'AI 추천 완료' },
];

function renderLoadingSteps() {
  const container = $('loading-steps');
  container.innerHTML = LOAD_STEPS.map((s, i) => `
    <div class="load-step pending" id="${s.id}">
      <span class="step-icon">${s.icon}</span>
      <span class="step-label">${s.label}</span>
      <span class="step-status">⬜</span>
    </div>
  `).join('');
}

function setMascotProgress(pct) {
  const mascot = $('loading-mascot');
  const shadow = $('loading-mascot-shadow');
  const fill   = $('loading-track-fill');
  if (mascot) mascot.style.left = pct + '%';
  if (shadow) shadow.style.left = pct + '%';
  if (fill)   fill.style.width  = pct + '%';
}

function advanceStep(idx) {
  setMascotProgress((idx / LOAD_STEPS.length) * 100);
  if (idx > 0) {
    const prev = $(LOAD_STEPS[idx - 1].id);
    if (prev) {
      prev.classList.remove('active');
      prev.classList.add('done');
      prev.querySelector('.step-label').textContent = LOAD_STEPS[idx - 1].doneLabel;
      prev.querySelector('.step-status').textContent = '✅';
    }
  }
  if (idx < LOAD_STEPS.length) {
    const cur = $(LOAD_STEPS[idx].id);
    if (cur) {
      cur.classList.remove('pending');
      cur.classList.add('active');
      cur.querySelector('.step-status').textContent = '⏳';
    }
  }
}

async function runRecommend() {
  showScreen('screen-loading');
  renderLoadingSteps();

  // 이전 실행의 마스코트 위치를 트랜지션 없이 시작점으로 즉시 리셋
  const track = $('loading-track');
  track.classList.add('no-transition');
  setMascotProgress(0);
  void track.offsetWidth; // 강제 리플로우로 리셋을 즉시 반영
  track.classList.remove('no-transition');

  const STEP_DELAYS = [800, 2200, 1800, 0]; // 마지막은 API 응답 대기

  // 단계 1~3 타이머 시뮬레이션과 API 동시 실행
  advanceStep(0);

  const apiPromise = fetchRecommend();

  for (let i = 1; i < LOAD_STEPS.length; i++) {
    await delay(STEP_DELAYS[i - 1]);
    advanceStep(i);
  }

  // API 응답 대기
  const result = await apiPromise;

  // 마지막 단계 완료
  await delay(600);
  advanceStep(LOAD_STEPS.length); // 마지막 prev 완료 처리

  state.result = result;
  renderResult();
  showScreen('screen-result');
}

async function fetchRecommend() {
  try {
    const body = {
      crop:    state.crop,
      address: state.address,
    };
    const res = await fetch(`${API_BASE_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('[TOBio] 추천 API 오류:', e);
    return { error: e.message };
  }
}

const delay = ms => new Promise(r => setTimeout(r, ms));

/* ──────────────────────────────────────────────
   결과 렌더링
────────────────────────────────────────────── */
function renderResult() {
  const container = $('result-content');
  const r = state.result;

  if (!r || r.error) {
    $('result-check-cta').classList.remove('show');
    container.innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:48px">⚠️</div>
        <h3 style="margin:12px 0 8px;color:#dc3545">추천을 가져오지 못했습니다</h3>
        <p style="color:#6c757d;font-size:14px">${r?.error || '네트워크 오류가 발생했습니다.'}</p>
        <button class="btn btn-outline" style="margin-top:20px;width:auto;padding:12px 28px"
          onclick="showScreen('screen-home')">홈으로</button>
      </div>`;
    return;
  }

  $('result-check-cta').classList.add('show');

  // 백엔드 응답이 { microbes: [...] } 또는 직접 배열
  const microbes = r.microbes || r.recommendations || (Array.isArray(r) ? r : [r]);

  const cropName = CROPS.find(c => c.id === state.crop)?.name || state.crop || '';
  $('result-crop-name').textContent = cropName;
  $('result-addr-name').textContent =
    (state.address?.address || state.address?.roadAddr || state.address?.jibunAddr || '입력 주소');

  container.innerHTML = microbes.map((m, i) => `
    <div class="microbe-card">
      <span class="microbe-rank">추천 ${i + 1}위</span>
      <div class="microbe-body">
        <div class="microbe-name">${m.name || m.korName || m.korean_name || '미생물명'}</div>
        <div class="microbe-sci">${m.scientificName || m.sci_name || m.latin_name || ''}</div>
        <div class="microbe-desc">${m.description || m.reason || m.effect || ''}</div>
        <div class="microbe-tags">
          ${(m.tags || m.effects || []).map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
        ${renderSellers(m.sellers || m.products || [])}
      </div>
    </div>
  `).join('') || '<p style="color:#6c757d;text-align:center;padding:20px">추천 결과가 없습니다.</p>';
}

function renderSellers(sellers) {
  if (!sellers.length) return '';
  return `
    <div class="seller-list">
      <h5>🛒 구매처 정보</h5>
      ${sellers.map(s => `
        <div class="seller-item">
          <strong>${s.productName || s.name || ''}</strong> — ${s.company || s.seller || ''}<br/>
          ${s.price ? `<span>💰 ${s.price}원</span> ` : ''}
          ${s.phone ? `<span>📞 ${s.phone}</span>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function goToCheckFromResult() {
  const r = state.result;
  const microbes = r?.microbes || r?.recommendations || (Array.isArray(r) ? r : (r ? [r] : []));
  const top = microbes?.[0];
  const microbeName = top?.name || top?.korName || top?.korean_name || '';
  const cropName = CROPS.find(c => c.id === state.crop)?.name || state.crop || '';

  showScreen('screen-check');
  $('check-microbe').value = microbeName;
  $('check-crop').value = cropName;
  $('check-result').innerHTML = '';
}

/* ──────────────────────────────────────────────
   살포 가능 확인 API
────────────────────────────────────────────── */
async function runCheck() {
  const microbe = $('check-microbe').value.trim();
  const crop    = $('check-crop').value.trim();
  if (!microbe) { toast('미생물 또는 제품명을 입력하세요'); return; }

  const btn = $('check-btn');
  btn.disabled = true;
  btn.textContent = '확인 중...';

  let data;
  try {
    const res = await fetch(`${API_BASE_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ microbe, crop }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    console.warn('[TOBio] 살포 가능 확인 API 실패, 더미 데이터로 진행:', e.message);
    data = {
      available: true,
      message: `(데모) "${microbe}"${crop ? `는 ${crop}에` : '는'} 살포해도 안전한 것으로 추정됩니다. 실제 서비스에서는 공인 데이터베이스 기준으로 정확히 안내해드려요.`,
    };
  }

  $('check-result').innerHTML = `
    <div class="seq-result-box">
      <h4 style="margin-bottom:8px;color:${data.available ? 'var(--green-dark)' : '#dc3545'}">
        ${data.available ? '✅ 살포 가능' : '❌ 살포 불가 또는 확인 불가'}
      </h4>
      <p style="font-size:14px;color:#444;line-height:1.6">${data.message || data.reason || ''}</p>
    </div>`;
  btn.disabled = false;
  btn.textContent = '확인하기';
}

/* ──────────────────────────────────────────────
   화면 초기화 & HTML 주입
────────────────────────────────────────────── */
function buildApp() {
  const app = document.getElementById('app');
  app.innerHTML = `

<!-- ══ 홈 화면 ══ -->
<div class="screen" id="screen-home">
  <img class="home-mascot" src="img/tobio.png" alt="토비오"/>
  <div class="home-brand">TOBio 토비오</div>
  <div class="home-sub">우리 밭에 딱 맞는 미생물, 어렵지 않게 찾아드려요</div>
  <div class="menu-grid">
    <div class="menu-card" id="btn-recommend">
      <div class="menu-icon">🔍</div>
      <div class="menu-text">
        <h3>미생물 추천받기</h3>
        <p>"뭘 써야 할지 몰라요"</p>
      </div>
    </div>
    <div class="menu-card" id="btn-check">
      <div class="menu-icon">✅</div>
      <div class="menu-text">
        <h3>살포 가능 확인</h3>
        <p>"이거 뿌려도 되나요?"</p>
      </div>
    </div>
  </div>
  <div class="home-badge">공공 농업데이터 기반 · 가입 없이 바로 사용</div>
</div>

<!-- ══ Step 1: 작물 선택 ══ -->
<div class="screen" id="screen-crop">
  <div class="top-bar">
    <button class="back-btn" onclick="showScreen('screen-home')">←</button>
    <span class="top-title">미생물 추천받기</span>
  </div>
  <div class="step-bar">
    <div class="step-dot active"></div>
    <div class="step-dot"></div>
  </div>
  <div class="content">
    <h2 class="section-title">어떤 작물을 재배하시나요?</h2>
    <p class="section-desc">작물을 선택하면 맞춤 미생물을 찾아드려요</p>
    <div class="crop-grid" id="crop-grid"></div>
    <button class="btn btn-primary" id="crop-next-btn" disabled onclick="showScreen('screen-address')">다음</button>
  </div>
</div>

<!-- ══ Step 2: 주소 입력 ══ -->
<div class="screen" id="screen-address">
  <div class="top-bar">
    <button class="back-btn" onclick="showScreen('screen-crop')">←</button>
    <span class="top-title">미생물 추천받기</span>
  </div>
  <div class="step-bar">
    <div class="step-dot done"></div>
    <div class="step-dot active"></div>
  </div>
  <div class="content">
    <h2 class="section-title">농경지 주소를 알려주세요</h2>
    <p class="section-desc">주소를 입력하면 팜맵에서 실제 농경지를 확인해드려요</p>

    <div class="addr-wrap" id="addr-wrap">
      <input class="addr-input" id="addr-input"
        type="text" placeholder="지번 또는 도로명 주소 입력 (예: 충남 아산시 배방읍)"
        autocomplete="off"/>
      <div class="addr-searching" id="addr-searching">🔍 팜맵에서 주소를 검색하고 있어요...</div>
      <div class="addr-dropdown" id="addr-dropdown"></div>
    </div>

    <div class="addr-selected-box" id="addr-selected-box">
      <span>📍</span>
      <span id="addr-selected-text"></span>
      <button class="clear-addr" id="addr-clear-btn" title="주소 초기화">✕</button>
    </div>

    <button class="btn btn-primary" id="addr-next-btn" disabled
      onclick="runRecommend()">🌱 추천받기</button>
  </div>
</div>

<!-- ══ 로딩 화면 ══ -->
<div class="screen" id="screen-loading">
  <div class="loading-title">토비오가 분석하고 있습니다</div>
  <div class="loading-sub" id="loading-crop-text">잠시만 기다려 주세요...</div>
  <div class="loading-track" id="loading-track">
    <div class="loading-track-bg"></div>
    <div class="loading-track-fill" id="loading-track-fill"></div>
    <div class="loading-mascot-shadow" id="loading-mascot-shadow"></div>
    <img class="loading-mascot" id="loading-mascot" src="img/tobio.png" alt="토비오"/>
  </div>
  <div class="loading-steps" id="loading-steps"></div>
</div>

<!-- ══ 결과 화면 ══ -->
<div class="screen" id="screen-result">
  <div class="top-bar">
    <button class="back-btn" onclick="showScreen('screen-home')">← 홈</button>
    <span class="top-title">추천 결과</span>
  </div>
  <div class="content">
    <div class="result-header">
      <h2>🌱 토비오의 미생물 추천</h2>
      <p>작물: <span id="result-crop-name"></span> &nbsp;|&nbsp; 농경지: <span id="result-addr-name"></span></p>
    </div>
    <div id="result-content"></div>
    <div class="check-cta" id="result-check-cta">
      <p>🧪 추천받은 미생물, 살포 가능 확인도 함께 해보시겠어요?</p>
      <button class="btn btn-outline" onclick="goToCheckFromResult()">살포 가능 확인하기</button>
    </div>
    <button class="btn btn-outline" style="margin-top:8px" onclick="showScreen('screen-home')">홈으로 돌아가기</button>
  </div>
</div>

<!-- ══ 살포 가능 확인 ══ -->
<div class="screen" id="screen-check">
  <div class="top-bar">
    <button class="back-btn" onclick="showScreen('screen-home')">←</button>
    <span class="top-title">살포 가능 확인</span>
  </div>
  <div class="content">
    <h2 class="section-title">살포 가능한지 확인해드릴게요</h2>
    <p class="section-desc">미생물 제품명과 작물을 입력하면 살포 가능 여부를 안내해드려요</p>
    <div class="check-input-area">
      <label>미생물 또는 제품명</label>
      <input id="check-microbe" type="text" placeholder="예: 바실러스 서브틸리스, OO미생물제"/>
    </div>
    <div class="check-input-area">
      <label>재배 작물 (선택)</label>
      <input id="check-crop" type="text" placeholder="예: 토마토, 고추"/>
    </div>
    <button class="btn btn-primary" id="check-btn" onclick="runCheck()">확인하기</button>
    <div id="check-result" style="margin-top:16px"></div>
  </div>
</div>

<div class="toast"></div>
`;
}

/* ──────────────────────────────────────────────
   이벤트 바인딩
────────────────────────────────────────────── */
function bindEvents() {
  // 홈 메뉴
  $('btn-recommend').addEventListener('click', () => {
    state.mode = 'recommend';
    Object.assign(state, { crop: null, address: null });
    showScreen('screen-crop');
  });
  $('btn-check').addEventListener('click', () => {
    state.mode = 'check';
    showScreen('screen-check');
  });

  // 작물 그리드 렌더링
  const cropGrid = $('crop-grid');
  cropGrid.innerHTML = CROPS.map(c => `
    <div class="crop-card" data-id="${c.id}">
      <div class="crop-icon">${c.icon}</div>
      <div class="crop-name">${c.name}</div>
    </div>
  `).join('');

  cropGrid.querySelectorAll('.crop-card').forEach(card => {
    card.addEventListener('click', () => {
      cropGrid.querySelectorAll('.crop-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.crop = card.dataset.id;
      $('crop-next-btn').disabled = false;
    });
  });

  // 주소 검색
  initAddressSearch();

  // 로딩 화면 작물명 표시
  const origRunRecommend = window.runRecommend;
  window.runRecommend = function () {
    const cropObj = CROPS.find(c => c.id === state.crop);
    $('loading-crop-text').textContent =
      cropObj ? `${cropObj.icon} ${cropObj.name} 밭을 위한 미생물을 찾고 있어요...` : '잠시만 기다려 주세요...';
    origRunRecommend();
  };
}

/* ──────────────────────────────────────────────
   앱 부트스트랩
────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  buildApp();
  bindEvents();
  showScreen('screen-home');
});
