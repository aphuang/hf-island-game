/* ============================================================
 * 飛吧！華府島嶼大冒險 — 遊戲主程式
 * ============================================================ */
(() => {
  'use strict';

  const CFG = window.GAME_CONFIG;
  const INK = '#23325b';
  const ST = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  const $ = (s) => document.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';

  const state = {
    countries: [],   // 有行程的國家（島）
    islands: [],     // [台灣出發島, ...countries]
    nodes: [],       // 航線上的所有格子（島 + 步數點）
    gaps: null,      // 每段島與島之間的步數
    layout: null,
    pos: 0,          // 飛機目前所在格子
    target: null,    // 本局目的地國家
    dir: 1,          // 1 = 順時針, -1 = 逆時針
    rolls: 0,
    coins: 0,        // 貝殼幣
    goalItem: null,  // 本局目標行程
    goalPrice: 0,
    lap: false,      // 停在目的地但金額不足 → 要再飛一圈
    badCards: 0,     // 本局已抽到的壞機會卡數
    doubleNext: false, // 下一擲點數加倍
    grandPending: false, // 剛集滿圖鑑，這回合結束後跳出環島大獎
    busy: false,
    won: false,
    relayoutPending: false,
  };

  /* ---------------- utilities ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const safeLink = (u) => (/^https?:\/\//i.test(u || '') ? u : CFG.FALLBACK_LINK);
  const fmtPrice = (p) => {
    if (!p) return '請洽詢';
    return p.replace(/^\s*(\d[\d,]*)/, (m) => 'NT$' + Number(m.replace(/[,\s]/g, '')).toLocaleString('en-US'));
  };
  const COIN = CFG.COIN_NAME || '貝殼幣';
  const randStep = ([a, b]) => a + 500 * randInt(0, Math.floor((b - a) / 500));
  // 依目標行程價格的比例計算金額（四捨五入到 500），讓便宜和昂貴的行程難度差不多
  const goalPart = ([a, b]) => Math.max(500, Math.round((state.goalPrice * (a + Math.random() * (b - a))) / 500) * 500);
  const money = (n) => Number(n).toLocaleString('en-US');
  const parsePrice = (p) => { const m = String(p || '').replace(/[,\s]/g, '').match(/\d{3,}/); return m ? Number(m[0]) : 0; };
  const SHELL_PATHS = `<path d="M0 7 L-8.5 -1 Q-7.5 -9.5 0 -9.5 Q7.5 -9.5 8.5 -1 Z" fill="#ffb3a7" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M0 7 V-9 M0 7 L-4.8 -8.4 M0 7 L4.8 -8.4" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <rect x="-3" y="5.5" width="6" height="3.5" rx="1.5" fill="#ffb3a7" stroke="${INK}" stroke-width="1.5"/>`;
  const GULL_PATHS = `<path d="M-8 2 Q-4 -6 0 0 Q4 -6 8 2" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="0" cy="0.5" r="1.6" fill="#f05a3c"/>`;
  const shellIcon = () => `<svg viewBox="-11 -11 22 22" aria-hidden="true">${SHELL_PATHS}</svg>`;
  const gullIcon = () => `<svg viewBox="-11 -11 22 22" aria-hidden="true"><circle r="10" fill="#dbe7f3" stroke="${INK}" stroke-width="1.8"/>${GULL_PATHS}</svg>`;
  const chanceIcon = () => `<svg viewBox="-11 -11 22 22" aria-hidden="true"><circle r="10" fill="#f05a3c" stroke="${INK}" stroke-width="1.8"/><text y="4.6" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">?</text></svg>`;
  const legendHTML = () => `<div class="legend"><span>${shellIcon()}幸運貝殼 +${COIN}</span><span>${chanceIcon()}機會卡</span></div>`;

  /* ---------------- 島嶼圖鑑（存在這台裝置的瀏覽器） ---------------- */
  const DEX_KEY = 'hf_island_dex';
  let dex = {};
  try { dex = JSON.parse(localStorage.getItem(DEX_KEY) || '{}') || {}; } catch (e) { dex = {}; }
  const dexCount = () => state.countries.filter((c) => dex[c.id]).length;
  function updateDexBtn() {
    $('#dexCount').textContent = `${dexCount()}/${state.countries.length}`;
  }
  function markDex() {
    document.querySelectorAll('.island').forEach((el) => el.classList.toggle('is-collected', !!dex[el.dataset.id]));
  }
  // 收進圖鑑；已收集過回傳 null。達到里程碑時直接加貝殼幣
  function collect(country) {
    if (!country || country.start || dex[country.id]) return null;
    const d = new Date();
    dex[country.id] = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    try { localStorage.setItem(DEX_KEY, JSON.stringify(dex)); } catch (e) { /* storage unavailable */ }
    const n = dexCount(), total = state.countries.length;
    markDex();
    updateDexBtn();
    const reward = (CFG.DEX_REWARDS || []).find((r) => (r.count === 'all' ? total : r.count) === n);
    if (reward) {
      state.coins += reward.coins;
      renderCoins();
      setTimeout(() => toast(`島嶼圖鑑收集 ${n} 國！獲得「${reward.title}」+${money(reward.coins)} ${COIN}`, 3200), 400);
    }
    if (n === total) state.grandPending = true;
    return { n, total, reward };
  }

  /* ---------------- 抽獎資料（填過一次就記在這台裝置，不用重填） ---------------- */
  const PLAYER_KEY = 'hf_island_player';
  const PRIZES = { normal: '一般抽獎', grand: '環島大獎' };
  let player = null;
  try { player = JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null'); } catch (e) { player = null; }
  function savePlayer(info, type) {
    player = { name: info.name, phone: info.phone, email: info.email, entered: { ...(player?.entered || {}), [type]: true } };
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify(player)); } catch (e) { /* storage unavailable */ }
  }
  function forgetPlayer() {
    player = null;
    try { localStorage.removeItem(PLAYER_KEY); } catch (e) { /* storage unavailable */ }
  }
  const maskName = (n) => n.slice(0, 1) + '○'.repeat(Math.max(1, n.length - 1));
  const maskPhone = (p) => p.slice(0, 4) + '***' + p.slice(-3);
  const grandDone = () => !!player?.entered?.grand;

  // 固定亂數（讓島嶼形狀每次一樣）
  const seeded = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  /* ---------------- data ---------------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  async function fetchSheet(sheet) {
    const base = `https://docs.google.com/spreadsheets/d/${CFG.SHEET_ID}`;
    const urls = [
      `${base}/export?format=csv&gid=${sheet.gid}`,
      `${base}/gviz/tq?tqx=out:csv&headers=1&gid=${sheet.gid}`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const text = await res.text();
        if (text.trim().startsWith('<')) continue;
        const rows = parseCSV(text);
        if (rows.length > 1 && rows[0].some((h) => h.trim() === '地區城市')) return rows;
      } catch (e) { /* try next url */ }
    }
    throw new Error('無法讀取 ' + sheet.name);
  }

  function rowsToItems(rows, cat) {
    const head = rows[0].map((h) => String(h).trim());
    const col = (k) => head.indexOf(k);
    const iR = col('地區城市'), iN = col('POP商品名稱'), iD = col('出發日期'), iT = col('折扣分類'),
      iP = col('折扣'), iL = col('商品連結'), iF = col('商品特色');
    const items = [];
    let lastRegion = '', lastDates = '';
    for (const r of rows.slice(1)) {
      const get = (i) => (i >= 0 && r[i] != null ? String(r[i]).trim() : '');
      const name = get(iN);
      // 合併儲存格只有第一列有值：地區、出發日期空白時沿用上一列
      let region = get(iR), dates = get(iD);
      if (region) lastRegion = region; else region = lastRegion;
      if (!name) continue;
      if (dates) lastDates = dates; else dates = lastDates;
      items.push({ cat, region, name, dates, ptype: get(iT), price: get(iP), link: get(iL), feature: get(iF) });
    }
    return items;
  }

  function matchCountry(region) {
    for (const id of window.MATCH_ORDER) {
      const c = window.COUNTRIES.find((x) => x.id === id);
      if (c && c.keys.some((k) => region.includes(k))) return id;
    }
    return null;
  }

  async function loadData() {
    const results = await Promise.allSettled(CFG.SHEETS.map(fetchSheet));
    const items = [];
    let usedFallback = false;
    CFG.SHEETS.forEach((sheet, i) => {
      let rows;
      if (results[i].status === 'fulfilled') rows = results[i].value;
      else { rows = window.FALLBACK_SHEETS[sheet.name]; usedFallback = true; }
      if (rows) items.push(...rowsToItems(rows, sheet.name));
    });
    if (usedFallback) console.warn('[島嶼大冒險] 部分線上資料讀取失敗，改用 data.js 內的備援資料。');

    const byCountry = {};
    const unmatched = new Set();
    items.forEach((it) => {
      const id = matchCountry(it.region);
      if (!id) { unmatched.add(it.region); return; }
      (byCountry[id] = byCountry[id] || []).push(it);
    });
    if (unmatched.size) console.warn('[島嶼大冒險] 以下地區未對應到國家，請到 data.js 的 COUNTRIES 新增關鍵字：', [...unmatched]);

    state.countries = window.COUNTRIES
      .filter((c) => byCountry[c.id])
      .map((c) => ({ ...c, items: byCountry[c.id] }));
  }

  /* ---------------- landmarks (unit box ≈ 100 x 100, ground at y = 8) ---------------- */
  const palm = (x, s = 1, flip = 1) => {
    const tx = x + 10 * flip * s, ty = 8 - 44 * s;
    const leaves = [-25, 15, 160, 200, -70, 250].map((a) =>
      `<ellipse cx="${tx + 13 * s}" cy="${ty}" rx="${14 * s}" ry="${4.5 * s}" fill="#5cbf6b" ${ST} transform="rotate(${a} ${tx} ${ty})"/>`).join('');
    return `<path d="M${x} 8 Q${x + 2 * flip * s} ${8 - 24 * s} ${tx} ${ty}" fill="none" stroke="${INK}" stroke-width="${7 * s}" stroke-linecap="round"/>
      <path d="M${x} 8 Q${x + 2 * flip * s} ${8 - 24 * s} ${tx} ${ty}" fill="none" stroke="#d99a55" stroke-width="${3.5 * s}" stroke-linecap="round"/>${leaves}`;
  };
  const house = (x, w, h, color) =>
    `<rect x="${x}" y="${8 - h}" width="${w}" height="${h}" fill="${color}" ${ST}/>
     <path d="M${x - 3} ${8 - h} L${x + w / 2} ${8 - h - 14} L${x + w + 3} ${8 - h} Z" fill="#fff" ${ST}/>
     <rect x="${x + w / 2 - 3}" y="${8 - h + 6}" width="6" height="6" fill="#ffd93b" ${ST}/>`;

  const LANDMARKS = {
    tw: () => `
      <rect x="8" y="-16" width="40" height="24" fill="#ffd93b" ${ST}/>
      <path d="M8 -16 L28 -26 L48 -16" fill="none" ${ST}/>
      <path d="M14 -6 H42" ${ST}/>
      <rect x="-14" y="-52" width="14" height="60" fill="#fff" ${ST}/>
      <path d="M-27 -52 L13 -52 L8 -68 L-22 -68 Z" fill="#2aa4e0" ${ST}/>
      <rect x="-24" y="-74" width="34" height="6" fill="#f05a3c" ${ST}/>
      <path d="M-7 -74 V-86" ${ST}/><circle cx="-7" cy="-88" r="3.5" fill="#f05a3c" ${ST}/>`,
    jp: () => `
      <path d="M-52 8 L-14 -42 Q-2 -48 10 -42 L46 8 Z" fill="#7cc4ea" ${ST}/>
      <path d="M-14 -42 Q-2 -48 10 -42 L19 -30 L10 -33 L2 -26 L-6 -33 L-22 -31 Z" fill="#fff" ${ST}/>
      <rect x="14" y="-22" width="6" height="30" fill="#f05a3c" ${ST}/>
      <rect x="38" y="-22" width="6" height="30" fill="#f05a3c" ${ST}/>
      <path d="M6 -30 Q29 -24 52 -30 L50 -24 Q29 -19 8 -24 Z" fill="#f05a3c" ${ST}/>
      <rect x="11" y="-16" width="36" height="5" fill="#f05a3c" ${ST}/>`,
    kr: () => `
      <rect x="-30" y="-8" width="60" height="16" fill="#fff" ${ST}/>
      <rect x="-8" y="-4" width="16" height="12" fill="#f05a3c" ${ST}/>
      <path d="M-22 -8 V8 M22 -8 V8" ${ST}/>
      <path d="M-44 -8 Q-30 -12 -26 -24 L26 -24 Q30 -12 44 -8 Z" fill="#2aa4e0" ${ST}/>
      <rect x="-18" y="-34" width="36" height="10" fill="#fff" ${ST}/>
      <path d="M-30 -34 Q-20 -38 -16 -48 L16 -48 Q20 -38 30 -34 Z" fill="#2aa4e0" ${ST}/>`,
    cn: () => [0, 1, 2].map((i) => {
      const y0 = 8 - i * 20, bw = 16 - 4 * i, rw = 28 - 6 * i, tw = 18 - 4 * i;
      return `<rect x="${-bw}" y="${y0 - 14}" width="${bw * 2}" height="14" fill="#fff" ${ST}/>
        <path d="M${-rw} ${y0 - 14} L${rw} ${y0 - 14} L${tw} ${y0 - 22} L${-tw} ${y0 - 22} Z" fill="#f05a3c" ${ST}/>`;
    }).join('') + `<path d="M0 -54 V-68" ${ST}/><circle cx="0" cy="-70" r="3.5" fill="#ffd93b" ${ST}/>
      <rect x="-5" y="-4" width="10" height="12" fill="#ffd93b" ${ST}/>`,
    vn: () => `
      <path d="M-4 -2 L-4 -52 Q22 -34 26 -4 Z" fill="#ffd93b" ${ST}/>
      <path d="M-4 -46 Q6 -38 10 -30 M-4 -34 Q10 -26 16 -18" fill="none" ${ST}/>
      <path d="M-42 -4 L42 -4 Q32 10 0 10 Q-32 10 -42 -4 Z" fill="#f05a3c" ${ST}/>
      <path d="M-46 -40 Q-30 -30 -14 -40" fill="none" ${ST}/>
      <ellipse cx="-38" cy="-30" rx="5" ry="7" fill="#f05a3c" ${ST}/>
      <ellipse cx="-22" cy="-30" rx="5" ry="7" fill="#ffd93b" ${ST}/>`,
    th: () => `
      <rect x="-26" y="-2" width="52" height="10" fill="#fff" ${ST}/>
      <rect x="-19" y="-10" width="38" height="8" fill="#ffc21a" ${ST}/>
      <path d="M-16 -10 Q-16 -34 0 -38 Q16 -34 16 -10 Z" fill="#ffc21a" ${ST}/>
      <path d="M-5 -36 L0 -80 L5 -36 Z" fill="#ffc21a" ${ST}/>
      <path d="M-4 -48 H4 M-3 -58 H3" ${ST}/>
      ${palm(34, .8)}`,
    my: () => `
      <path d="M-28 8 V-56 L-24 -64 L-20 -84 L-16 -64 L-12 -56 V8 Z" fill="#d8eefb" ${ST}/>
      <path d="M12 8 V-56 L16 -64 L20 -84 L24 -64 L28 -56 V8 Z" fill="#d8eefb" ${ST}/>
      <path d="M-28 -40 H-12 M-28 -24 H-12 M-28 -8 H-12 M12 -40 H28 M12 -24 H28 M12 -8 H28" ${ST}/>
      <rect x="-12" y="-36" width="24" height="6" fill="#f05a3c" ${ST}/>`,
    bn: () => `
      <rect x="-30" y="-12" width="60" height="20" fill="#fff" ${ST}/>
      <path d="M-8 8 V0 Q0 -8 8 0 V8" fill="#2aa4e0" ${ST}/>
      <path d="M-18 -12 Q-20 -40 0 -46 Q20 -40 18 -12 Z" fill="#ffc21a" ${ST}/>
      <path d="M0 -46 V-56" ${ST}/><circle cx="0" cy="-58" r="3" fill="#ffc21a" ${ST}/>
      <rect x="-42" y="-40" width="8" height="48" fill="#fff" ${ST}/><path d="M-43 -40 L-38 -52 L-33 -40 Z" fill="#ffc21a" ${ST}/>
      <rect x="34" y="-40" width="8" height="48" fill="#fff" ${ST}/><path d="M33 -40 L38 -52 L43 -40 Z" fill="#ffc21a" ${ST}/>`,
    in: () => `
      <rect x="-34" y="-6" width="68" height="14" fill="#fff" ${ST}/>
      <rect x="-20" y="-28" width="40" height="22" fill="#fff" ${ST}/>
      <path d="M-7 -6 V-16 Q0 -24 7 -16 V-6 Z" fill="#2aa4e0" ${ST}/>
      <path d="M-16 -28 Q-24 -52 0 -60 Q24 -52 16 -28 Z" fill="#fff" ${ST}/>
      <path d="M0 -60 V-70" ${ST}/>
      <rect x="-44" y="-40" width="7" height="48" fill="#fff" ${ST}/><circle cx="-40.5" cy="-43" r="5" fill="#fff" ${ST}/>
      <rect x="37" y="-40" width="7" height="48" fill="#fff" ${ST}/><circle cx="40.5" cy="-43" r="5" fill="#fff" ${ST}/>`,
    lk: () => `
      ${palm(-36, .85, -1)}
      <rect x="-26" y="0" width="52" height="8" fill="#fff" ${ST}/>
      <path d="M-22 0 Q-22 -32 0 -34 Q22 -32 22 0 Z" fill="#fff" ${ST}/>
      <rect x="-6" y="-42" width="12" height="8" fill="#fff" ${ST}/>
      <path d="M-4 -42 L0 -66 L4 -42 Z" fill="#ffc21a" ${ST}/>
      <path d="M-14 -10 H14" stroke="#f05a3c" stroke-width="3"/>`,
    ae: () => `
      <rect x="-44" y="-14" width="18" height="22" fill="#ffd93b" ${ST}/>
      <rect x="26" y="-22" width="18" height="30" fill="#fff" ${ST}/>
      <path d="M-14 8 L-10 -14 L-7 -42 L-4 -70 L0 -96 L4 -70 L7 -42 L10 -14 L14 8 Z" fill="#d8eefb" ${ST}/>
      <path d="M-10 -14 H10 M-7 -42 H7 M-4 -70 H4" ${ST}/>`,
    mn: () => `
      <path d="M-52 8 L-34 -24 L-18 8 Z" fill="#a8dd8a" ${ST}/>
      <path d="M-30 8 V-10 H30 V8 Z" fill="#fff" ${ST}/>
      <rect x="-30" y="-6" width="60" height="5" fill="#f05a3c" ${ST}/>
      <path d="M-34 -10 Q0 -36 34 -10 Z" fill="#2aa4e0" ${ST}/>
      <circle cx="0" cy="-28" r="4" fill="#ffd93b" ${ST}/>
      <rect x="-6" y="-2" width="12" height="10" fill="#ffd93b" ${ST}/>`,
    eu: () => `
      <path d="M-50 -56 Q-25 -76 0 -58 T50 -62 L50 -46 Q25 -60 0 -42 T-50 -40 Z" fill="#7ee0b0" opacity=".85"/>
      <path d="M-46 -62 Q-22 -80 4 -64 T50 -70" fill="none" stroke="#2aa4e0" stroke-width="3" opacity=".6"/>
      ${house(-40, 22, 22, '#f05a3c')}${house(-12, 24, 30, '#ffd93b')}${house(18, 22, 20, '#2aa4e0')}`,
    ph: () => `
      ${palm(-30, 1)}${palm(-10, .75, -1)}
      <path d="M20 -26 Q38 -44 56 -26 Z" fill="#f05a3c" ${ST}/>
      <path d="M32 -26 Q38 -42 44 -26" fill="#fff" ${ST}/>
      <path d="M38 -26 V8" ${ST}/>
      <path d="M18 8 Q30 2 44 8" fill="#ffd93b" ${ST}/>`,
  };

  /* ---------------- layout & board ---------------- */
  function buildBoard() {
    const start = { id: 'tw', name: '台灣', en: 'TAIPEI', color: INK, start: true, items: [] };
    state.islands = [start, ...state.countries];
    if (!state.gaps || state.gaps.length !== state.islands.length) {
      state.gaps = state.islands.map(() => randInt(CFG.GAP_MIN, CFG.GAP_MAX));
    }
    state.nodes = [];
    let dotNo = 0;
    state.islands.forEach((isl, i) => {
      isl.node = state.nodes.length;
      state.nodes.push({ type: 'island', island: isl });
      for (let k = 0; k < state.gaps[i]; k++) {
        // 幸運貝殼和機會卡沿航線交錯排列，平均分布
        const kind = dotNo++ % 2 ? 'chance' : 'good';
        state.nodes.push({ type: 'dot', seg: i, k, kind });
      }
    });
  }

  const isPortrait = () => window.innerWidth < 820 || window.innerWidth < window.innerHeight * 1.05;

  function computeLayout() {
    const portrait = isPortrait();
    const W = portrait ? 720 : 1600;
    const H = portrait ? 1560 : 1000;
    const r = portrait ? 54 : 60;
    const cx = W / 2, cy = H / 2;
    const a = portrait ? W * 0.37 : W * 0.41;
    const b = portrait ? H * 0.425 : H * 0.37;

    // 圓角方形（superellipse）航線，等距放置島嶼
    const N = 1600, pts = [], cum = [0];
    for (let i = 0; i <= N; i++) {
      const t = Math.PI / 2 + (i / N) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      pts.push([cx + a * Math.sign(c) * Math.sqrt(Math.abs(c)), cy + b * Math.sign(s) * Math.sqrt(Math.abs(s))]);
      if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[N];
    const m = state.islands.length;
    let j = 0;
    const islandPos = state.islands.map((isl, i) => {
      const target = (total * i) / m;
      while (j < N && cum[j] < target) j++;
      const [x, y] = pts[j];
      const jitter = (i % 2 ? 1 : -1) * (portrait ? 10 : 18);
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
      return { x: x + (dx / d) * jitter, y: y + (dy / d) * jitter };
    });

    // 島與島之間的弧線及步數點
    const segs = state.islands.map((isl, i) => {
      const A = islandPos[i], B = islandPos[(i + 1) % m];
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
      const wig = (i % 2 ? 1 : -1) * len * 0.16;
      const C = { x: mx + nx * wig, y: my + ny * wig };
      const sample = [], sc = [0];
      for (let k = 0; k <= 80; k++) {
        const t = k / 80, u = 1 - t;
        sample.push({ x: u * u * A.x + 2 * u * t * C.x + t * t * B.x, y: u * u * A.y + 2 * u * t * C.y + t * t * B.y });
        if (k) sc.push(sc[k - 1] + Math.hypot(sample[k].x - sample[k - 1].x, sample[k].y - sample[k - 1].y));
      }
      const L = sc[80];
      const at = (dist) => { let k = 0; while (k < 80 && sc[k] < dist) k++; return sample[k]; };
      const g = state.gaps[i];
      const from = r + 30, to = L - r - 30;
      const dots = [];
      for (let k = 0; k < g; k++) dots.push(at(g === 1 ? (from + to) / 2 : from + ((to - from) * k) / (g - 1)));
      return { A, B, C, dots };
    });

    state.nodes.forEach((n) => {
      if (n.type === 'island') {
        const p = islandPos[state.islands.indexOf(n.island)];
        n.x = p.x; n.y = p.y;
      } else {
        const p = segs[n.seg].dots[n.k];
        n.x = p.x; n.y = p.y;
      }
    });

    // 中央面板可用區域（航線內側）
    const inner = portrait
      ? { x: cx - a + r + 40, y: cy - b + r + 70, w: (a - r - 40) * 2, h: (b - r - 70) * 2 }
      : { x: cx - a + r + 70, y: cy - b + r + 50, w: (a - r - 70) * 2, h: (b - r - 50) * 2 };

    state.layout = { portrait, W, H, r, cx, cy, islandPos, segs, inner, dotR: 15 };
  }

  /* ---------------- rendering ---------------- */
  function blobPath(cx, cy, r, seed, k = 1) {
    const rnd = seeded(seed * 97 + 13);
    const n = 9, p = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const rr = r * k * (0.86 + rnd() * 0.22);
      p.push([cx + Math.cos(ang) * rr * 1.12, cy + Math.sin(ang) * rr * 0.86]);
    }
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }

  function islandSVG(isl, i, x, y, r) {
    const tops = ['#ffe066', '#c6e8a0', '#ffe9a8', '#bfe3a0'];
    const cliffs = ['#e3b53a', '#8cc46a', '#e3c068', '#86bf6a'];
    const top = isl.start ? '#ffffff' : tops[i % tops.length];
    const cliff = isl.start ? '#c9d6ee' : cliffs[i % cliffs.length];
    const s = r / 62;
    const labelW = Math.max(84, isl.name.length * 24 + 30) * s;
    const ly = y + r * 0.95;
    const fs = 22 * s;
    return `
    <g class="island" id="isl-${isl.id}" data-id="${isl.id}">
      <ellipse class="roulette-glow" cx="${x}" cy="${y + 8}" rx="${r * 1.55}" ry="${r * 1.25}" fill="#fff" opacity="0"/>
      <g class="target-ring">
        <ellipse cx="${x}" cy="${y + 8}" rx="${r * 1.5}" ry="${r * 1.2}" fill="none" stroke="${INK}" stroke-width="17"/>
        <ellipse cx="${x}" cy="${y + 8}" rx="${r * 1.5}" ry="${r * 1.2}" fill="none" stroke="#f05a3c" stroke-width="11"/>
      </g>
      <path d="${blobPath(x + 6, y + 18, r, i, 1.12)}" fill="${INK}" opacity=".18"/>
      <path d="${blobPath(x, y + 6, r, i, 1.12)}" fill="#fff3c4" ${ST}/>
      <path d="${blobPath(x, y + 10, r, i, 0.94)}" fill="${cliff}" ${ST}/>
      <path d="${blobPath(x, y, r, i, 0.94)}" fill="${top}" ${ST}/>
      <g transform="translate(${x} ${y + r * 0.18}) scale(${s * 0.92})">${LANDMARKS[isl.id] ? LANDMARKS[isl.id]() : ''}</g>
      <g transform="translate(${x} ${ly})">
        <rect x="${-labelW / 2}" y="${-fs * 0.85}" width="${labelW}" height="${fs * 1.6}" rx="${fs * 0.8}" fill="${isl.color}" ${ST}/>
        <text x="0" y="${fs * 0.32}" text-anchor="middle" font-size="${fs}" font-weight="900" fill="#fff" stroke="${INK}" stroke-width="${3 * s}" paint-order="stroke" style="letter-spacing:.05em">${esc(isl.start ? '出發' : isl.name)}</text>
        <text x="0" y="${fs * 1.6}" text-anchor="middle" font-size="${fs * 0.5}" font-weight="900" fill="${INK}" style="letter-spacing:.15em">${esc(isl.en)}</text>
      </g>
      ${isl.start ? '' : `<g class="dex-mark" transform="translate(${x - r * 0.95} ${y - r * 0.4})">
        <circle r="${14 * s}" fill="#f05a3c" ${ST}/>
        <path d="M${-6 * s} 0 L${-1.5 * s} ${4.5 * s} L${6.5 * s} ${-5 * s}" fill="none" stroke="#fff" stroke-width="${3.5 * s}" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`}
      <g class="target-flag" transform="translate(${x + r * 0.7} ${y - r * 0.55})">
        <path d="M0 0 V${-r * 0.9}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
        <path d="M0 ${-r * 0.9} L${r * 0.75} ${-r * 0.72} L0 ${-r * 0.52} Z" fill="#f05a3c" ${ST}/>
        <text x="${r * 0.22}" y="${-r * 0.66}" font-size="${12 * s}" font-weight="900" fill="#fff">GO</text>
      </g>
    </g>`;
  }

  function cloud(x, y, s) {
    return `<g transform="translate(${x} ${y}) scale(${s})" opacity=".95">
      <path d="M-50 10 Q-56 -12 -32 -14 Q-28 -36 -4 -30 Q10 -46 30 -28 Q54 -30 50 -6 Q64 6 46 14 Z" fill="#fff" ${ST}/></g>`;
  }
  function boat(x, y, s, color) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-22 0 L22 0 L16 10 L-16 10 Z" fill="${color}" ${ST}/>
      <path d="M-2 0 V-30 L16 -4 Z" fill="#fff" ${ST}/>
      <path d="M-30 16 q6 -4 12 0 q6 4 12 0 M8 16 q6 -4 12 0 q6 4 12 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></g>`;
  }
  function gull(x, y, s) {
    return `<path transform="translate(${x} ${y}) scale(${s})" d="M-10 0 Q-5 -6 0 0 Q5 -6 10 0" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`;
  }

  function planeSVG() {
    return `<g id="planeShadow"><ellipse cx="0" cy="0" rx="22" ry="9" fill="${INK}" opacity=".18"/></g>
    <g id="plane"><g id="planeBody">
      <path d="M-2 -4 L-12 -27 L-4 -27 L12 -4 Z" fill="#f05a3c" ${ST}/>
      <path d="M-2 4 L-12 27 L-4 27 L12 4 Z" fill="#f05a3c" ${ST}/>
      <path d="M-18 -3 L-26 -13 L-21 -13 L-12 -3 Z" fill="#2aa4e0" ${ST}/>
      <path d="M-18 3 L-26 13 L-21 13 L-12 3 Z" fill="#2aa4e0" ${ST}/>
      <path d="M-26 0 Q-26 -7 -10 -7 L18 -6 Q28 -4 28 0 Q28 4 18 6 L-10 7 Q-26 7 -26 0 Z" fill="#fff" ${ST}/>
      <path d="M17 -3.5 Q23 -2.5 23 0 Q23 2.5 17 3.5 Z" fill="#2aa4e0"/>
      <path d="M-6 0 H10" stroke="#ffd93b" stroke-width="3" stroke-linecap="round"/>
    </g></g>`;
  }

  function render() {
    const L = state.layout;
    const svg = $('#map');
    svg.setAttribute('viewBox', `0 0 ${L.W} ${L.H}`);

    const segPaths = L.segs.map((sg) =>
      `<path d="M${sg.A.x} ${sg.A.y} Q${sg.C.x} ${sg.C.y} ${sg.B.x} ${sg.B.y}" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="1 14" stroke-linecap="round" opacity=".9"/>`).join('');

    const dots = state.nodes.map((n, i) => {
      if (n.type !== 'dot') return '';
      if (n.kind === 'chance') {
        return `<g id="node-${i}">
          <circle cx="${n.x}" cy="${n.y}" r="${L.dotR}" fill="#f05a3c" ${ST}/>
          <text x="${n.x}" y="${n.y + L.dotR * 0.42}" text-anchor="middle" font-size="${L.dotR * 1.25}" font-weight="900" fill="#fff">?</text></g>`;
      }
      return `<g id="node-${i}">
        <circle cx="${n.x}" cy="${n.y}" r="${L.dotR}" fill="#ffd93b" ${ST}/>
        <g transform="translate(${n.x} ${n.y}) scale(${L.dotR / 12})">${SHELL_PATHS}</g></g>`;
    }).join('');

    const islands = state.islands.map((isl, i) => islandSVG(isl, i, L.islandPos[i].x, L.islandPos[i].y, L.r)).join('');

    const deco = L.portrait
      ? cloud(70, 60, .8) + cloud(660, 1510, .9) + boat(70, 780, 1, '#f05a3c') + boat(655, 520, .9, '#2aa4e0') + gull(600, 70, 1.2) + gull(630, 95, .9) + gull(90, 1480, 1.1)
      : cloud(70, 70, 1) + cloud(1530, 940, 1.1) + cloud(1540, 60, .7) + boat(40, 500, 1.1, '#f05a3c') + boat(1565, 520, 1, '#2aa4e0') + gull(1450, 50, 1.3) + gull(1485, 80, 1) + gull(120, 950, 1.2);

    svg.innerHTML = `
      <defs>
        <pattern id="waves" width="80" height="44" patternUnits="userSpaceOnUse">
          <path d="M8 14 q8 -7 16 0 q8 7 16 0" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M48 36 q8 -7 16 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2.5" stroke-linecap="round"/>
        </pattern>
      </defs>
      <rect width="${L.W}" height="${L.H}" fill="#8fd3f4"/>
      <rect width="${L.W}" height="${L.H}" fill="url(#waves)"/>
      ${deco}${segPaths}${dots}${islands}
      ${planeSVG()}`;

    sizeStage();
    placePlane(state.pos, false);
    if (state.target) $(`#isl-${state.target.id}`)?.classList.add('is-target');
    markDex();
  }

  function sizeStage() {
    const L = state.layout;
    const stage = $('#stage');
    const wrap = $('#mapWrap');
    document.body.classList.toggle('portrait', L.portrait);
    let scale;
    if (L.portrait) {
      scale = stage.clientWidth / L.W;
      const hud = $('#hud');
      document.documentElement.style.setProperty('--hud-h', hud.offsetHeight + 'px');
    } else {
      scale = Math.min((stage.clientWidth - 16) / L.W, (stage.clientHeight - 16) / L.H);
    }
    state.scale = scale;
    wrap.style.width = L.W * scale + 'px';
    wrap.style.height = L.H * scale + 'px';
    const p = $('#centerPanel');
    const I = L.inner;
    Object.assign(p.style, { left: I.x * scale + 'px', top: I.y * scale + 'px', width: I.w * scale + 'px', height: I.h * scale + 'px' });
  }

  /* ---------------- plane ---------------- */
  function nodePoint(i) {
    const n = state.nodes[i];
    return n.type === 'island' ? { x: n.x, y: n.y - state.layout.r * 0.25 } : { x: n.x, y: n.y };
  }
  let planeAngle = -30;
  function setPlane(x, y, angle, lift = 0) {
    const s = state.layout.portrait ? 1.15 : 1.3;
    $('#plane').setAttribute('transform', `translate(${x} ${y - 18 - lift}) rotate(${angle}) scale(${s * (1 + lift / 60)})`);
    $('#planeShadow').setAttribute('transform', `translate(${x + 6} ${y + 10}) scale(${s * (1 - lift / 80)})`);
  }
  function placePlane(i, follow = true) {
    const p = nodePoint(i);
    const next = nodePoint((i + state.dir + state.nodes.length) % state.nodes.length);
    planeAngle = Math.atan2(next.y - p.y, next.x - p.x) * 180 / Math.PI;
    setPlane(p.x, p.y, planeAngle);
    if (follow) followCamera(p.y);
  }
  function animateStep(from, to, dur = 320, liftH = 14) {
    return new Promise((resolve) => {
      const a = nodePoint(from), b = nodePoint(to);
      let target = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      while (target - planeAngle > 180) target -= 360;
      while (target - planeAngle < -180) target += 360;
      const a0 = planeAngle, t0 = performance.now();
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        setPlane(b.x, b.y, target);
        planeAngle = target;
        resolve();
      };
      const tick = (now) => {
        if (finished) return;
        const t = Math.min(1, (now - t0) / dur);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const ang = a0 + (target - a0) * Math.min(1, t * 2.5);
        setPlane(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, ang, Math.sin(t * Math.PI) * liftH);
        if (t < 1) requestAnimationFrame(tick);
        else finish();
      };
      requestAnimationFrame(tick);
      // 分頁在背景時 rAF 會暫停，用計時器保證飛機一定會到位
      setTimeout(finish, dur + 120);
      followCamera(b.y);
    });
  }
  function followCamera(y) {
    if (!state.layout.portrait) return;
    const stage = $('#stage');
    const visible = stage.clientHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-h')) || 0);
    stage.scrollTo({ top: Math.max(0, y * state.scale - visible / 2), behavior: 'smooth' });
  }

  /* ---------------- HUD ---------------- */
  function distanceToTarget() {
    if (!state.target) return 0;
    const L = state.nodes.length;
    const d = (((state.target.node - state.pos) * state.dir) % L + L) % L;
    return d === 0 && state.lap ? L : d;
  }
  function updateHud() {
    $('#hudTarget').textContent = state.target ? state.target.name : '尚未抽籤';
    $('#hudDist').textContent = state.target
      ? (state.won ? '已抵達！' : `距離 ${distanceToTarget()} 步・${state.dir > 0 ? '順時針' : '逆時針'}航線`)
      : '按下按鈕抽出目的地';
    $('#hudRolls').textContent = state.rolls;
    $('#hudGoal').textContent = state.goalPrice ? 'NT$' + money(state.goalPrice) : '—';
  }
  let coinShown = 0, coinRaf = 0;
  function renderCoins(animate = true) {
    const from = coinShown, to = state.coins, t0 = performance.now();
    const bar = $('#hudBar');
    const pct = state.goalPrice ? Math.min(100, (to / state.goalPrice) * 100) : 0;
    bar.style.width = pct + '%';
    bar.classList.toggle('full', pct >= 100);
    cancelAnimationFrame(coinRaf);
    if (!animate || from === to) { coinShown = to; $('#hudCoins').textContent = money(to); return; }
    const w = $('#hudWallet');
    w.classList.remove('up', 'down'); void w.offsetWidth;
    w.classList.add(to > from ? 'up' : 'down');
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / 700);
      coinShown = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      $('#hudCoins').textContent = money(coinShown);
      if (t < 1) coinRaf = requestAnimationFrame(tick);
    };
    coinRaf = requestAnimationFrame(tick);
    // 分頁在背景時 rAF 會暫停，確保最後數字正確
    setTimeout(() => { if (state.coins === to) { coinShown = to; $('#hudCoins').textContent = money(to); } }, 800);
  }
  function floatAmount(node, delta) {
    const el = document.createElement('div');
    el.className = 'float-amt' + (delta < 0 ? ' bad' : '');
    el.textContent = (delta >= 0 ? '+' : '−') + money(Math.abs(delta));
    el.style.left = node.x * state.scale + 'px';
    el.style.top = (node.y - 34) * state.scale + 'px';
    $('#mapWrap').appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
  function setRollButton(label, enabled, pulse = false) {
    const b = $('#rollBtn');
    b.textContent = label;
    b.disabled = !enabled;
    b.classList.toggle('pulse', pulse && enabled);
  }

  /* ---------------- dice ---------------- */
  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function buildDice() {
    document.querySelectorAll('.face').forEach((f) => {
      f.innerHTML = PIPS[f.dataset.v].map((p) => `<i style="grid-area:${Math.ceil(p / 3)}/${((p - 1) % 3) + 1}"></i>`).join('');
    });
    document.querySelectorAll('.dice').forEach((d) => d.insertAdjacentHTML('afterbegin', '<b class="core"></b><b class="core c2"></b><b class="core c3"></b>'));
  }
  const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };
  let diceSpin = 0;
  async function rollDiceAnim(v, mult = 1) {
    const toss = $('#diceToss'), big = $('#diceBig'), res = $('#diceResult'), small = $('#dice');
    res.classList.remove('show');
    res.textContent = mult > 1 ? `${v} × ${mult} = ${v * mult} 點！` : `${v} 點！`;
    toss.classList.remove('go', 'out');
    toss.hidden = false;
    // 從隨機角度開始，三個軸各轉好幾圈翻滾，最後停在擲出的點數
    big.style.transition = 'none';
    big.style.transform = `rotateX(${randInt(0, 359)}deg) rotateY(${randInt(0, 359)}deg) rotateZ(${randInt(0, 359)}deg)`;
    void big.offsetWidth;
    toss.classList.add('go');
    diceSpin += 4;
    const [rx, ry] = FACE_ROT[v];
    const final = `rotateX(${rx - 24 + diceSpin * 360}deg) rotateY(${ry + 32 + (diceSpin + 1) * 360}deg) rotateZ(${diceSpin * 360}deg)`;
    big.style.transition = '';
    big.style.transform = final;
    small.style.transform = final;
    small.parentElement.classList.add('rolling');
    await sleep(1600);
    small.parentElement.classList.remove('rolling');
    res.classList.add('show');
    await sleep(800);
    toss.classList.add('out');
    await sleep(260);
    toss.hidden = true;
    toss.classList.remove('go', 'out');
  }

  /* ---------------- modal / toast / confetti ---------------- */
  let modalResolve = null;
  function openModal(html, { closable = true } = {}) {
    const m = $('#modal'), card = $('#modalCard');
    card.innerHTML = (closable ? '<button class="close-x" type="button" data-close aria-label="關閉">✕</button>' : '') + html;
    m.hidden = false;
    card.scrollTop = 0;
    setTimeout(() => card.querySelector('[data-focus]')?.focus({ preventScroll: true }), 50);
    return new Promise((res) => { modalResolve = res; });
  }
  function closeModal(value) {
    $('#modal').hidden = true;
    const r = modalResolve; modalResolve = null;
    r && r(value);
  }
  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal('close');
    const v = e.target.closest('[data-value]');
    if (v) closeModal(v.dataset.value);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden && $('#modalCard .close-x')) closeModal('close');
  });

  let toastTimer;
  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function confetti() {
    const box = $('#confetti');
    const colors = ['#ffd93b', '#f05a3c', '#2aa4e0', '#5cbf6b', '#fff'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = pick(colors);
      c.style.animationDuration = 2.2 + Math.random() * 2 + 's';
      c.style.animationDelay = Math.random() * .6 + 's';
      c.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
      box.appendChild(c);
    }
    setTimeout(() => (box.innerHTML = ''), 5000);
  }

  function miniIcon(id) {
    return `<svg class="head-icon" viewBox="-60 -100 120 120" aria-hidden="true">${LANDMARKS[id] ? LANDMARKS[id]() : ''}</svg>`;
  }

  /* ---------------- share ---------------- */
  function shareText(item) {
    return `【華府旅行社】${item.name.replace(/\s*\n\s*/g, ' ')}｜${item.ptype ? item.ptype + ' ' : ''}${fmtPrice(item.price)}`;
  }
  function shareButtons(item) {
    const url = safeLink(item.link);
    const enc = encodeURIComponent;
    return `<div class="share-row"><span>分享</span>
      <a class="share-btn fb" href="https://www.facebook.com/sharer/sharer.php?u=${enc(url)}" target="_blank" rel="noopener">Facebook</a>
      <a class="share-btn line" href="https://social-plugins.line.me/lineit/share?url=${enc(url)}&text=${enc(shareText(item))}" target="_blank" rel="noopener">LINE</a>
      <button class="share-btn" type="button" data-copy>複製連結</button>
      ${navigator.share ? '<button class="share-btn" type="button" data-native>更多…</button>' : ''}
    </div>`;
  }
  function bindShare(card, item) {
    const url = safeLink(item.link);
    card.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${shareText(item)}\n${url}`); toast('已複製行程連結！'); }
      catch (e) { window.prompt('複製以下連結：', url); }
    });
    card.querySelector('[data-native]')?.addEventListener('click', () => {
      navigator.share({ title: '華府旅行社', text: shareText(item), url }).catch(() => {});
    });
  }

  /* ---------------- itinerary popup ---------------- */
  function tripHTML(country, item, notice, stamp) {
    return `
      <div class="modal-head" style="background:${country.color}">
        <p class="eyebrow">✈ 飛越 ${esc(country.en)}</p>
        <h2>${esc(country.name)}</h2>
        ${miniIcon(country.id)}
        ${stamp ? '<span class="stamp-badge">圖鑑<br>+1</span>' : ''}
      </div>
      <div class="modal-body">
        ${stamp ? `<p class="notice stamp-notice">📖 「${esc(country.name)}」收進島嶼圖鑑！目前 ${stamp.n} / ${stamp.total} 國</p>` : ''}
        ${notice ? `<p class="notice">${notice}</p>` : ''}
        <div class="chips"><span class="chip cat">${esc(item.cat)}</span><span class="chip">${esc(item.region)}</span></div>
        <h3 class="trip-name">${esc(item.name)}</h3>
        ${item.feature ? `<p class="trip-feature">★ ${esc(item.feature)}</p>` : ''}
        <dl class="trip-info">
          <dt>出發日期</dt><dd>${esc(item.dates || '請洽詢')}</dd>
          <dt>優惠價</dt><dd><span class="trip-price"><small>${esc(item.ptype)}</small>${esc(fmtPrice(item.price))}</span></dd>
        </dl>
        <div class="btn-row">
          <a class="btn btn-red" href="${esc(safeLink(item.link))}" target="_blank" rel="noopener">查看行程詳情</a>
          <button class="btn btn-sm" type="button" data-another>換一個行程</button>
        </div>
        ${shareButtons(item)}
        <button class="btn btn-primary btn-block" type="button" data-close data-focus>繼續飛行 ✈</button>
      </div>`;
  }
  function showTrip(country, notice, stamp) {
    let item = pick(country.items);
    const p = openModal(tripHTML(country, item, notice, stamp));
    const bind = () => {
      const card = $('#modalCard');
      bindShare(card, item);
      card.querySelector('[data-another]').addEventListener('click', () => {
        if (country.items.length > 1) {
          let next; do { next = pick(country.items); } while (next === item);
          item = next;
        }
        card.innerHTML = '<button class="close-x" type="button" data-close aria-label="關閉">✕</button>' + tripHTML(country, item, notice, stamp);
        bind();
      });
    };
    bind();
    return p;
  }

  /* ---------------- game flow ---------------- */
  function showRules(first = false) {
    const n = state.countries.length;
    const html = `
      <div class="modal-head" style="background:var(--blue)">
        <p class="eyebrow">HOW TO PLAY</p>
        <h2>遊戲說明</h2>
        ${miniIcon('tw')}
      </div>
      <div class="modal-body">
        ${legendHTML()}
        <ol class="rules">
          <li>抽出本局的<b>目的地</b>。</li>
          <li>擲骰子前進，沿航線飛到<b>目的地</b>。</li>
          <li>停在貝殼<b>賺${COIN}</b>，停在「？」抽<b>機會卡</b>。</li>
          <li>抵達時${COIN}夠買行程，就能參加<b>抽獎</b>！</li>
        </ol>
        <button class="btn btn-primary btn-block" type="button" data-close data-focus>${first ? '開始冒險！' : '我知道了'}</button>
      </div>`;
    return openModal(html);
  }

  async function drawTarget() {
    if (state.busy) return;
    state.busy = true;
    setRollButton('抽籤中…', false);
    document.querySelectorAll('.island.is-target').forEach((e) => e.classList.remove('is-target'));
    const list = state.countries;
    const L = state.nodes.length;
    const shortest = (c) => { const f = ((c.node - state.pos) % L + L) % L; return Math.min(f, L - f); };
    const far = list.filter((c) => shortest(c) >= L * CFG.TARGET_MIN_DIST);
    const final = pick(far.length ? far : list);
    let idx = randInt(0, list.length - 1);
    const steps = list.length * 2 + ((list.indexOf(final) - idx) % list.length + list.length) % list.length;
    let delay = 50;
    for (let s = 0; s < steps; s++) {
      idx = (idx + 1) % list.length;
      const el = $(`#isl-${list[idx].id}`);
      el.classList.add('is-roulette');
      await sleep(delay);
      el.classList.remove('is-roulette');
      if (s > steps - 10) delay *= 1.22;
    }
    state.target = final;
    state.lap = false;
    state.badCards = 0;
    state.doubleNext = false;
    const priced = final.items.map((it) => ({ it, p: parsePrice(it.price) })).filter((x) => x.p > 0).sort((a, b) => a.p - b.p);
    const goal = priced[0] || { it: final.items[0], p: 20000 };
    state.goalItem = goal.it;
    state.goalPrice = goal.p;
    state.coins = CFG.START_COINS;
    renderCoins(false);
    $(`#isl-${final.id}`).classList.add('is-target');
    const fwd = ((final.node - state.pos) % L + L) % L;
    state.dir = fwd <= L - fwd ? 1 : -1;
    placePlane(state.pos);
    updateHud();
    await openModal(`
      <div class="modal-head" style="background:${final.color}">
        <p class="eyebrow">本局目的地</p>
        <h2>命運之島</h2>
        ${miniIcon(final.id)}
      </div>
      <div class="modal-body">
        <div class="big-target"><div class="name">${esc(final.name)}</div><div class="en">${esc(final.en)}</div></div>
        <div class="goal-box">目標行程：<b>${esc(state.goalItem.name.split('\n')[0])}</b><br>
          行程價格 <b>NT$${money(state.goalPrice)}</b>，起始${COIN} <b>${money(state.coins)}</b>，沿途撿貝殼存到 <b>${money(state.goalPrice)}</b> 吧！</div>
        ${legendHTML()}
        <p class="notice">距離 ${distanceToTarget()} 步！飛到「${esc(final.name)}」就會停下來，${COIN}足夠就能出發喔。</p>
        <button class="btn btn-primary btn-block" type="button" data-close data-focus>出發！</button>
      </div>`);
    state.busy = false;
    setRollButton('擲骰子', true, true);
    followCamera(nodePoint(state.pos).y);
  }

  async function roll() {
    if (state.busy || !state.target || state.won) return;
    state.busy = true;
    setRollButton('飛行中…', false);
    const v = randInt(1, 6);
    const mult = state.doubleNext ? 2 : 1;
    state.doubleNext = false;
    const n = v * mult;
    await rollDiceAnim(v, mult);
    state.rolls++;
    updateHud();
    await sleep(150);
    await fly(n);
    if (state.grandPending) { state.grandPending = false; await showGrand(); }
    state.busy = false;
    if (state.relayoutPending) { state.relayoutPending = false; relayout(); }
    if (!state.won) setRollButton('擲骰子', true, true);
  }

  // opts.backward：往反方向退；opts.noChance：這次落點不再抽機會卡（避免連鎖）
  async function fly(n, opts = {}) {
    const L = state.nodes.length;
    const step = opts.backward ? -state.dir : state.dir;
    for (let s = 1; s <= n; s++) {
      const from = state.pos;
      state.pos = ((state.pos + step) % L + L) % L;
      await animateStep(from, state.pos);
      state.lap = false;
      updateHud();
      const node = state.nodes[state.pos];
      // 飛到目的地就停下來
      if (node.type === 'island' && node.island === state.target) return arriveTarget(n - s);
      if (s === n) return landOn(node, opts);
      if (node.type === 'island') {
        if (node.island.start) toast('飛越台灣出發站，繼續前進！');
        else await showTrip(node.island, `途經 ${node.island.name}，順路看看精選行程吧！`);
      }
    }
  }

  async function landOn(node, opts = {}) {
    if (node.type === 'island') {
      if (node.island.start) { toast('回到台灣出發站，補給一下繼續飛！'); await sleep(600); return; }
      return showTrip(node.island, null, collect(node.island));
    }
    if (node.kind === 'chance') {
      if (opts.noChance) { toast('這回合已經抽過機會卡囉～'); await sleep(700); return; }
      return drawChance();
    }
    return landOnDot(node);
  }

  async function arriveTarget(left) {
    const stamp = collect(state.target);
    const msgs = [];
    if (left > 0) msgs.push(`抵達目的地！剩下 ${left} 步不用飛了`);
    if (stamp) msgs.push(`「${state.target.name}」收進島嶼圖鑑 (${stamp.n}/${stamp.total})`);
    if (msgs.length) toast(msgs.join('・'), 2600);
    await sleep(700);
    if (state.coins >= state.goalPrice) return win();
    state.lap = true;
    updateHud();
    await notEnough();
  }

  /* ---------------- 機會卡 ---------------- */
  const CARDS = [
    { id: 'wind', good: true, title: '順風飛行', icon: '+3' },
    { id: 'jet', good: true, title: '噴射氣流', icon: '✈' },
    { id: 'double', good: true, title: '幸運加倍', icon: '×2' },
    { id: 'back', good: false, title: '逆風倒退', icon: '−N' },
    { id: 'wallet', good: false, title: '弄丟錢包', icon: '$' },
    { id: 'reverse', good: false, title: '反方向飛', icon: '⇄' },
    { id: 'gull', good: false, title: '調皮海鷗', icon: '' },
  ];
  async function drawChance() {
    // 壞卡每局最多 BAD_CARD_MAX 次，用完後只會抽到好卡
    // 調皮海鷗是一般事件，不算在壞卡次數裡
    // 離目的地很近時不會抽到「反方向飛」
    const pool = (state.badCards < CFG.BAD_CARD_MAX ? CARDS : CARDS.filter((c) => c.good || c.id === 'gull'))
      .filter((c) => c.id !== 'reverse' || distanceToTarget() > CFG.REVERSE_SAFE);
    const card = pick(pool);
    if (!card.good && card.id !== 'gull') state.badCards++;
    let desc, icon = card.icon, after;
    switch (card.id) {
      case 'wind':
        desc = '順風助攻！再往前飛 3 步。';
        after = () => fly(3, { noChance: true });
        break;
      case 'jet':
        desc = '搭上噴射氣流，選一座島直接飛過去（目的地除外）！';
        after = jetTo;
        break;
      case 'double':
        desc = '下一次擲出的點數加倍！';
        after = async () => { state.doubleNext = true; toast('下一擲點數 ×2！'); };
        break;
      case 'back': {
        const k = randInt(1, 3);
        icon = `−${k}`;
        desc = `遇到逆風，退回 ${k} 步。`;
        after = () => fly(k, { backward: true, noChance: true });
        break;
      }
      case 'wallet': {
        const amt = Math.min(state.coins, goalPart(CFG.WALLET_LOSS));
        desc = amt ? `一不小心弄丟錢包，掉了 ${money(amt)} ${COIN}！` : '錢包弄丟了…還好裡面是空的！';
        after = async () => {
          if (!amt) return;
          state.coins -= amt;
          floatAmount(state.nodes[state.pos], -amt);
          renderCoins();
          await sleep(900);
        };
        break;
      }
      case 'gull': {
        const amt = Math.min(state.coins, goalPart(CFG.GULL_LOSS));
        desc = amt ? `調皮海鷗飛過來，叼走了 ${money(amt)} ${COIN}！` : `調皮海鷗想搶${COIN}，但你的口袋空空～`;
        after = async () => {
          if (!amt) return;
          state.coins -= amt;
          floatAmount(state.nodes[state.pos], -amt);
          renderCoins();
          await sleep(900);
        };
        break;
      }
      case 'reverse':
        desc = '颱風來了！航線掉頭，改往反方向飛。';
        after = async () => {
          state.dir *= -1;
          placePlane(state.pos);
          updateHud();
          toast(`改為${state.dir > 0 ? '順時針' : '逆時針'}航線！`);
          await sleep(700);
        };
        break;
    }
    await openModal(`
      <div class="modal-body chance-body">
        <p class="chance-title">抽到機會卡！</p>
        <div class="chance-card ${card.good ? 'good' : 'bad'}">
          <div class="cc-inner">
            <div class="cc-back"><span>?</span><small>CHANCE</small></div>
            <div class="cc-front">
              <div class="cc-icon">${card.id === 'gull' ? gullIcon() : esc(icon)}</div>
              <h3>${esc(card.title)}</h3>
              <p>${esc(desc)}</p>
            </div>
          </div>
        </div>
        <button class="btn ${card.good ? 'btn-primary' : 'btn-blue'} btn-block" type="button" data-close data-focus>${card.good ? '太棒了！' : '好吧…'}</button>
      </div>`, { closable: false });
    await after();
  }

  async function jetTo() {
    const options = state.countries.filter((c) => c !== state.target);
    const id = await openModal(`
      <div class="modal-head" style="background:var(--blue)">
        <p class="eyebrow">JET STREAM</p>
        <h2>要飛去哪座島？</h2>
        ${miniIcon('tw')}
      </div>
      <div class="modal-body">
        <p class="notice">選一座島直接飛過去！挑還沒收集的島，可以補齊島嶼圖鑑喔。</p>
        <div class="jet-grid">${options.map((c, i) => `
          <button class="jet-btn ${dex[c.id] ? 'got' : ''}" type="button" data-value="${c.id}" ${i ? '' : 'data-focus'}>
            <svg viewBox="-60 -100 120 120" aria-hidden="true">${LANDMARKS[c.id] ? LANDMARKS[c.id]() : ''}</svg>
            <b>${esc(c.name)}</b><small>${dex[c.id] ? '已收集' : '未收集'}</small>
          </button>`).join('')}
        </div>
      </div>`, { closable: false });
    const isl = options.find((c) => c.id === id);
    if (!isl) return;
    const from = state.pos;
    state.pos = isl.node;
    await animateStep(from, state.pos, 1300, 80);
    updateHud();
    return landOn(state.nodes[state.pos], { noChance: true });
  }

  async function landOnDot(node) {
    // 依「還差多少」和「離目的地多遠」計算，讓多數玩家第一次抵達就夠錢
    const need = Math.max(0, state.goalPrice - state.coins);
    const shellsLeft = Math.max(1, distanceToTarget() / CFG.SHELL_EVERY);
    const [a, b] = CFG.COIN_GAIN;
    const amt = Math.max(goalPart([CFG.SHELL_MIN, CFG.SHELL_MIN]), Math.round((need * (a + Math.random() * (b - a))) / shellsLeft / 500) * 500);
    state.coins += amt;
    toast(`撿到幸運貝殼！+${money(amt)} ${COIN}`);
    floatAmount(node, amt);
    renderCoins();
    await sleep(900);
  }

  function miniTrip(item) {
    return `<div class="mini-trip">
      <div><b>${esc(item.name)}</b><span>${esc(item.ptype)} ${esc(fmtPrice(item.price))}</span></div>
      <a class="btn btn-sm btn-red" href="${esc(safeLink(item.link))}" target="_blank" rel="noopener">看行程</a>
    </div>`;
  }

  function notEnough() {
    const short = state.goalPrice - state.coins;
    return openModal(`
      <div class="modal-head" style="background:var(--blue)">
        <p class="eyebrow">ALMOST THERE</p>
        <h2>還差一點點！</h2>
        ${miniIcon(state.target.id)}
      </div>
      <div class="modal-body">
        <p class="notice">抵達${esc(state.target.name)}了！但${COIN}只有 <b>${money(state.coins)}</b>，購買行程還差 <b>${money(short)}</b>。<br>繼續擲骰子再飛一圈，沿途收集幸運貝殼吧！</p>
        ${miniTrip(state.goalItem)}
        <button class="btn btn-primary btn-block" type="button" data-close data-focus>再飛一圈 ✈</button>
      </div>`);
  }

  async function win() {
    state.won = true;
    setRollButton('已抵達！', false);
    updateHud();
    confetti();
    const country = state.target;
    const item = state.goalItem;
    const html = `
      <div class="modal-head" style="background:var(--red)">
        <p class="eyebrow">MISSION COMPLETE</p>
        <h2>抵達${esc(country.name)}！</h2>
        ${miniIcon(country.id)}
      </div>
      <div class="modal-body" id="winBody">
        <p class="notice">🎉 您有足夠金額購買行程，現在就出發！<br>
          ${COIN} ${money(state.coins)}，共擲了 ${state.rolls} 次骰子，獲得抽獎資格！<br>${esc(CFG.PRIZE_TEXT)}</p>
        ${miniTrip(item)}
        <div id="entryBox"></div>
      </div>`;
    const p = openModal(html);
    setupEntry($('#entryBox'), 'normal', { target: country.name, rolls: state.rolls });
    await p;
    newRound();
  }

  function entryDone(box, msg, closeLabel) {
    const link = { name: '飛吧！華府島嶼大冒險', ptype: '', price: '擲骰子環遊世界抽好禮', link: location.href.split('#')[0] };
    box.innerHTML = `
      <p class="notice">${msg}</p>
      <p>分享給朋友一起來玩：</p>
      ${shareButtons(link)}
      <button class="btn btn-primary btn-block" type="button" data-close data-focus>${closeLabel}</button>`;
    bindShare(box, link);
  }
  // 抽獎登記：填過資料就自動帶入，不用重填
  async function setupEntry(box, type, extra, closeLabel = '再玩一局') {
    const send = (info) => submitEntry({ ...info, ...extra, prize: PRIZES[type], dex: dexCount() });
    if (player && player.entered?.[type]) {
      entryDone(box, `✅ ${maskName(player.name)}（${maskPhone(player.phone)}）已經登記過${PRIZES[type]}，不用重複填寫，祝你中獎！`, closeLabel);
      return;
    }
    if (player) {
      box.innerHTML = '<p class="notice">登記中…</p>';
      try {
        await send(player);
        savePlayer(player, type);
        entryDone(box, `✅ 已用 ${maskName(player.name)}（${maskPhone(player.phone)}）的資料登記${PRIZES[type]}，不用重新填寫！`, closeLabel);
        box.insertAdjacentHTML('beforeend', '<button class="link-btn" type="button" data-other>不是你？換人填寫</button>');
        box.querySelector('[data-other]').addEventListener('click', () => { forgetPlayer(); setupEntry(box, type, extra, closeLabel); });
        return;
      } catch (err) { /* 送出失敗就改用表單 */ }
    }
    box.innerHTML = `
      <form class="form" id="entryForm" novalidate>
        <div class="field"><label for="fName">姓名</label><input id="fName" name="name" type="text" autocomplete="name" maxlength="30" required data-focus><div class="err">請填寫姓名</div></div>
        <div class="field"><label for="fPhone">手機</label><input id="fPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="09xxxxxxxx" maxlength="10" required><div class="err">請填寫正確的手機號碼（09 開頭 10 碼）</div></div>
        <div class="field"><label for="fEmail">Email</label><input id="fEmail" name="email" type="email" autocomplete="email" maxlength="80" required><div class="err">請填寫正確的 Email</div></div>
        <div class="field"><label class="check"><input type="checkbox" name="agree" id="fAgree"> 我同意華府旅行社蒐集上述資料，用於本次抽獎聯繫及旅遊優惠通知。</label><div class="err">請勾選同意</div></div>
        <button class="btn btn-red btn-block" type="submit">送出參加${PRIZES[type]}</button>
      </form>`;
    const form = box.querySelector('#entryForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const checks = {
        fName: !!f.name.trim(),
        fPhone: /^09\d{8}$/.test(f.phone.trim()),
        fEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()),
        fAgree: !!f.agree,
      };
      let ok = true;
      Object.entries(checks).forEach(([id, valid]) => {
        $('#' + id).closest('.field').classList.toggle('invalid', !valid);
        if (!valid && ok) { ok = false; $('#' + id).focus(); }
      });
      if (!ok) return;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = '送出中…';
      const info = { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() };
      try {
        await send(info);
        savePlayer(info, type);
        entryDone(box, '✅ 資料已送出，祝你中獎！得獎名單將另行公布。下次抵達目的地不用再填寫。', closeLabel);
      } catch (err) {
        btn.disabled = false; btn.textContent = `送出參加${PRIZES[type]}`;
        toast('送出失敗，請稍後再試');
      }
    });
  }

  async function showGrand() {
    const html = `
      <div class="modal-head" style="background:var(--yellow)">
        <p class="eyebrow">ISLAND MASTER</p>
        <h2>環島大獎</h2>
        ${miniIcon('ae')}
      </div>
      <div class="modal-body">
        <p class="notice">🏆 島嶼圖鑑 ${state.countries.length} 國全部集滿！<br>${esc(CFG.GRAND_PRIZE_TEXT)}</p>
        <div id="entryBox"></div>
      </div>`;
    const p = openModal(html);
    setupEntry($('#entryBox'), 'grand', { target: '島嶼圖鑑全收集', rolls: state.rolls }, '繼續冒險');
    await p;
  }

  async function submitEntry(data) {
    const payload = { ...data, time: new Date().toISOString(), page: location.href };
    if (CFG.ENTRY_ENDPOINT) {
      // Apps Script Web App：用 text/plain 避免 CORS 預檢
      await fetch(CFG.ENTRY_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    } else {
      try {
        const k = 'hf_island_entries';
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        arr.push(payload);
        localStorage.setItem(k, JSON.stringify(arr));
      } catch (e) { /* storage unavailable */ }
      console.info('[島嶼大冒險] 測試模式（未設定 ENTRY_ENDPOINT），抽獎資料：', payload);
      await sleep(400);
    }
  }

  function newRound() {
    document.querySelectorAll('.island.is-target').forEach((e) => e.classList.remove('is-target'));
    state.target = null;
    state.won = false;
    state.lap = false;
    state.coins = 0;
    state.goalItem = null;
    state.goalPrice = 0;
    state.badCards = 0;
    state.doubleNext = false;
    renderCoins(false);
    state.rolls = 0;
    state.pos = 0;
    state.dir = 1;
    placePlane(0);
    updateHud();
    setRollButton('抽出目的地', true, true);
  }

  function relayout() {
    if (!state.nodes.length) return; // 資料尚未載入
    computeLayout();
    render();
  }

  function showDex() {
    const n = dexCount(), total = state.countries.length;
    const tiles = state.countries.map((c) => {
      const got = dex[c.id];
      return `<div class="dex-tile ${got ? 'got' : ''}">
        <svg viewBox="-60 -100 120 120" aria-hidden="true">${LANDMARKS[c.id] ? LANDMARKS[c.id]() : ''}</svg>
        <b>${got ? esc(c.name) : '？？？'}</b><small>${got ? esc(got) : '尚未到訪'}</small>
        ${got ? '<span class="dex-stamp">到訪</span>' : ''}
      </div>`;
    }).join('');
    const rewards = (CFG.DEX_REWARDS || []).map((r) => {
      const need = r.count === 'all' ? total : r.count;
      return `<li class="${n >= need ? 'done' : ''}"><span>${r.count === 'all' ? `全部 ${need}` : need} 國</span>「${esc(r.title)}」+${money(r.coins)} ${COIN}</li>`;
    }).join('') + `<li class="grand ${n >= total ? 'done' : ''}"><span>全部 ${total} 國</span>🏆 加碼「環島大獎」抽獎資格</li>`;
    const grandBtn = n >= total && !grandDone()
      ? '<button class="btn btn-red btn-block" type="button" data-value="grand">領取環島大獎抽獎資格</button>' : '';
    return openModal(`
      <div class="modal-head" style="background:var(--green)">
        <p class="eyebrow">ISLAND COLLECTION</p>
        <h2>島嶼圖鑑</h2>
        ${miniIcon('eu')}
      </div>
      <div class="modal-body">
        <div class="dex-progress"><b>${n}</b> / ${total} 國<div class="wallet-bar"><i style="width:${(n / total) * 100}%"></i></div></div>
        <div class="dex-grid">${tiles}</div>
        <ul class="dex-rewards">${rewards}</ul>
        <p class="dex-note">停在島上（或用噴射氣流飛過去）就能收進圖鑑。紀錄保存在這台裝置的瀏覽器。</p>
        ${grandBtn}
        <button class="btn btn-primary btn-block" type="button" data-close data-focus>繼續冒險</button>
      </div>`);
  }

  /* ---------------- init ---------------- */
  $('#rollBtn').addEventListener('click', () => (state.target ? roll() : drawTarget()));
  $('#rulesBtn').addEventListener('click', () => { if ($('#modal').hidden) showRules(); });
  $('#dexBtn').addEventListener('click', async () => {
    if (!$('#modal').hidden || !state.countries.length) return;
    if ((await showDex()) === 'grand') showGrand();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.busy) state.relayoutPending = true;
      else relayout();
    }, 150);
  });

  async function init() {
    buildDice();
    $('#walletIco').innerHTML = shellIcon();
    await loadData();
    $('#countryCount').textContent = state.countries.length;
    buildBoard();
    updateDexBtn();
    relayout();
    updateHud();
    setRollButton('抽出目的地', true, true);
    await showRules(true);
  }
  init();
})();
