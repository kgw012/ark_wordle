// 아크워들 (ArkWordle) 메인 애플리케이션 로직

// ============================================================================
// 1. <ark-card> Web Component (Shadow DOM)
// https://ssimeonoff.github.io/ark-nova 의 공식 영문 스프라이트 카드를
// 격리된 Shadow DOM 내부에서 로드하고 원하는 크기로 스케일링합니다.
// ============================================================================
class ArkCardElement extends HTMLElement {
  static get observedAttributes() {
    return ['card-id', 'width'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this.render();
    }
  }

  render() {
    const cardId = Number(this.getAttribute('card-id'));
    const targetWidth = Number(this.getAttribute('width') || 220);
    const card = ANIMAL_CARDS.find((c) => c.id === cardId);

    if (!card) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    // 기본 카드 비율 (약 235 x 329)
    const defaultNatW = 235;
    const defaultNatH = 329;
    const initialScale = targetWidth / defaultNatW;
    const initialHeight = Math.round(defaultNatH * initialScale);

    // #561 카피바라 등 스프라이트가 없는 경우 폴백 렌더링
    if (!card.spriteClass) {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-block;
            width: ${targetWidth}px;
            height: ${initialHeight}px;
            border-radius: 8px;
            overflow: hidden;
            background: linear-gradient(145deg, #1e293b, #0f172a);
            border: 1px solid #475569;
            color: #f8fafc;
            font-family: sans-serif;
          }
          .fallback {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 8px;
            text-align: center;
            box-sizing: border-box;
          }
          .num { color: #38bdf8; font-weight: 800; font-size: 12px; }
          .ko { font-weight: 800; font-size: 14px; margin-top: 4px; }
          .en { color: #94a3b8; font-size: 11px; margin-top: 2px; }
        </style>
        <div class="fallback">
          <div class="num">#${card.id}</div>
          <div class="ko">${card.nameKo}</div>
          <div class="en">${card.nameEn}</div>
        </div>
      `;
      return;
    }

    this.shadowRoot.innerHTML = `
      <link id="ark-sheet" rel="stylesheet" href="https://ssimeonoff.github.io/css/mystyles-ark.css">
      <style>
        :host {
          display: inline-block;
          width: ${targetWidth}px;
          height: ${initialHeight}px;
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          background: #0f172a;
          vertical-align: middle;
        }
        .viewport {
          width: 100%;
          height: 100%;
          position: relative;
          overflow: hidden;
        }
        li.filterDiv {
          display: block !important;
          float: none !important;
          margin: 0 !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          transform-origin: top left !important;
          list-style: none !important;
          pointer-events: none !important;
          box-shadow: none !important;
          transform: scale(${initialScale});
        }
      </style>
      <div class="viewport">
        <li id="card-node" class="${card.spriteClass} filterDiv show animal">
          <div class="number">#${card.id}</div>
          <div class="name">${card.nameEn}</div>
        </li>
      </div>
    `;

    const linkEl = this.shadowRoot.getElementById('ark-sheet');
    const cardNode = this.shadowRoot.getElementById('card-node');

    const updateScale = () => {
      if (!cardNode) return;
      const rectW = cardNode.offsetWidth || defaultNatW;
      const rectH = cardNode.offsetHeight || defaultNatH;
      if (rectW > 20 && rectH > 20) {
        const s = targetWidth / rectW;
        this.style.width = `${targetWidth}px`;
        this.style.height = `${Math.round(rectH * s)}px`;
        cardNode.style.transform = `scale(${s})`;
      }
    };

    if (linkEl) {
      linkEl.addEventListener('load', () => {
        updateScale();
        requestAnimationFrame(updateScale);
      });
    }
    requestAnimationFrame(updateScale);
  }
}

customElements.define('ark-card', ArkCardElement);

// ============================================================================
// 2. 한글 초성 검색 도우미
// ============================================================================
const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

function getChosung(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code >= 0 && code <= 11171) {
      result += CHOSUNG_LIST[Math.floor(code / 588)];
    } else {
      result += str[i];
    }
  }
  return result;
}

// 각 카드에 초성 인덱스 미리 부여
ANIMAL_CARDS.forEach((card) => {
  card.chosung = getChosung(card.nameKo);
});

// ============================================================================
// 3. 7가지 단서 파싱 및 비교 엔진 (포케워들 스타일)
// 크기, 인접조건, 비용, 추가조건, 종류, 대륙, 능력
// ============================================================================
function parseSizeInfo(sizeStr) {
  const m = sizeStr.match(/^(\d+)/);
  const baseSize = m ? Number(m[1]) : 1;
  const specials = [];
  if (sizeStr.includes('파충류 사육장')) specials.push('파충류 사육장');
  if (sizeStr.includes('대형 새장')) specials.push('대형 새장');
  if (sizeStr.includes('수족관')) specials.push('수족관');
  return { baseSize, specials };
}

function parseAdjacencyInfo(adjStr) {
  if (!adjStr || adjStr === '없음') return { hasRock: false, hasWater: false };
  return {
    hasRock: adjStr.includes('바위'),
    hasWater: adjStr.includes('물')
  };
}

function normalizeReqString(reqStr) {
  return (reqStr || '없음').replace('오세아니아 자매동물원', '오스트레일리아 자매동물원').trim();
}

function parseReqTokens(reqStr) {
  const norm = normalizeReqString(reqStr);
  if (norm === '없음') return [];
  const parts = norm.split(',').map((s) => s.trim()).filter(Boolean);
  const tokens = new Set();
  parts.forEach((p) => {
    tokens.add(p);
    // 숫자 제거한 기본 조건명 (예: "연구 아이콘 2" -> "연구 아이콘")
    const stripped = p.replace(/\s*\d+$/, '').trim();
    tokens.add(stripped);
    if (p.includes('자매동물원')) tokens.add('자매동물원');
  });
  return Array.from(tokens);
}

function parseCategories(catStr) {
  if (!catStr || catStr === '없음') return [];
  return catStr
    .split(',')
    .map((s) => s.replace(/\s*\d+$/, '').trim())
    .filter(Boolean);
}

function parseBaseContinent(contStr) {
  if (!contStr || contStr === '없음') return '없음';
  return contStr.replace(/\s*\d+$/, '').trim();
}

function parseAbilityKeywords(abStr) {
  if (!abStr || abStr === '없음') return [];
  const keywords = new Set();
  const parts = abStr.split(',').map((s) => s.trim()).filter(Boolean);

  parts.forEach((part) => {
    let p = part;
    if (p.includes('[산호초]')) {
      keywords.add('산호초');
      p = p.replace('[산호초]', '').trim();
    }
    // 괄호 안 보조 키워드 추출 (예: "독 1(창의적인 1)" -> "창의적인")
    const parenMatch = p.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inner = parenMatch[1].replace(/\s*\d+$/, '').trim();
      if (inner) keywords.add(inner);
      p = p.replace(/\([^)]+\)/, '').trim();
    }
    // 대괄호 제거 (예: "창의적인 [영장류]" -> "창의적인")
    p = p.replace(/\[[^\]]+\]/g, '').trim();
    // 콜론 앞 메인 키워드 (예: "증가: 협회" -> "증가", "상징 동물: 유럽 대륙" -> "상징 동물")
    if (p.includes(':')) {
      const [prefix, suffix] = p.split(':').map((s) => s.trim());
      if (prefix) keywords.add(prefix);
      if (suffix) keywords.add(`${prefix}: ${suffix}`);
    }
    // 뒤쪽 숫자/X 제거 (예: "전력 질주 3" -> "전력 질주", "스쿠버 다이빙 X" -> "스쿠버 다이빙")
    const base = p.replace(/\s+(?:\d+|X)$/i, '').trim();
    if (base) keywords.add(base);
  });

  return Array.from(keywords);
}

function compareCards(guess, target) {
  // 1. 크기 비교
  const gSize = parseSizeInfo(guess.size);
  const tSize = parseSizeInfo(target.size);
  const sizeDir = gSize.baseSize < tSize.baseSize ? 'up' : gSize.baseSize > tSize.baseSize ? 'down' : null;
  let sizeStatus = 'wrong';
  if (guess.size === target.size) {
    sizeStatus = 'correct';
  } else if (
    gSize.baseSize === tSize.baseSize ||
    Math.abs(gSize.baseSize - tSize.baseSize) === 1 ||
    gSize.specials.some((sp) => tSize.specials.includes(sp))
  ) {
    sizeStatus = 'partial';
  }

  // 2. 인접 조건 비교
  const gAdj = parseAdjacencyInfo(guess.adjacency);
  const tAdj = parseAdjacencyInfo(target.adjacency);
  let adjStatus = 'wrong';
  if (guess.adjacency === target.adjacency) {
    adjStatus = 'correct';
  } else if ((gAdj.hasRock && tAdj.hasRock) || (gAdj.hasWater && tAdj.hasWater)) {
    adjStatus = 'partial';
  }

  // 3. 비용 비교 (±3 이내면 노란색)
  const costDiff = Math.abs(guess.cost - target.cost);
  const costDir = guess.cost < target.cost ? 'up' : guess.cost > target.cost ? 'down' : null;
  let costStatus = 'wrong';
  if (costDiff === 0) {
    costStatus = 'correct';
  } else if (costDiff <= 3) {
    costStatus = 'partial';
  }

  // 4. 추가 조건 비교
  const gReqNorm = normalizeReqString(guess.requirement);
  const tReqNorm = normalizeReqString(target.requirement);
  let reqStatus = 'wrong';
  if (gReqNorm === tReqNorm) {
    reqStatus = 'correct';
  } else {
    const gTokens = parseReqTokens(guess.requirement);
    const tTokens = parseReqTokens(target.requirement);
    if (gTokens.some((tk) => tTokens.includes(tk))) {
      reqStatus = 'partial';
    }
  }

  // 5. 종류 비교
  let catStatus = 'wrong';
  if (guess.category === target.category) {
    catStatus = 'correct';
  } else {
    const gCats = parseCategories(guess.category);
    const tCats = parseCategories(target.category);
    if (gCats.some((c) => tCats.includes(c))) {
      catStatus = 'partial';
    }
  }

  // 6. 대륙 비교
  let contStatus = 'wrong';
  if (guess.continent === target.continent) {
    contStatus = 'correct';
  } else if (parseBaseContinent(guess.continent) === parseBaseContinent(target.continent)) {
    contStatus = 'partial';
  }

  // 7. 능력 비교
  let abStatus = 'wrong';
  if (guess.ability === target.ability) {
    abStatus = 'correct';
  } else {
    const gAb = parseAbilityKeywords(guess.ability);
    const tAb = parseAbilityKeywords(target.ability);
    if (gAb.some((k) => tAb.includes(k))) {
      abStatus = 'partial';
    }
  }

  return {
    isCorrect: guess.id === target.id,
    size: { status: sizeStatus, dir: sizeDir, value: guess.size },
    adjacency: { status: adjStatus, dir: null, value: guess.adjacency },
    cost: { status: costStatus, dir: costDir, value: `${guess.cost}` },
    requirement: { status: reqStatus, dir: null, value: guess.requirement },
    category: { status: catStatus, dir: null, value: guess.category },
    continent: { status: contStatus, dir: null, value: guess.continent },
    ability: { status: abStatus, dir: null, value: guess.ability }
  };
}

// ============================================================================
// 4. 게임 상태 관리
// ============================================================================
const ALL_CATEGORIES = ['포식 동물', '초식 동물', '영장류', '파충류', '조류', '곰', '동물체험장 동물', '해양 동물'];
const ALL_CONTINENTS = ['아프리카', '아시아', '아메리카', '유럽', '오스트레일리아', '없음'];

const state = {
  mode: 'daily', // 'daily' | 'unlimited'
  pool: 'all', // 'all' | 'base' | 'marine'
  maxGuesses: 8,
  targetCard: null,
  guesses: [], // [{ card, comparison }]
  hintsUsed: 0,
  gameOver: false,
  won: false,
  acIndex: -1,
  acFiltered: []
};

function getPoolCards() {
  if (state.pool === 'base') return ANIMAL_CARDS.filter((c) => c.expansion === 'base');
  if (state.pool === 'marine') return ANIMAL_CARDS.filter((c) => c.expansion === 'marine');
  return ANIMAL_CARDS;
}

// 오늘의 동물 번호 및 시드 계산 (KST 기준)
function getDailySeedInfo() {
  const epoch = new Date('2024-01-01T00:00:00+09:00').getTime();
  const now = Date.now();
  const dayNumber = Math.max(1, Math.floor((now - epoch) / (1000 * 60 * 60 * 24)) + 1);
  return dayNumber;
}

function pickDailyCard(poolCards, dayNum) {
  // 결정론적 해시로 날짜별 고유 카드 선택
  const hash = (dayNum * 2654435761 + state.pool.charCodeAt(0) * 97) >>> 0;
  return poolCards[hash % poolCards.length];
}

function pickRandomCard(poolCards) {
  const idx = Math.floor(Math.random() * poolCards.length);
  return poolCards[idx];
}

// ============================================================================
// 5. UI 초기화 및 렌더링
// ============================================================================
const els = {
  modeDaily: document.getElementById('mode-daily'),
  modeUnlimited: document.getElementById('mode-unlimited'),
  dailyNumber: document.getElementById('daily-number'),
  poolSelect: document.getElementById('pool-select'),
  maxGuessesSelect: document.getElementById('max-guesses-select'),
  btnHint: document.getElementById('btn-hint'),
  hintCountBadge: document.getElementById('hint-count-badge'),
  btnGiveup: document.getElementById('btn-giveup'),
  btnNewGame: document.getElementById('btn-new-game'),
  hintBanner: document.getElementById('hint-banner'),
  remainingBadge: document.getElementById('remaining-candidates-badge'),
  deduceSize: document.getElementById('deduce-size'),
  deduceCost: document.getElementById('deduce-cost'),
  deduceCategories: document.getElementById('deduce-categories'),
  deduceContinents: document.getElementById('deduce-continents'),
  animalInput: document.getElementById('animal-input'),
  btnClearInput: document.getElementById('btn-clear-input'),
  currentAttempt: document.getElementById('current-attempt'),
  maxAttempt: document.getElementById('max-attempt'),
  acList: document.getElementById('autocomplete-list'),
  guessesContainer: document.getElementById('guesses-container'),
  emptyState: document.getElementById('empty-state'),
  toast: document.getElementById('toast')
};

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 2400);
}

function startNewRound() {
  const poolCards = getPoolCards();
  const dayNum = getDailySeedInfo();
  els.dailyNumber.textContent = `#${dayNum}`;

  state.guesses = [];
  state.hintsUsed = 0;
  state.gameOver = false;
  state.won = false;
  state.targetCard =
    state.mode === 'daily' ? pickDailyCard(poolCards, dayNum) : pickRandomCard(poolCards);

  // 데일리 모드 진행상태 복원 확인
  if (state.mode === 'daily') {
    const saved = loadDailyProgress(dayNum, state.pool);
    if (saved && saved.targetId === state.targetCard.id) {
      saved.guessIds.forEach((gid) => {
        const gCard = ANIMAL_CARDS.find((c) => c.id === gid);
        if (gCard) {
          state.guesses.push({
            card: gCard,
            comparison: compareCards(gCard, state.targetCard)
          });
        }
      });
      state.hintsUsed = saved.hintsUsed || 0;
      state.gameOver = saved.gameOver || false;
      state.won = saved.won || false;
    }
  }

  updateControlsUI();
  renderHintBanner();
  renderAllGuesses();
  updateDeductionBoard();
}

function updateControlsUI() {
  els.modeDaily.classList.toggle('active', state.mode === 'daily');
  els.modeDaily.setAttribute('aria-selected', state.mode === 'daily');
  els.modeUnlimited.classList.toggle('active', state.mode === 'unlimited');
  els.modeUnlimited.setAttribute('aria-selected', state.mode === 'unlimited');

  els.currentAttempt.textContent = state.guesses.length;
  els.maxAttempt.textContent = state.maxGuesses >= 999 ? '∞' : state.maxGuesses;
  els.hintCountBadge.textContent = `${state.hintsUsed}/2`;

  els.animalInput.disabled = state.gameOver;
  els.btnGiveup.classList.toggle('hidden', state.gameOver);
  els.btnNewGame.classList.toggle('hidden', !state.gameOver && state.mode === 'daily');
}

function statusIcon(status) {
  if (status === 'correct') return '✓';
  if (status === 'partial') return '≈';
  return '✕';
}

function dirArrowHtml(dir) {
  if (dir === 'up') return '<span class="dir-arrow" title="정답이 더 높음/큼">↑</span>';
  if (dir === 'down') return '<span class="dir-arrow" title="정답이 더 낮음/작음">↓</span>';
  return '';
}

function createGuessRowElement(guessEntry) {
  const { card, comparison } = guessEntry;
  const row = document.createElement('div');
  row.className = 'guess-row';

  const cells = [
    { key: 'size', label: '크기', data: comparison.size },
    { key: 'adjacency', label: '인접조건', data: comparison.adjacency },
    { key: 'cost', label: '비용', data: comparison.cost },
    { key: 'requirement', label: '추가조건', data: comparison.requirement },
    { key: 'category', label: '종류', data: comparison.category },
    { key: 'continent', label: '대륙', data: comparison.continent },
    { key: 'ability', label: '능력', data: comparison.ability }
  ];

  // 동물 카드 셀
  const animalCell = document.createElement('div');
  animalCell.className = 'cell cell-animal';
  animalCell.title = '클릭하여 원본 영문 카드 및 상세 정보 보기';
  animalCell.innerHTML = `
    <div class="animal-thumb-wrap">
      <ark-card card-id="${card.id}" width="52"></ark-card>
    </div>
    <div class="animal-info-text">
      <span class="animal-num-badge">#${card.id}</span>
      <span class="animal-ko-title">${card.nameKo}</span>
      <span class="animal-en-sub">${card.nameEn}</span>
    </div>
    <span class="mobile-zoom-hint">카드 보기 ›</span>
  `;
  animalCell.addEventListener('click', () => openCardDetailModal(card));
  row.appendChild(animalCell);

  cells.forEach((c, idx) => {
    const cell = document.createElement('div');
    cell.className = `cell cell-${c.key} ${c.data.status}`;
    cell.style.animationDelay = `${(idx + 1) * 55}ms`;
    cell.innerHTML = `
      <div class="cell-top-meta">
        <span class="cell-label">${c.label}</span>
        <span class="cell-status-icon">${statusIcon(c.data.status)}</span>
      </div>
      <div class="cell-main-value">
        ${c.data.value}${dirArrowHtml(c.data.dir)}
      </div>
    `;
    row.appendChild(cell);
  });

  return row;
}

function renderAllGuesses() {
  els.guessesContainer.innerHTML = '';
  if (state.guesses.length === 0) {
    els.guessesContainer.appendChild(els.emptyState);
    els.emptyState.classList.remove('hidden');
    return;
  }

  // 최신 추측이 위에 오도록 역순 렌더링
  [...state.guesses].reverse().forEach((entry) => {
    els.guessesContainer.appendChild(createGuessRowElement(entry));
  });
}

// ============================================================================
// 6. 실시간 추리 요약 노트 & 남은 후보 계산
// ============================================================================
function getConsistentCandidates() {
  const pool = getPoolCards();
  if (state.guesses.length === 0) return pool;

  return pool.filter((candidate) => {
    return state.guesses.every(({ card: guessedCard, comparison }) => {
      const sim = compareCards(guessedCard, candidate);
      return (
        sim.size.status === comparison.size.status &&
        sim.size.dir === comparison.size.dir &&
        sim.adjacency.status === comparison.adjacency.status &&
        sim.cost.status === comparison.cost.status &&
        sim.cost.dir === comparison.cost.dir &&
        sim.requirement.status === comparison.requirement.status &&
        sim.category.status === comparison.category.status &&
        sim.continent.status === comparison.continent.status &&
        sim.ability.status === comparison.ability.status
      );
    });
  });
}

function updateDeductionBoard() {
  let minSize = 1;
  let maxSize = 5;
  let minCost = 4;
  let maxCost = 36;

  const catStates = {}; // 'confirmed' | 'partial' | 'eliminated'
  const contStates = {};

  state.guesses.forEach(({ card, comparison }) => {
    const gSize = parseSizeInfo(card.size).baseSize;
    if (comparison.size.dir === 'up') minSize = Math.max(minSize, gSize + 1);
    else if (comparison.size.dir === 'down') maxSize = Math.min(maxSize, gSize - 1);
    else {
      minSize = gSize;
      maxSize = gSize;
    }

    if (comparison.cost.dir === 'up') {
      minCost = Math.max(minCost, card.cost + 1);
      if (comparison.cost.status === 'partial') maxCost = Math.min(maxCost, card.cost + 3);
      else minCost = Math.max(minCost, card.cost + 4);
    } else if (comparison.cost.dir === 'down') {
      maxCost = Math.min(maxCost, card.cost - 1);
      if (comparison.cost.status === 'partial') minCost = Math.max(minCost, card.cost - 3);
      else maxCost = Math.min(maxCost, card.cost - 4);
    } else {
      minCost = card.cost;
      maxCost = card.cost;
    }

    // 종류 상태 기록
    const gCats = parseCategories(card.category);
    if (comparison.category.status === 'correct') {
      ALL_CATEGORIES.forEach((c) => {
        catStates[c] = gCats.includes(c) ? 'confirmed' : 'eliminated';
      });
    } else if (comparison.category.status === 'partial') {
      gCats.forEach((c) => {
        if (catStates[c] !== 'confirmed') catStates[c] = 'partial';
      });
    } else {
      gCats.forEach((c) => {
        catStates[c] = 'eliminated';
      });
    }

    // 대륙 상태 기록
    const gCont = parseBaseContinent(card.continent);
    if (comparison.continent.status === 'correct' || comparison.continent.status === 'partial') {
      ALL_CONTINENTS.forEach((ct) => {
        contStates[ct] = ct === gCont ? 'confirmed' : 'eliminated';
      });
    } else {
      contStates[gCont] = 'eliminated';
    }
  });

  els.deduceSize.textContent = minSize === maxSize ? `${minSize}` : `${minSize} ~ ${maxSize}`;
  els.deduceCost.textContent = minCost === maxCost ? `${minCost}` : `${minCost} ~ ${maxCost}`;

  els.deduceCategories.innerHTML = ALL_CATEGORIES.map((c) => {
    const st = catStates[c] || '';
    return `<span class="mini-tag ${st}">${c}</span>`;
  }).join('');

  els.deduceContinents.innerHTML = ALL_CONTINENTS.map((ct) => {
    const st = contStates[ct] || '';
    const label = ct === '없음' ? '대륙 없음' : ct;
    return `<span class="mini-tag ${st}">${label}</span>`;
  }).join('');

  const candidates = getConsistentCandidates();
  els.remainingBadge.textContent = `남은 후보: ${candidates.length}종 (클릭해 보기)`;
}

// ============================================================================
// 7. 추측 제출 및 힌트/종료 처리
// ============================================================================
function submitGuess(cardId) {
  if (state.gameOver) return;
  const card = ANIMAL_CARDS.find((c) => c.id === Number(cardId));
  if (!card) return;

  if (state.guesses.some((g) => g.card.id === card.id)) {
    showToast('이미 추측한 동물 카드입니다!');
    return;
  }

  const comparison = compareCards(card, state.targetCard);
  state.guesses.push({ card, comparison });

  els.animalInput.value = '';
  els.btnClearInput.classList.add('hidden');
  hideAutocomplete();

  if (comparison.isCorrect) {
    state.gameOver = true;
    state.won = true;
    recordGameResult(true, state.guesses.length);
    setTimeout(() => openResultModal(), 450);
  } else if (state.guesses.length >= state.maxGuesses) {
    state.gameOver = true;
    state.won = false;
    recordGameResult(false, state.guesses.length);
    setTimeout(() => openResultModal(), 450);
  }

  if (state.mode === 'daily') {
    saveDailyProgress();
  }

  updateControlsUI();
  renderAllGuesses();
  updateDeductionBoard();
}

function renderHintBanner() {
  if (state.hintsUsed === 0 || !state.targetCard) {
    els.hintBanner.classList.add('hidden');
    return;
  }
  const t = state.targetCard;
  const hints = [];
  if (state.hintsUsed >= 1) {
    const rewards = [];
    if (t.appeal > 0) rewards.push(`매력 점수 ${t.appeal}`);
    else rewards.push('매력 점수 0');
    if (t.conservation > 0) rewards.push(`보호 점수 ${t.conservation}`);
    if (t.reputation > 0) rewards.push(`명성 ${t.reputation}`);
    hints.push(`<strong>💡 힌트 1 (보상 수치):</strong> ${rewards.join(' · ')}`);
  }
  if (state.hintsUsed >= 2) {
    const low = Math.floor((t.id - 401) / 20) * 20 + 401;
    const high = Math.min(561, low + 19);
    const firstChar = t.nameKo[0];
    hints.push(`<strong>💡 힌트 2 (번호 & 초성):</strong> 카드 번호 #${low}~#${high} 구간 · 첫 글자 초성 '${getChosung(firstChar)}'`);
  }
  els.hintBanner.innerHTML = hints.map((h) => `<span>${h}</span>`).join('');
  els.hintBanner.classList.remove('hidden');
}

// ============================================================================
// 8. 검색 자동완성
// ============================================================================
function filterAutocomplete(query) {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return [];

  const pool = getPoolCards();
  return pool
    .filter((c) => {
      return (
        String(c.id).includes(q) ||
        c.nameKo.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.chosung.includes(q)
      );
    })
    .slice(0, 12);
}

function renderAutocomplete(items) {
  state.acFiltered = items;
  state.acIndex = items.length > 0 ? 0 : -1;

  if (items.length === 0) {
    hideAutocomplete();
    return;
  }

  const guessedIds = new Set(state.guesses.map((g) => g.card.id));

  els.acList.innerHTML = items
    .map((c, idx) => {
      const guessed = guessedIds.has(c.id);
      return `
        <li class="ac-item ${idx === state.acIndex ? 'active' : ''} ${guessed ? 'already-guessed' : ''}" data-id="${c.id}" data-index="${idx}">
          <div class="ac-left">
            <span class="ac-id">#${c.id}</span>
            <div class="ac-names">
              <span class="ac-name-ko">${c.nameKo}</span>
              <span class="ac-name-en">${c.nameEn}</span>
            </div>
          </div>
          <div class="ac-meta">
            <span class="ac-chip">${c.category}</span>
            <span class="ac-chip">${c.continent === '없음' ? '대륙 없음' : c.continent}</span>
            <span class="ac-chip">크기 ${ parseSizeInfo(c.size).baseSize } · 비용 ${c.cost}</span>
          </div>
        </li>
      `;
    })
    .join('');

  els.acList.classList.remove('hidden');
}

function hideAutocomplete() {
  els.acList.classList.add('hidden');
  state.acFiltered = [];
  state.acIndex = -1;
}

// ============================================================================
// 9. 모달 & 공유 & 로컬스토리지 통계
// ============================================================================
function fillCardDetailsInto(card, prefix) {
  const imgSlot = document.getElementById(`${prefix}-card-image-slot`);
  const badgesEl = document.getElementById(`${prefix}-badges`) || document.getElementById(`${prefix}-detail-badges`);
  const tableEl = document.getElementById(`${prefix}-table`) || document.getElementById(`${prefix}-detail-table`);
  const commentEl = document.getElementById(`${prefix}-comment`) || document.getElementById(`${prefix}-detail-comment`);
  const linksEl = document.getElementById(`${prefix}-links`) || document.getElementById(`${prefix}-detail-links`);

  imgSlot.innerHTML = `<ark-card card-id="${card.id}" width="230"></ark-card>`;

  badgesEl.innerHTML = `
    <span class="detail-badge">${card.expansion === 'marine' ? '🌊 바다 세계 확장' : '🐾 기본판'}</span>
    <span class="detail-badge">매력 ${card.appeal}</span>
    ${card.conservation ? `<span class="detail-badge">보호 ${card.conservation}</span>` : ''}
    ${card.reputation ? `<span class="detail-badge">명성 ${card.reputation}</span>` : ''}
  `;

  tableEl.innerHTML = `
    <div class="dt-key">크기</div><div class="dt-val">${card.size}</div>
    <div class="dt-key">인접 조건</div><div class="dt-val">${card.adjacency}</div>
    <div class="dt-key">비용</div><div class="dt-val">${card.cost}</div>
    <div class="dt-key">추가 조건</div><div class="dt-val">${card.requirement}</div>
    <div class="dt-key">종류</div><div class="dt-val">${card.category}</div>
    <div class="dt-key">대륙</div><div class="dt-val">${card.continent}</div>
    <div class="dt-key">능력</div><div class="dt-val">${card.ability}</div>
  `;

  if (card.comment) {
    commentEl.textContent = `나무위키 평가: ${card.comment}`;
    commentEl.classList.remove('hidden');
  } else {
    commentEl.classList.add('hidden');
  }

  const namuUrl = `https://namu.wiki/w/%EC%95%84%ED%81%AC%EB%85%B8%EB%B0%94/%EB%8F%99%EB%AC%BC%20%EC%B9%B4%EB%93%9C#${encodeURIComponent(`${card.id} ${card.nameKo}`)}`;
  linksEl.innerHTML = `
    <a href="${namuUrl}" target="_blank" rel="noopener">🔗 나무위키 설명 보기</a>
    <a href="https://ssimeonoff.github.io/ark-nova#${card.id}" target="_blank" rel="noopener">🃏 ssimeonoff 카드 원문</a>
  `;
}

function openResultModal() {
  const card = state.targetCard;
  const badge = document.getElementById('result-badge');
  const title = document.getElementById('result-modal-title');
  const subtitle = document.getElementById('result-subtitle');

  if (state.won) {
    badge.textContent = '🎉 정답입니다!';
    badge.classList.remove('fail');
    subtitle.textContent = `${state.guesses.length}번째 시도 만에 정답 동물을 찾았습니다!`;
  } else {
    badge.textContent = '😢 아쉽네요!';
    badge.classList.add('fail');
    subtitle.textContent = `정답 동물은 #${card.id} ${card.nameKo} (${card.nameEn})였습니다.`;
  }

  title.textContent = `#${card.id} ${card.nameKo} (${card.nameEn})`;
  fillCardDetailsInto(card, 'result');
  document.getElementById('result-modal').classList.remove('hidden');
}

function openCardDetailModal(card) {
  document.getElementById('detail-modal-title').textContent = `#${card.id} ${card.nameKo} (${card.nameEn})`;
  fillCardDetailsInto(card, 'detail');
  document.getElementById('card-detail-modal').classList.remove('hidden');
}

function buildShareText() {
  const dayNum = getDailySeedInfo();
  const modeTitle = state.mode === 'daily' ? `오늘의 동물 #${dayNum}` : '무한 모드';
  const scoreStr = state.won ? `${state.guesses.length}/${state.maxGuesses >= 999 ? '∞' : state.maxGuesses}` : `X/${state.maxGuesses}`;

  const emojiMap = { correct: '🟩', partial: '🟨', wrong: '⬛' };
  const rows = state.guesses.map(({ comparison }) => {
    return [
      emojiMap[comparison.size.status],
      emojiMap[comparison.adjacency.status],
      emojiMap[comparison.cost.status],
      emojiMap[comparison.requirement.status],
      emojiMap[comparison.category.status],
      emojiMap[comparison.continent.status],
      emojiMap[comparison.ability.status]
    ].join('');
  });

  return `🦁 아크워들 (ArkWordle) - ${modeTitle} (${scoreStr})\n${rows.join('\n')}`;
}

// 도감 모달 렌더링
function renderDexModal() {
  const q = document.getElementById('dex-search').value.trim().toLowerCase();
  const cat = document.getElementById('dex-category').value;
  const cont = document.getElementById('dex-continent').value;
  const onlyPossible = document.getElementById('dex-only-possible').checked;

  const baseList = onlyPossible ? getConsistentCandidates() : getPoolCards();
  const guessedIds = new Set(state.guesses.map((g) => g.card.id));

  const filtered = baseList.filter((c) => {
    if (cat && !c.category.includes(cat)) return false;
    if (cont && parseBaseContinent(c.continent) !== cont) return false;
    if (q) {
      const hay = `${c.id} ${c.nameKo} ${c.nameEn} ${c.ability} ${c.requirement} ${c.chosung}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const grid = document.getElementById('dex-grid');
  grid.innerHTML = filtered
    .map((c) => {
      const guessed = guessedIds.has(c.id);
      return `
        <div class="dex-card">
          <div class="dex-card-top">
            <span class="ac-id">#${c.id}</span>
            <span class="dex-card-meta">크기 ${c.size} · 비용 ${c.cost}</span>
          </div>
          <div class="dex-card-title">${c.nameKo} <span class="ac-name-en">(${c.nameEn})</span></div>
          <div class="dex-card-meta">${c.category} · ${c.continent === '없음' ? '대륙 없음' : c.continent}</div>
          <div class="dex-card-meta">능력: ${c.ability}</div>
          <div class="dex-card-actions">
            <button class="dex-btn view-detail" data-id="${c.id}">🔍 카드 보기</button>
            ${
              !state.gameOver && !guessed
                ? `<button class="dex-btn guess-now" data-id="${c.id}">🎯 바로 추측</button>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');
}

// 로컬스토리지 저장/로드
const STATS_KEY = 'arkwordle_stats_v1';
const DAILY_KEY = 'arkwordle_daily_v1';

function loadStats() {
  try {
    return (
      JSON.parse(localStorage.getItem(STATS_KEY)) || {
        played: 0,
        wins: 0,
        streak: 0,
        maxStreak: 0,
        dist: {}
      }
    );
  } catch {
    return { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: {} };
  }
}

function recordGameResult(won, guessCount) {
  const st = loadStats();
  st.played += 1;
  if (won) {
    st.wins += 1;
    st.streak += 1;
    st.maxStreak = Math.max(st.maxStreak, st.streak);
    const key = String(Math.min(guessCount, 10));
    st.dist[key] = (st.dist[key] || 0) + 1;
  } else {
    st.streak = 0;
  }
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(st));
  } catch {}
}

function renderStatsModal() {
  const st = loadStats();
  document.getElementById('stat-played').textContent = st.played;
  document.getElementById('stat-winrate').textContent =
    st.played > 0 ? `${Math.round((st.wins / st.played) * 100)}%` : '0%';
  document.getElementById('stat-streak').textContent = st.streak;
  document.getElementById('stat-max-streak').textContent = st.maxStreak;

  const distEl = document.getElementById('stats-distribution');
  const maxVal = Math.max(1, ...Object.values(st.dist));
  let html = '';
  for (let i = 1; i <= 10; i++) {
    const k = String(i);
    const count = st.dist[k] || 0;
    const pct = Math.max(6, Math.round((count / maxVal) * 100));
    html += `
      <div class="dist-row">
        <span>${i === 10 ? '10+' : i}회</span>
        <div class="dist-bar-wrap"><div class="dist-bar" style="width:${pct}%"></div></div>
        <strong>${count}</strong>
      </div>
    `;
  }
  distEl.innerHTML = html;
}

function saveDailyProgress() {
  const dayNum = getDailySeedInfo();
  const payload = {
    dayNum,
    pool: state.pool,
    targetId: state.targetCard.id,
    guessIds: state.guesses.map((g) => g.card.id),
    hintsUsed: state.hintsUsed,
    gameOver: state.gameOver,
    won: state.won
  };
  try {
    localStorage.setItem(`${DAILY_KEY}_${dayNum}_${state.pool}`, JSON.stringify(payload));
  } catch {}
}

function loadDailyProgress(dayNum, pool) {
  try {
    return JSON.parse(localStorage.getItem(`${DAILY_KEY}_${dayNum}_${pool}`));
  } catch {
    return null;
  }
}

// ============================================================================
// 10. 이벤트 리스너 바인딩
// ============================================================================
function bindEvents() {
  els.modeDaily.addEventListener('click', () => {
    if (state.mode !== 'daily') {
      state.mode = 'daily';
      startNewRound();
    }
  });

  els.modeUnlimited.addEventListener('click', () => {
    state.mode = 'unlimited';
    startNewRound();
  });

  els.poolSelect.addEventListener('change', (e) => {
    state.pool = e.target.value;
    startNewRound();
  });

  els.maxGuessesSelect.addEventListener('change', (e) => {
    state.maxGuesses = Number(e.target.value);
    updateControlsUI();
  });

  els.btnHint.addEventListener('click', () => {
    if (state.gameOver) return;
    if (state.hintsUsed < 2) {
      state.hintsUsed += 1;
      renderHintBanner();
      updateControlsUI();
      if (state.mode === 'daily') saveDailyProgress();
    } else {
      showToast('모든 힌트(2개)를 이미 확인했습니다!');
    }
  });

  els.btnGiveup.addEventListener('click', () => {
    if (state.gameOver) return;
    state.gameOver = true;
    state.won = false;
    recordGameResult(false, state.guesses.length);
    if (state.mode === 'daily') saveDailyProgress();
    updateControlsUI();
    openResultModal();
  });

  els.btnNewGame.addEventListener('click', () => {
    state.mode = 'unlimited';
    startNewRound();
  });

  // 검색 입력 이벤트
  els.animalInput.addEventListener('input', (e) => {
    const val = e.target.value;
    els.btnClearInput.classList.toggle('hidden', !val);
    const items = filterAutocomplete(val);
    renderAutocomplete(items);
  });

  els.animalInput.addEventListener('keydown', (e) => {
    if (els.acList.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.acIndex = (state.acIndex + 1) % state.acFiltered.length;
      renderAutocomplete(state.acFiltered);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.acIndex = (state.acIndex - 1 + state.acFiltered.length) % state.acFiltered.length;
      renderAutocomplete(state.acFiltered);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.acIndex >= 0 && state.acFiltered[state.acIndex]) {
        submitGuess(state.acFiltered[state.acIndex].id);
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });

  els.btnClearInput.addEventListener('click', () => {
    els.animalInput.value = '';
    els.btnClearInput.classList.add('hidden');
    hideAutocomplete();
    els.animalInput.focus();
  });

  els.acList.addEventListener('click', (e) => {
    const li = e.target.closest('.ac-item');
    if (li) {
      submitGuess(Number(li.dataset.id));
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-section')) {
      hideAutocomplete();
    }
  });

  // 빠른 시작 추천 버튼
  els.emptyState.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-pick-btn');
    if (btn) {
      submitGuess(Number(btn.dataset.id));
    }
  });

  // 상단 모달 버튼들
  document.getElementById('btn-dex').addEventListener('click', () => {
    renderDexModal();
    document.getElementById('dex-modal').classList.remove('hidden');
  });

  els.remainingBadge.addEventListener('click', () => {
    document.getElementById('dex-only-possible').checked = true;
    renderDexModal();
    document.getElementById('dex-modal').classList.remove('hidden');
  });

  document.getElementById('dex-search').addEventListener('input', renderDexModal);
  document.getElementById('dex-category').addEventListener('change', renderDexModal);
  document.getElementById('dex-continent').addEventListener('change', renderDexModal);
  document.getElementById('dex-only-possible').addEventListener('change', renderDexModal);

  document.getElementById('dex-grid').addEventListener('click', (e) => {
    const viewBtn = e.target.closest('.view-detail');
    if (viewBtn) {
      const c = ANIMAL_CARDS.find((x) => x.id === Number(viewBtn.dataset.id));
      if (c) openCardDetailModal(c);
      return;
    }
    const guessBtn = e.target.closest('.guess-now');
    if (guessBtn) {
      document.getElementById('dex-modal').classList.add('hidden');
      submitGuess(Number(guessBtn.dataset.id));
    }
  });

  document.getElementById('btn-stats').addEventListener('click', () => {
    renderStatsModal();
    document.getElementById('stats-modal').classList.remove('hidden');
  });

  document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('help-modal').classList.remove('hidden');
  });

  // 모달 닫기
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.add('hidden');
    });
  });

  // 결과 공유 및 다시 하기
  document.getElementById('btn-share-result').addEventListener('click', () => {
    const txt = buildShareText();
    navigator.clipboard.writeText(txt).then(() => {
      showToast('결과가 클립보드에 복사되었습니다!');
    });
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
    state.mode = 'unlimited';
    startNewRound();
  });
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  startNewRound();
});
