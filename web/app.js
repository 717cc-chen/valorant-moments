/* 无畏时刻 · 本地视频墙
 * 设计：左侧栏 + 日期分组 + 详细/简略双模式
 */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    agent: '', map: '', type: '', tag: '', mode: '', result: '',
    date: '', ym: '', q: '', fav: false, sort: 'new',
    view: 'detail', selecting: false, selected: new Set(),
    items: [], total: 0, playing: -1, trash: [],
  };

  let FACETS = { agents: [], maps: [], types: [], tags: [], modes: [], months: [] };
  let TAGMAP = {};
  let DAYS = [];
  let tOpen = false;

  const AGENT_COLORS = {
    sage: '#7bd6a9', clove: '#d9a5e8', killjoy: '#f2d45c', reyna: '#b06be0',
    miks: '#8fb8f0', viper: '#6fbf73', skye: '#79c9b6', gekko: '#f0a35e',
    brimstone: '#d98b53', sova: '#6fa6d8', phoenix: '#f2833f', waylay: '#79c9e8',
    iso: '#c9b2f0', cypher: '#a9b4c4', jett: '#9fd8f0', breach: '#d98b5c',
    astra: '#a08fe0', neon: '#6fd0f0', chamber: '#e0c47c', deadlock: '#a8dcc8',
    fade: '#8f9bd0', raze: '#e8843f', veto: '#c0c6d0', vyse: '#b7a5e8', tejo: '#e0a06e',
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDur = (s) => {
    s = Math.max(0, Math.round(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const fmtSize = (n) => {
    n = n || 0;
    if (n > 1024 ** 3) return (n / 1024 ** 3).toFixed(1) + ' GB';
    if (n > 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB';
    return Math.round(n / 1024) + ' KB';
  };
  const fmtDurLong = (s) => {
    s = Math.max(0, Math.round(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + ' 小时 ' + m + ' 分' : m + ' 分 ' + (s % 60) + ' 秒';
  };
  const agentColor = (k) => AGENT_COLORS[k] || '#9aa0ae';
  const tagDef = (id) => TAGMAP[id] || { name: id, color: '#888' };
  const WD = '日一二三四五六';
  const weekday = (d) => {
    try { return '周' + WD[new Date(d + 'T00:00:00').getDay()]; } catch (e) { return ''; }
  };

  function refreshTagMap() {
    TAGMAP = {};
    (FACETS.tags || []).forEach((t) => { TAGMAP[t.id] = t; });
  }

  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }

  const post = (url, body) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((x) => x.json());
  const getJSON = (u) => fetch(u).then((x) => x.json());

  // ---------------------------------------------------------------- 下拉
  const dropdown = $('#dropdown');
  let ddOwner = null;
  function closeDropdown() { dropdown.hidden = true; ddOwner = null; }

  function openDropdown(btn, options, current, onPick) {
    const r = btn.getBoundingClientRect();
    dropdown.innerHTML = '';
    options.forEach((o) => {
      const d = document.createElement('div');
      d.className = 'opt' + (o.v === current ? ' on' : '');
      const lead = o.img
        ? '<span class="sw has-img"><img src="' + esc(o.img) + '" alt="" loading="lazy"></span>'
        : (o.color ? '<span class="sw" style="background:' + esc(o.color) + '"></span>' : '');
      d.innerHTML = lead + '<span>' + esc(o.t) + '</span>' +
        (o.c != null ? '<span class="n">' + o.c + '</span>' : '');
      d.onclick = (e) => { e.stopPropagation(); closeDropdown(); onPick(o.v, o.t); };
      dropdown.appendChild(d);
    });
    dropdown.hidden = false;
    const w = Math.max(190, r.width);
    dropdown.style.minWidth = w + 'px';
    dropdown.style.left = Math.max(6, Math.min(r.left, innerWidth - w - 8)) + 'px';
    const below = innerHeight - r.bottom - 12;
    if (below < 240 && r.top > below) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = (innerHeight - r.top + 6) + 'px';
    } else {
      dropdown.style.bottom = 'auto';
      dropdown.style.top = (r.bottom + 6) + 'px';
    }
    ddOwner = btn;
  }

  function bindPill(id, getOptions, onPick) {
    const btn = $(id);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ddOwner === btn && !dropdown.hidden) { closeDropdown(); return; }
      closeDropdown();
      openDropdown(btn, getOptions(), currentValue(id), onPick);
    });
  }

  function currentValue(id) {
    return ({
      '#pillAgent': state.agent, '#pillMap': state.map, '#pillType': state.type,
      '#pillTag': state.tag, '#pillMode': state.mode, '#pillResult': state.result,
      '#pillDay': state.date ? 'd:' + state.date : (state.ym ? 'ym:' + state.ym : ''),
    })[id] || '';
  }

  function setPill(id, active, label) {
    const b = $(id);
    b.classList.toggle('on', !!active);
    const icon = b.querySelector('svg:first-child');
    const iconHtml = icon ? icon.outerHTML : '';
    b.innerHTML = iconHtml + ' ' + esc(label) +
      ' <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
  }

  document.addEventListener('click', closeDropdown);

  // 日历相关状态（提前声明，供 initPills 使用）
  const calpop = $('#calpop');
  let calCursor = null;        // 当前显示的月份 Date(年,月,1)
  let dayCount = {};           // 'YYYY-MM-DD' -> 视频数

  function buildDayCount() {
    dayCount = {};
    DAYS.forEach((d) => {
      if (d && d.date) dayCount[String(d.date).trim()] = d.count;
    });
  }

  function initPills() {
    bindPill('#pillAgent',
      () => [{ v: '', t: '全部英雄' }].concat(
        FACETS.agents.map((a) => ({ v: a.key, t: a.name, c: a.count, img: a.img }))),
      (v, t) => {
        state.agent = v;
        setPill('#pillAgent', !!v, v ? t : '全部英雄');
        $$('#heroList .hitem').forEach((x) => x.classList.toggle('on', x.dataset.key === v));
        reload();
      });

    bindPill('#pillMap',
      () => [{ v: '', t: '全部地图' }].concat(
        FACETS.maps.map((a) => ({ v: a.key, t: a.name, c: a.count }))),
      (v, t) => { state.map = v; setPill('#pillMap', !!v, v ? t : '地图'); reload(); });

    bindPill('#pillType',
      () => [{ v: '', t: '全部类型' }].concat(
        FACETS.types.map((a) => ({ v: a.name, t: a.name, c: a.count }))),
      (v, t) => { state.type = v; setPill('#pillType', !!v, v ? t : '类型'); reload(); });

    bindPill('#pillTag',
      () => [{ v: '', t: '全部标签' }].concat(
        (FACETS.tags || []).map((a) => ({ v: a.id, t: a.name, c: a.count, color: a.color }))),
      (v, t) => { state.tag = v; setPill('#pillTag', !!v, v ? t : '标签'); reload(); });

    bindPill('#pillMode',
      () => [{ v: '', t: '全部模式' }].concat(
        (FACETS.modes || []).map((a) => ({ v: a.name, t: a.name, c: a.count }))),
      (v, t) => { state.mode = v; setPill('#pillMode', !!v, v ? t : '模式'); reload(); });

    bindPill('#pillResult',
      () => [{ v: '', t: '胜负不限' }, { v: 'win', t: '只看胜利' }, { v: 'lose', t: '只看失败' }],
      (v) => {
        state.result = v;
        setPill('#pillResult', !!v, v === 'win' ? '胜利' : (v === 'lose' ? '失败' : '胜负'));
        reload();
      });

    // 日期：打开日历面板（平铺）
    const dayBtn = $('#pillDay');
    dayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!calpop.hidden) { closeCal(); return; }
      closeDropdown();
      openCal(dayBtn);
    });
  }

  // ---------------------------------------------------------------- 日历

  const pad2 = (n) => (n < 10 ? '0' + n : String(n));
  const ymd = (y, m, d) => y + '-' + pad2(m + 1) + '-' + pad2(d);

  function closeCal() {
    calpop.hidden = true;
  }

  function openCal(btn) {
    // 默认定位到当前选中日期，否则最近有录像的月份
    if (state.date) {
      const p = state.date.split('-');
      calCursor = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    } else if (DAYS.length) {
      const p = DAYS[0].date.split('-');
      calCursor = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    } else {
      const t = new Date();
      calCursor = new Date(t.getFullYear(), t.getMonth(), 1);
    }
    renderCal();
    calpop.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = calpop.offsetWidth || 300;
    calpop.style.left = Math.max(6, Math.min(r.left, innerWidth - w - 8)) + 'px';
    const below = innerHeight - r.bottom - 12;
    if (below < 380 && r.top > below) {
      calpop.style.top = 'auto';
      calpop.style.bottom = (innerHeight - r.top + 6) + 'px';
    } else {
      calpop.style.bottom = 'auto';
      calpop.style.top = (r.bottom + 6) + 'px';
    }
  }

  function renderCal() {
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    $('#calTitle').textContent = y + ' 年 ' + (m + 1) + ' 月';

    const grid = $('#calGrid');
    grid.innerHTML = '';

    // 周一为一周第一天：JS getDay() 周日=0
    const first = new Date(y, m, 1);
    let lead = first.getDay() - 1;
    if (lead < 0) lead = 6;

    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevDays = new Date(y, m, 0).getDate();

    const cells = [];
    // 上月补位
    for (let i = lead - 1; i >= 0; i--) {
      cells.push({ d: prevDays - i, y, m: m - 1, other: true });
    }
    // 本月
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ d, y, m, other: false });
    }
    // 下月补位（补齐整周）
    let rest = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= rest; d++) {
      cells.push({ d, y, m: m + 1, other: true });
    }

    cells.forEach((c) => {
      // 规整跨年月份
      let yy = c.y, mm = c.m;
      if (mm < 0) { mm = 11; yy -= 1; }
      if (mm > 11) { mm = 0; yy += 1; }
      const key = ymd(yy, mm, c.d);

      const el = document.createElement('button');
      el.className = 'calday' + (c.other ? ' other' : '');
      const cnt = dayCount[key] || 0;
      if (cnt > 0) el.classList.add('has');
      if (state.date === key) el.classList.add('on');
      el.innerHTML = '<span class="dnum">' + c.d + '</span>' +
        (cnt > 0 ? '<span class="ddot"></span>' : '');

      el.onclick = (e) => {
        e.stopPropagation();
        if (c.other) {
          // 点到邻月：先翻月再选中
          calCursor = new Date(yy, mm, 1);
        }
        state.date = key;
        state.ym = key.slice(0, 7);
        setPill('#pillDay', true, key.slice(5).replace('-', '/'));
        syncTimeline();
        closeCal();
        reload();
      };
      grid.appendChild(el);
    });
  }

  const calPrevBtn = $('#calPrev');
  if (calPrevBtn) calPrevBtn.onclick = (e) => {
    e.stopPropagation();
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCal();
  };
  const calNextBtn = $('#calNext');
  if (calNextBtn) calNextBtn.onclick = (e) => {
    e.stopPropagation();
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCal();
  };
  const calClearBtn = $('#calClear');
  if (calClearBtn) calClearBtn.onclick = (e) => {
    e.stopPropagation();
    state.date = '';
    setPill('#pillDay', false, '日期');
    syncTimeline();
    closeCal();
    reload();
  };

  // 点击别处关闭
  document.addEventListener('click', (e) => {
    if (!calpop.hidden && !calpop.contains(e.target) && e.target.id !== 'pillDay') {
      closeCal();
    }
  });
  calpop.addEventListener('click', (e) => e.stopPropagation());

  // ---------------------------------------------------------------- 时间轴
  function initTimeline() {
    const g = $('#tgroup'), b = $('#tbtn');
    function apply(open) {
      tOpen = open;
      g.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      try { localStorage.setItem('vm_tline', open ? '1' : '0'); } catch (e) {}
    }
    b.addEventListener('click', () => apply(!tOpen));
    let saved = '0';
    try { saved = localStorage.getItem('vm_tline') || '0'; } catch (e) {}
    apply(saved === '1');
  }

  function buildTimeline() {
    const box = $('#tline');
    box.innerHTML = '';
    const months = FACETS.months || [];
    if (!months.length) {
      box.innerHTML = '<div style="padding:6px 10px;font-size:12px;color:var(--text-3)">暂无数据</div>';
      return;
    }
    let lastYear = null;
    months.forEach((m) => {
      if (m.year !== lastYear) {
        lastYear = m.year;
        const y = document.createElement('div');
        y.className = 'tyear';
        y.textContent = m.year;
        box.appendChild(y);
      }
      const a = document.createElement('a');
      a.className = 'tmonth' + (state.ym === m.ym ? ' on' : '');
      a.href = '#';
      a.dataset.ym = m.ym;
      a.innerHTML = m.month + ' 月<span class="n">' + m.count + '</span>';
      a.onclick = (e) => {
        e.preventDefault();
        state.ym = (state.ym === m.ym) ? '' : m.ym;
        state.date = '';
        setPill('#pillDay', !!state.ym, state.ym ? m.month + ' 月' : '日期');
        syncTimeline();
        reload();
      };
      box.appendChild(a);
    });
    syncTimeline();
  }

  function syncTimeline() {
    $$('#tline .tmonth').forEach((a) => a.classList.toggle('on', a.dataset.ym === state.ym));
    const now = $('#tNow');
    if (state.ym) {
      const f = (FACETS.months || []).find((m) => m.ym === state.ym);
      now.textContent = f ? (f.year + ' · ' + f.month + ' 月') : state.ym;
    } else if (state.date) {
      now.textContent = state.date;
    } else {
      now.textContent = '全部';
    }
  }

  // ---------------------------------------------------------------- 侧栏英雄
  function buildHeroList() {
    const box = $('#heroList');
    box.innerHTML = '';
    (FACETS.agents || []).slice(0, 7).forEach((a) => {
      const el = document.createElement('a');
      el.className = 'hitem' + (state.agent === a.key ? ' on' : '');
      el.href = '#';
      el.dataset.key = a.key;
      const dotHtml = a.img
        ? '<span class="dot has-img"><img src="' + esc(a.img) + '" alt="" loading="lazy"></span>'
        : '<span class="dot" style="background:' + agentColor(a.key) + '"></span>';
      el.innerHTML = dotHtml + esc(a.name) + '<span class="cnt">' + a.count + '</span>';
      el.onclick = (e) => {
        e.preventDefault();
        state.agent = (state.agent === a.key) ? '' : a.key;
        setPill('#pillAgent', !!state.agent, state.agent ? a.name : '全部英雄');
        $$('#heroList .hitem').forEach((x) => x.classList.toggle('on', x.dataset.key === state.agent));
        reload();
      };
      box.appendChild(el);
    });
  }

  // ---------------------------------------------------------------- 视图模式
  function setView(v) {
    state.view = v;
    document.body.classList.toggle('mode-detail', v === 'detail');
    document.body.classList.toggle('mode-simple', v === 'simple');
    $$('#modeSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === v));
    try { localStorage.setItem('vm_mode', v); } catch (e) {}
    render();
  }
  $$('#modeSwitch button').forEach((b) => { b.onclick = () => setView(b.dataset.mode); });

  // ---------------------------------------------------------------- 数据
  async function loadStatus() {
    const s = await getJSON('/api/status');
    const st = s.stats || {};
    $('#headStat').textContent =
      (st.matches || 0).toLocaleString() + ' 场对局 · ' +
      (st.videos || 0).toLocaleString() + ' 个视频';
    const gen = s.generated ? new Date(s.generated * 1000).toLocaleString() : '';
    $('#headSub').innerHTML =
      '总时长 <b>' + fmtDurLong(st.totalDuration) + '</b>' +
      (gen ? ' · 索引更新于 <b>' + esc(gen) + '</b>' : '');
    $('#cntAll').textContent = (st.videos || 0).toLocaleString();
    $('#diskUsed').textContent = fmtSize(st.totalSize);
    if (s.disk && s.disk.total) {
      const pct = Math.min(100, (s.disk.used / s.disk.total) * 100);
      $('#diskBar').style.width = pct.toFixed(1) + '%';
    }
    return s;
  }

  async function buildDays() {
    const r = await getJSON('/api/days');
    DAYS = (r.items || []).map((x) => ({ date: x.date, count: x.count }));
  }

  async function loadFacets() {
    FACETS = await getJSON('/api/facets');
    refreshTagMap();
    $('#cntTags').textContent = (FACETS.tags || []).length;
    buildTimeline();
    buildHeroList();
    await buildDays();
    buildDayCount();
    $('#cntFav').textContent = (FACETS.tags || []).length ? '' : '0';
    return FACETS;
  }

  let loading = false;
  async function reload() {
    if (loading) return;
    loading = true;
    const qs = new URLSearchParams({
      agent: state.agent, map: state.map, type: state.type,
      tag: state.tag, mode: state.mode, result: state.result,
      date: state.date, ym: state.date ? '' : state.ym,
      sort: state.sort, q: state.q, limit: 100000,
    });
    if (state.fav) qs.set('fav', '1');
    try {
      const r = await getJSON('/api/videos?' + qs.toString());
      state.items = r.items;
      state.total = r.total;
    } finally {
      loading = false;
    }
    const alive = new Set(state.items.map((i) => i.id));
    Array.from(state.selected).forEach((id) => { if (!alive.has(id)) state.selected.delete(id); });
    state.playing = -1;
    $('#statCount').textContent = state.total.toLocaleString() + ' 个';
    $('#emptyState').style.display = state.total > 0 ? 'none' : 'flex';
    render();
    updateSelUI();
  }

  // ---------------------------------------------------------------- 渲染
  function render() {
    const box = $('#content');
    const empty = $('#emptyState');
    box.innerHTML = '';
    box.appendChild(empty);
    if (!state.items.length) return;

    const groups = [];
    const idx = new Map();
    state.items.forEach((it) => {
      const d = it.date || '未知日期';
      if (!idx.has(d)) { idx.set(d, { date: d, items: [] }); groups.push(idx.get(d)); }
      idx.get(d).items.push(it);
    });

    const frag = document.createDocumentFragment();
    groups.forEach((g) => {
      const dh = document.createElement('div');
      dh.className = 'dayhead';
      const md = g.date.slice(5).split('-');
      const label = (g.date.length >= 10)
        ? (parseInt(md[0], 10) + ' 月 ' + parseInt(md[1], 10) + ' 日')
        : g.date;
      const mc = new Set(g.items.map((x) => x.match)).size;
      dh.innerHTML = '<h2>' + esc(label) + '</h2>' +
        '<span class="wd">' + esc(weekday(g.date)) + '</span>' +
        '<span class="ln"></span>' +
        '<span class="num">' + mc + ' 场 · ' + g.items.length + ' 个视频</span>';
      dh.querySelector('h2').onclick = () => {
        state.date = g.date;
        state.ym = g.date.slice(0, 7);
        setPill('#pillDay', true, g.date.slice(5).replace('-', '/'));
        syncTimeline();
        reload();
      };
      frag.appendChild(dh);

      const matches = [];
      const midx = new Map();
      g.items.forEach((it) => {
        if (!midx.has(it.match)) {
          midx.set(it.match, { head: it, items: [] });
          matches.push(midx.get(it.match));
        }
        midx.get(it.match).items.push(it);
      });
      matches.forEach((mt) => frag.appendChild(
        state.view === 'detail' ? renderDetail(mt) : renderSimple(mt)));
    });
    box.appendChild(frag);
  }

  // 官方英雄头像（有图用图，无图回退到首字）
  function avatarHtml(item, cls, extraStyle) {
    const name = item.agent || '';
    const img = item.agentImg || null;
    const color = agentColor(item.agentGrp || '');
    const style = extraStyle ? ' style="' + extraStyle + '"' : '';
    if (img) {
      return '<span class="' + cls + ' has-img"' + style + '>' +
        '<img src="' + esc(img) + '" alt="' + esc(name) + '" loading="lazy" ' +
        'onerror="this.parentNode.classList.remove(\'has-img\');this.remove();' +
        'if(!this.parentNode.textContent.trim())this.parentNode.textContent=\'?\'">' +
        '</span>';
    }
    return '<span class="' + cls + '" style="background:' + color + '">' +
      esc((name || '?').slice(0, 1)) + '</span>';
  }

  const tagsOf = (it) => (it.tags || []).map((id) => tagDef(id));

  function renderDetail(mt) {
    const h = mt.head;
    const r = document.createElement('article');
    r.className = 'm-detail ' + (h.won === true ? 'win' : (h.won === false ? 'lose' : ''));
    r.innerHTML =
      '<span class="bar"></span>' +
      '<div class="who">' +
        avatarHtml(h, 'ava') +
        '<div class="nm">' + esc(h.agent || '未知英雄') + '</div>' +
        '<div class="dt">' + esc(h.date) + ' ' + esc(h.clock || '') + '</div>' +
        (h.won === true ? '<span class="pill w">胜利</span>' :
         h.won === false ? '<span class="pill l">失败</span>' : '') +
        (h.score ? '<div class="score">' + esc(h.score).replace(':', '<span>:</span>') + '</div>' : '') +
        (h.kda ? '<div class="kda">KDA ' + esc(h.kda) + '</div>' : '') +
        '<div class="foot">' +
          '<span>地图 <b>' + esc(h.map || '未知') + '</b></span>' +
          '<span><b>' + esc(h.mode || '对局') + '</b> · ' + mt.items.length + ' 个视频</span>' +
        '</div>' +
      '</div>' +
      '<div class="clips">' + mt.items.map(clipCard).join('') + '</div>';
    return r;
  }

  function clipCard(it) {
    const tagHtml = tagsOf(it).map((t) =>
      '<span class="tg" style="background:' + esc(t.color) + '">' + esc(t.name) + '</span>').join('');
    const sel = state.selected.has(it.id);
    const missing = it.exists === false;
    // 官方录制封面（record/cover-N-xxxx.jpeg）
    const posterSrc = '/media/poster/' + encodeURIComponent(it.id);
    const posterHtml = missing
      ? '<div class="cover-ph"></div>'
      : '<img class="cover-img" src="' + posterSrc + '" alt="" loading="lazy" decoding="async" ' +
        'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'no-cover\')">';
    return '<a class="clip' + (sel ? ' selected' : '') + (missing ? ' clip-missing' : '') +
      '" data-id="' + esc(it.id) + '"' + (missing ? ' data-missing="1"' : '') + '>' +
      '<div class="cover">' +
        posterHtml +
        '<div class="toprow"><span class="ty">' + esc(it.type || '精彩时刻') + '</span>' + tagHtml + '</div>' +
        (it.fav ? '<span class="star"><svg viewBox="0 0 24 24"><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3Z"/></svg></span>' : '') +
        (missing
          ? '<div class="missing-mask">文件已缺失</div>'
          : '<div class="pv"><i><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg></i></div>') +
        '<span class="du">' + fmtDur(it.duration) + '</span>' +
        '<span class="checkbox' + (sel ? ' on' : '') + '">✓</span>' +
      '</div>' +
      '<div class="bar2"><span class="sz">' + esc(it.sizeText) + '</span>' +
        '<span>' + (it.res ? esc(String(it.res).replace('x', '×')) : '') + '</span></div>' +
      '</a>';
  }

  function renderSimple(mt) {
    const h = mt.head;
    const a = document.createElement('a');
    a.className = 'm-simple' + (state.selected.has(h.id) ? ' selected' : '');
    a.dataset.match = h.match;
    const types = Array.from(new Set(mt.items.map((x) => x.type || '精彩时刻')));
    const mini = types.slice(0, 3).map((t) =>
      '<span class="mt">' + esc(t.replace('时刻', '').replace('集锦', '')) + '</span>').join('');
    a.innerHTML =
      avatarHtml(h, 'ava') +
      '<span class="nm">' + esc(h.agent || '未知') + '</span>' +
      '<span class="t">' + esc(h.clock || '') + '</span>' +
      '<span class="res ' + (h.won === true ? 'w' : (h.won === false ? 'l' : '')) + '">' +
        (h.won === true ? '胜利' : (h.won === false ? '失败' : '—')) + '</span>' +
      '<span class="sc">' + esc(h.score || '') + '</span>' +
      '<span class="kda">' + esc(h.kda || '') + '</span>' +
      '<span class="map">' + esc(h.map || '') + '</span>' +
      '<span class="sp"></span>' +
      '<span class="mini">' + mini + '</span>' +
      '<span class="cnt">' + mt.items.length + ' 个</span>' +
      '<span class="checkbox' + (state.selected.has(h.id) ? ' on' : '') + '">✓</span>';
    return a;
  }

  $('#content').addEventListener('click', (e) => {
    const clip = e.target.closest('.clip');
    const simple = e.target.closest('.m-simple');
    if (!clip && !simple) return;

    if (state.selecting) {
      if (clip) { toggleSelect(clip.dataset.id, clip); return; }
      const mid = simple.dataset.match;
      const items = state.items.filter((x) => x.match === mid);
      const anySel = items.some((x) => state.selected.has(x.id));
      items.forEach((x) => { if (anySel) state.selected.delete(x.id); else state.selected.add(x.id); });
      simple.classList.toggle('selected', !anySel);
      const cb = simple.querySelector('.checkbox');
      if (cb) cb.classList.toggle('on', !anySel);
      updateSelUI();
      return;
    }

    if (clip) {
      if (clip.dataset.missing) { toast('该视频文件已不在磁盘上'); return; }
      const i = state.items.findIndex((x) => x.id === clip.dataset.id);
      openPlayer(i);
    } else {
      const mid = simple.dataset.match;
      const i = state.items.findIndex((x) => x.match === mid);
      if (i >= 0) {
        if (state.items[i].exists === false) { toast('该场视频文件已不在磁盘上'); return; }
        openPlayer(i);
      }
    }
  });

  // ---------------------------------------------------------------- 多选
  function toggleSelect(id, el) {
    const on = !state.selected.has(id);
    if (on) state.selected.add(id); else state.selected.delete(id);
    el.classList.toggle('selected', on);
    const cb = el.querySelector('.checkbox');
    if (cb) cb.classList.toggle('on', on);
    updateSelUI();
  }

  function updateSelUI() {
    $('#selCount').textContent = state.selected.size;
    $('#batchbar').hidden = !state.selecting;
  }

  function setSelecting(on) {
    state.selecting = on;
    document.body.classList.toggle('selecting', on);
    const b = $('#btnSelect');
    b.classList.toggle('on', on);
    b.style.background = on ? 'var(--primary)' : '';
    b.style.borderColor = on ? 'var(--primary)' : '';
    b.style.color = on ? '#fff' : '';
    if (!on) state.selected.clear();
    $('#batchbar').hidden = !on;
    render();
    updateSelUI();
  }

  $('#btnSelect').onclick = () => setSelecting(!state.selecting);
  $('#bExit').onclick = () => setSelecting(false);
  $('#bNone').onclick = () => { state.selected.clear(); render(); updateSelUI(); };
  $('#bAll').onclick = () => {
    state.items.forEach((i) => state.selected.add(i.id));
    render(); updateSelUI();
  };

  const selIds = () => Array.from(state.selected);

  $('#bTag').onclick = () => {
    if (!state.selected.size) return toast('请先选择视频');
    openTagPick(selIds());
  };
  $('#bFav').onclick = async () => {
    if (!state.selected.size) return toast('请先选择视频');
    await post('/api/batch/fav', { ids: selIds(), value: true });
    toast('已收藏 ' + state.selected.size + ' 个');
    await reload();
  };
  $('#bHide').onclick = async () => {
    if (!state.selected.size) return toast('请先选择视频');
    if (!confirm('隐藏选中的 ' + state.selected.size + ' 个？（只在本页面隐藏）')) return;
    await post('/api/batch/hide', { ids: selIds(), value: true });
    toast('已隐藏');
    await reload();
  };
  $('#bExport').onclick = async () => {
    if (!state.selected.size) return toast('请先选择视频');
    toast('正在导出…');
    const r = await post('/api/batch/export', { ids: selIds() });
    toast(r.folder ? '已导出 ' + r.exported + ' 个到：' + r.folder : '导出失败', 6000);
  };
  $('#bDelete').onclick = async () => {
    if (!state.selected.size) return toast('请先选择视频');
    const n = state.selected.size;
    if (!confirm('删除选中的 ' + n + ' 个视频？\n\n删除后会放进回收站，可以在那里还原或彻底删除。')) return;
    toast('正在删除…');
    const r = await post('/api/batch/delete', { ids: selIds() });
    if (r.moved) toast('已删除 ' + r.moved + ' 个，已放进回收站', 5000);
    if (r.failed) alert('有 ' + r.failed + ' 个删除失败：\n\n' + (r.errors || []).join('\n'));
    state.selected.clear();
    await reload();
    refreshTrashCount();
  };

  // ---------------------------------------------------------------- 播放器
  const player = $('#player'), video = $('#video');

  function openPlayer(i) {
    if (i < 0 || i >= state.items.length) return;
    state.playing = i;
    const it = state.items[i];
    player.hidden = false;
    const stageEl = document.querySelector('.stage');
    if (stageEl) stageEl.classList.add('playing');
    $('#vloading').hidden = false;
    $('#vloading').textContent = '加载中…';
    $('#phTitle').textContent = it.name || it.id;
    $('#phMeta').innerHTML = [
      esc(it.agent), esc(it.map), esc(it.type), esc(it.mode),
      (it.won === true ? '胜利' : it.won === false ? '失败' : ''),
      esc(it.score || ''), (it.kda ? 'KDA ' + esc(it.kda) : ''),
      esc((it.date + ' ' + (it.clock || '')).trim()),
      esc(it.sizeText), esc(it.res || ''),
    ].filter(Boolean).join('<span class="sep">·</span>');

    $('#phTags').innerHTML = tagsOf(it).map((t) =>
      '<span class="pt" style="background:' + esc(t.color) + '">' + esc(t.name) + '</span>').join('') +
      '<span class="pt add" id="phAddTag">+ 添加标签</span>';
    const add = $('#phAddTag');
    if (add) add.onclick = () => openTagPick(it.id);

    $('#phStrip').innerHTML =
      '<div class="cell"><span class="k">结果</span><span class="v ' +
        (it.won === true ? 'w' : (it.won === false ? 'l' : '')) + '">' +
        (it.won === true ? '胜利' : (it.won === false ? '失败' : '—')) + '</span></div>' +
      '<div class="cell"><span class="k">比分</span><span class="v sc">' + esc(it.score || '—') + '</span></div>' +
      '<div class="cell"><span class="k">KDA</span><span class="v">' + esc(it.kda || '—') + '</span></div>' +
      '<div class="cell"><span class="k">得分</span><span class="v">' + esc(it.scorePoint != null ? it.scorePoint : '—') + '</span></div>' +
      '<div class="cell"><span class="k">地图</span><span class="v">' + esc(it.map || '—') + '</span></div>' +
      '<div class="cell"><span class="k">模式</span><span class="v">' + esc(it.mode || '—') + '</span></div>' +
      '<div class="cell"><span class="k">时长</span><span class="v">' + fmtDur(it.duration) + '</span></div>';

    $('#phPos').textContent = (i + 1) + ' / ' + state.total;
    $('#btnFav').classList.toggle('on', !!it.fav);

    // 英雄头像（官方立绘）
    const ava = $('#phAva');
    if (ava) {
      const img = it.agentImg || null;
      ava.innerHTML = img
        ? '<img src="' + esc(img) + '" alt="' + esc(it.agent || '') + '" ' +
          'onerror="this.parentNode.style.background=\'var(--surface-3)\';this.remove()">'
        : '';
    }

    // 本场视频列表
    renderSiblings(it);
    video.src = '/media/video/' + encodeURIComponent(it.id);
    video.load();
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }

  // 当前视频同属一场对局的其他视频，横向列出便于切换
  function renderSiblings(cur) {
    const bar = $('#siblingBar');
    if (!bar) return;
    const same = state.items
      .map((it, idx) => ({ it, idx }))
      .filter((x) => x.it.match === cur.match);
    if (same.length <= 1) {
      bar.innerHTML = '';
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.innerHTML = same.map(({ it, idx }) => {
      const on = it.id === cur.id ? ' on' : '';
      const poster = '/media/poster/' + encodeURIComponent(it.id);
      return '<div class="sib' + on + '" data-idx="' + idx + '" title="' +
        esc(it.name || '') + '">' +
        '<span class="stn"><img src="' + poster + '" alt="" loading="lazy" ' +
        'onerror="this.style.display=\'none\'"></span>' +
        '<span class="stxt">' +
          '<span class="st1">' + esc(it.type || '视频') + '</span>' +
          '<span class="st2">' + fmtDur(it.duration) + '</span>' +
        '</span>' +
      '</div>';
    }).join('');

    bar.querySelectorAll('.sib').forEach((el) => {
      el.onclick = () => {
        const idx = Number(el.dataset.idx);
        if (idx >= 0 && idx !== state.playing) openPlayer(idx);
      };
    });
  }

  function closePlayer() {
    player.hidden = true;
    const stageEl = document.querySelector('.stage');
    if (stageEl) stageEl.classList.remove('playing');
    video.pause();
    video.removeAttribute('src');
    video.load();
    state.playing = -1;
  }

  function step(d) {
    const n = state.playing + d;
    if (n >= 0 && n < state.items.length) openPlayer(n);
  }

  video.addEventListener('loadeddata', () => { $('#vloading').hidden = true; });
  video.addEventListener('error', () => {
    $('#vloading').hidden = false;
    $('#vloading').textContent = '该视频无法在浏览器播放（可能是编码不支持）';
  });
  video.addEventListener('ended', () => { if (!player.hidden) step(1); });

  $('#btnClose').onclick = closePlayer;
  const backList = $('#btnBackList');
  if (backList) backList.onclick = closePlayer;
  $('#btnPrev').onclick = () => step(-1);
  $('#btnNext').onclick = () => step(1);

  $('#btnFav').onclick = async () => {
    const it = state.items[state.playing];
    if (!it) return;
    const r = await post('/api/video/' + encodeURIComponent(it.id) + '/fav');
    it.fav = r.fav;
    $('#btnFav').classList.toggle('on', r.fav);
  };

  $('#btnTagOne').onclick = () => {
    const it = state.items[state.playing];
    if (it) openTagPick(it.id);
  };

  $('#btnRename').onclick = async () => {
    const it = state.items[state.playing];
    if (!it) return;
    const name = prompt('新的显示名称（不改动原始文件）：', it.name);
    if (name === null) return;
    const r = await post('/api/video/' + encodeURIComponent(it.id) + '/rename', { name });
    it.name = r.name;
    $('#phTitle').textContent = r.name;
    toast('已重命名');
  };

  $('#btnExport').onclick = async () => {
    const it = state.items[state.playing];
    if (!it) return;
    toast('正在导出…');
    const r = await post('/api/video/' + encodeURIComponent(it.id) + '/export', {});
    toast(r.path ? '已导出到：' + r.path : '导出失败', 5000);
  };

  $('#btnHide').onclick = async () => {
    const it = state.items[state.playing];
    if (!it) return;
    if (!confirm('隐藏这个视频？（原始文件不会删除）')) return;
    await post('/api/video/' + encodeURIComponent(it.id) + '/hide');
    closePlayer();
    toast('已隐藏');
    reload();
  };

  $('#btnDeleteOne').onclick = async () => {
    const i = state.playing;
    const it = state.items[i];
    if (!it) return;
    if (!confirm('删除这个视频？\n\n' + (it.agent || '') + ' · ' + (it.type || '') +
      '\n\n删除后会放进回收站，可以还原。')) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    $('#vloading').hidden = false;
    $('#vloading').textContent = '正在删除…';
    await new Promise((r) => setTimeout(r, 350));
    let r;
    try { r = await post('/api/batch/delete', { ids: [it.id] }); }
    catch (e) { r = { moved: 0, failed: 1, errors: [String(e)] }; }
    if (!r.moved) {
      closePlayer();
      alert('删除失败：\n\n' + ((r.errors && r.errors[0]) || '未知原因') +
        '\n\n常见原因：视频正在被浏览器占用，请关闭后重试。');
      await reload();
      return;
    }
    toast('已删除，已放进回收站');
    state.items.splice(i, 1);
    state.total = Math.max(0, state.total - 1);
    refreshTrashCount();
    if (!state.items.length) { closePlayer(); render(); return; }
    const next = Math.min(i, state.items.length - 1);
    render();
    openPlayer(next);
  };

  // ---------------------------------------------------------------- 键盘
  document.addEventListener('keydown', (e) => {
    if (!$('#trashPlayer').hidden) {
      if (e.key === 'Escape') $('#tpClose').click();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); tpStep(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); tpStep(1); }
      return;
    }
    if (!player.hidden) {
      if (e.key === 'Escape') closePlayer();
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'f' || e.key === 'F') { $('#btnFav').click(); }
      else if (e.key === 't' || e.key === 'T') { $('#btnTagOne').click(); }
      else if (e.key === 'Delete') { e.preventDefault(); $('#btnDeleteOne').click(); }
      return;
    }
    if (e.key === 'Escape' && state.selecting) setSelecting(false);
    if (e.key === '/' && document.activeElement !== $('#search')) {
      e.preventDefault(); $('#search').focus();
    }
  });

  let qTimer = null;
  $('#search').oninput = (e) => {
    clearTimeout(qTimer);
    const v = e.target.value.trim();
    qTimer = setTimeout(() => { state.q = v; reload(); }, 240);
  };

  // ---------------------------------------------------------------- 侧栏导航
  $$('[data-nav]').forEach((a) => {
    a.onclick = (e) => {
      e.preventDefault();
      state.fav = a.dataset.nav === 'fav';
      $$('.sitem').forEach((x) => x.classList.remove('on'));
      a.classList.add('on');
      reload();
    };
  });
  $('#navTags').onclick = (e) => { e.preventDefault(); openTagManage(); };
  $('#navTrash').onclick = (e) => { e.preventDefault(); openTrash(); };

  // ---------------------------------------------------------------- 标签
  let tagPickTarget = null, tagPickSel = new Set();
  const COLORS = ['#ff4655', '#e8c27a', '#2fbf9c', '#8fb8f0', '#b06be0', '#f2833f', '#6fbf73'];
  let newColor = COLORS[0], mColor = COLORS[0];
  const nextColor = (c) => COLORS[(COLORS.indexOf(c) + 1) % COLORS.length];

  function openTagPick(target) {
    tagPickTarget = target;
    tagPickSel = new Set();
    renderTagPick();
    $('#tagPick').hidden = false;
  }

  function renderTagPick() {
    const box = $('#tagPickList');
    box.innerHTML = '';
    $('#newTagColor').style.background = newColor;
    if (!(FACETS.tags || []).length) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:8px">还没有标签，先在下面创建。</div>';
    }
    (FACETS.tags || []).forEach((t) => {
      const d = document.createElement('div');
      d.className = 'trow' + (tagPickSel.has(t.id) ? ' on' : '');
      d.innerHTML = '<span class="sq" style="background:' + esc(t.color) + '"></span>' +
        '<span class="nm">' + esc(t.name) + '</span><span class="ct">' + t.count + '</span>';
      d.onclick = () => {
        if (tagPickSel.has(t.id)) tagPickSel.delete(t.id); else tagPickSel.add(t.id);
        d.classList.toggle('on', tagPickSel.has(t.id));
      };
      box.appendChild(d);
    });
  }

  $('#newTagColor').onclick = () => {
    newColor = nextColor(newColor);
    $('#newTagColor').style.background = newColor;
  };
  $('#mTagColor').onclick = () => {
    mColor = nextColor(mColor);
    $('#mTagColor').style.background = mColor;
  };
  $('#tagPickCancel').onclick = () => { $('#tagPick').hidden = true; };
  $('#tagPickOk').onclick = async () => {
    if (!tagPickSel.size) return toast('请选择标签');
    const ids = Array.isArray(tagPickTarget) ? tagPickTarget : [tagPickTarget];
    await post('/api/batch/tag', { ids, tagIds: Array.from(tagPickSel), action: 'add' });
    $('#tagPick').hidden = true;
    toast('标签已更新');
    await loadFacets();
    await reload();
    if (state.playing >= 0) openPlayer(state.playing);
  };
  $('#newTagBtn').onclick = async () => {
    const name = $('#newTagName').value.trim();
    if (!name) return toast('请输入标签名');
    const r = await post('/api/tags', { name, color: newColor });
    if (r.error) return toast(r.error);
    $('#newTagName').value = '';
    await loadFacets();
    tagPickSel.add(r.id);
    renderTagPick();
    toast('已创建「' + name + '」');
  };

  function openTagManage() { renderTagManage(); $('#tagManage').hidden = false; }
  $('#tagManageClose').onclick = () => { $('#tagManage').hidden = true; };

  function renderTagManage() {
    const box = $('#tagManageList');
    box.innerHTML = '';
    $('#mTagColor').style.background = mColor;
    (FACETS.tags || []).forEach((t) => {
      const d = document.createElement('div');
      d.className = 'trow';
      d.innerHTML = '<span class="sq" style="background:' + esc(t.color) + '"></span>' +
        '<span class="nm">' + esc(t.name) + '</span><span class="ct">' + t.count + ' 个</span>' +
        '<span style="color:#ff9aa2;font-size:12px;padding:0 4px;cursor:pointer">删除</span>';
      d.lastElementChild.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('删除标签「' + t.name + '」？（只删标签，视频不受影响）')) return;
        await fetch('/api/tags/' + encodeURIComponent(t.id), { method: 'DELETE' });
        await loadFacets();
        renderTagManage();
        await reload();
        toast('标签已删除');
      };
      box.appendChild(d);
    });
    if (!(FACETS.tags || []).length) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:8px">还没有标签</div>';
    }
  }

  $('#mTagBtn').onclick = async () => {
    const name = $('#mTagName').value.trim();
    if (!name) return toast('请输入标签名');
    const r = await post('/api/tags', { name, color: mColor });
    if (r.error) return toast(r.error);
    $('#mTagName').value = '';
    await loadFacets();
    renderTagManage();
    toast('已创建');
  };

  // ---------------------------------------------------------------- 损坏文件

  let brokenCache = [];

  async function openBroken() {
    const d = await getJSON('/api/broken');
    brokenCache = d.items || [];
    $('#brokenBox').hidden = false;
    $('#brokenInfo').textContent = d.count ? '（发现 ' + d.count + ' 个问题文件）' : '（全部正常）';
    const box = $('#brokenList');
    box.innerHTML = '';
    if (!d.count) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:28px;text-align:center">' +
        '✅ 所有视频文件都正常</div>';
      $('#brokenHide').hidden = true;
      $('#brokenMove').hidden = true;
      return;
    }
    $('#brokenHide').hidden = false;
    $('#brokenMove').hidden = false;
    d.items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'brk';
      row.innerHTML =
        '<div class="b1">' +
          '<span class="bn">' + esc([it.agent, it.type].filter(Boolean).join(' · ') || it.name) + '</span>' +
          '<span class="bm">' + esc([it.date, it.sizeText].filter(Boolean).join(' · ')) + '</span>' +
        '</div>' +
        '<span class="br">' + esc(it.reason) + '</span>';
      box.appendChild(row);
    });
  }

  async function cleanBroken(action) {
    if (!brokenCache.length) return;
    if (action === 'move') {
      if (!confirm('把这些文件移到回收站？（可还原）')) return;
    }
    const r = await post('/api/broken/clean', { action });
    toast('已处理 ' + (r.cleaned || 0) + ' 个');
    $('#brokenBox').hidden = true;
    await reload();
  }

  const btnBroken = $('#btnBroken');
  if (btnBroken) btnBroken.onclick = openBroken;
  const bClose = $('#brokenClose');
  if (bClose) bClose.onclick = () => { $('#brokenBox').hidden = true; };
  const bHide = $('#brokenHide');
  if (bHide) bHide.onclick = () => cleanBroken('hide');
  const bMove = $('#brokenMove');
  if (bMove) bMove.onclick = () => cleanBroken('move');

  // ---------------------------------------------------------------- 回收站
  async function refreshTrashCount() {
    try {
      const d = await getJSON('/api/trash');
      $('#cntTrash').textContent = d.count;
    } catch (e) {}
  }

  async function openTrash() {
    const d = await getJSON('/api/trash');
    state.trash = d.items || [];
    $('#trashBox').hidden = false;
    $('#trashInfo').textContent = d.count
      ? '（' + d.count + ' 个，共 ' + fmtSize(d.totalSize) + '）' : '（空）';
    const box = $('#trashList');
    box.innerHTML = '';
    if (!d.count) {
      box.innerHTML = '<div style="color:var(--text-3);font-size:12px;padding:24px;text-align:center">回收站是空的</div>';
      return;
    }
    d.items.forEach((it, i) => {
      const m = it.meta || {};
      const row = document.createElement('div');
      row.className = 'tritem';
      row.innerHTML =
        '<div class="tn"><span class="lbl">' + esc(m.type || '视频') + '</span>' +
          '<span class="du">' + (m.duration ? fmtDur(m.duration) : '') + '</span>' +
          '<div class="pv"><i><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg></i></div></div>' +
        '<div class="info">' +
          '<span class="t1">' + esc([m.agent, m.map, m.type].filter(Boolean).join(' · ') || it.name) + '</span>' +
          '<span class="t2">' + esc([
            m.mode, (m.won === true ? '胜利' : m.won === false ? '失败' : ''),
            (m.kda ? 'KDA ' + m.kda : ''), (m.date + ' ' + (m.clock || '')).trim(), it.sizeText,
          ].filter(Boolean).join(' · ')) + '</span>' +
          (m.origPath ? '<span class="t3" title="原始位置">' + esc(m.origPath) + '</span>' : '') +
        '</div>' +
        '<div class="ops"><button class="tbtn">还原</button>' +
          '<button class="tbtn danger">彻底删除</button></div>';
      const [rBtn, pBtn] = row.querySelectorAll('.ops button');
      row.onclick = (e) => { if (!e.target.closest('button')) openTrashPlayer(i); };
      rBtn.onclick = (e) => { e.stopPropagation(); restoreTrash([it.name]); };
      pBtn.onclick = (e) => { e.stopPropagation(); purgeTrash([it.name]); };
      box.appendChild(row);
    });
  }

  async function restoreTrash(names) {
    const r = await post('/api/trash/restore', { names });
    if (r.restored) {
      toast('已还原到原位置');
      tpVideo.pause(); tpVideo.removeAttribute('src'); tpVideo.load();
      $('#trashPlayer').hidden = true;
      $('#trashBox').hidden = false;
      await openTrash();
      await loadFacets();
      await reload();
      refreshTrashCount();
    } else {
      alert('还原失败：\n\n' + ((r.errors && r.errors[0]) || '未知原因'));
    }
  }

  async function purgeTrash(names) {
    if (!confirm('彻底删除？无法恢复！')) return;
    await post('/api/trash/purge', { names });
    toast('已彻底删除');
    tpVideo.pause(); tpVideo.removeAttribute('src'); tpVideo.load();
    $('#trashPlayer').hidden = true;
    $('#trashBox').hidden = false;
    await openTrash();
    refreshTrashCount();
  }

  $('#trashClose').onclick = () => { $('#trashBox').hidden = true; };
  $('#trashPurgeAll').onclick = () => purgeTrash([]);

  const tpVideo = $('#tpVideo');

  function openTrashPlayer(i) {
    const it = state.trash[i];
    if (!it) return;
    const m = it.meta || {};
    $('#trashBox').hidden = true;
    $('#trashPlayer').hidden = false;
    $('#tpLoading').hidden = false;
    $('#tpTitle').textContent = [m.agent, m.map, m.type].filter(Boolean).join(' · ') || it.name;
    $('#tpMeta').innerHTML = [
      esc(m.mode), (m.won === true ? '胜利' : m.won === false ? '失败' : ''),
      (m.kda ? 'KDA ' + esc(m.kda) : ''),
      esc((m.date + ' ' + (m.clock || '')).trim()),
      (m.duration ? fmtDur(m.duration) : ''),
      esc(it.sizeText), esc(m.res || ''),
    ].filter(Boolean).join('<span class="sep">·</span>');
    $('#tpHint').textContent = m.origPath ? '原始位置：' + m.origPath : '回收站文件';
    $('#tpPos').textContent = (i + 1) + ' / ' + state.trash.length;
    $('#trashPlayer').dataset.idx = i;
    tpVideo.src = '/media/trash/' + encodeURIComponent(it.name);
    tpVideo.load();
    const p = tpVideo.play();
    if (p && p.catch) p.catch(() => {});
    tpVideo.onloadeddata = () => { $('#tpLoading').hidden = true; };
    tpVideo.onerror = () => {
      $('#tpLoading').hidden = false;
      $('#tpLoading').textContent = '无法播放（编码不支持）';
    };
  }

  function tpStep(d) {
    const i = Number($('#trashPlayer').dataset.idx || 0) + d;
    if (i >= 0 && i < state.trash.length) openTrashPlayer(i);
  }

  $('#tpPrev').onclick = () => tpStep(-1);
  $('#tpNext').onclick = () => tpStep(1);
  $('#tpClose').onclick = () => {
    tpVideo.pause(); tpVideo.removeAttribute('src'); tpVideo.load();
    $('#trashPlayer').hidden = true;
    $('#trashBox').hidden = false;
  };
  $('#tpRestore').onclick = () => {
    const i = Number($('#trashPlayer').dataset.idx || 0);
    if (state.trash[i]) restoreTrash([state.trash[i].name]);
  };
  $('#tpPurge').onclick = () => {
    const i = Number($('#trashPlayer').dataset.idx || 0);
    if (state.trash[i]) purgeTrash([state.trash[i].name]);
  };

  // ---------------------------------------------------------------- 目录
  let browsePath = '';
  $('#btnRoot').onclick = async () => {
    $('#modalRoot').hidden = false;
    const s = await getJSON('/api/status');
    browsePath = s.root || '';
    loadBrowse(browsePath);
  };
  async function loadBrowse(p) {
    const r = await getJSON('/api/browse?path=' + encodeURIComponent(p || ''));
    browsePath = r.path;
    $('#browsePath').textContent = r.path;
    const lb = $('#browseList');
    lb.innerHTML = '';
    if (r.parent) {
      const up = document.createElement('div');
      up.className = 'it up';
      up.textContent = '⬆ 上一级';
      up.onclick = () => loadBrowse(r.parent);
      lb.appendChild(up);
    }
    r.dirs.forEach((d) => {
      const it = document.createElement('div');
      it.className = 'it';
      it.textContent = '📁 ' + d.name;
      it.onclick = () => loadBrowse(d.path);
      lb.appendChild(it);
    });
  }
  $('#btnCancelRoot').onclick = () => { $('#modalRoot').hidden = true; };
  $('#btnUseRoot').onclick = async () => {
    $('#modalRoot').hidden = true;
    await post('/api/rebuild', { root: browsePath });
    waitForBuild();
  };
  $('#btnRebuild').onclick = async () => {
    await post('/api/rebuild', {});
    waitForBuild();
  };
  async function waitForBuild() {
    toast('正在扫描…');
    const tick = setInterval(async () => {
      const s = await getJSON('/api/status');
      if (!s.building) {
        clearInterval(tick);
        if (s.error) { toast('扫描失败：' + s.error, 6000); return; }
        await loadStatus();
        await loadFacets();
        await reload();
        toast('扫描完成');
      }
    }, 900);
  }

  // ---------------------------------------------------------------- 启动
  async function boot() {
    let v = 'detail';
    try { v = localStorage.getItem('vm_mode') || 'detail'; } catch (e) {}
    state.view = v === 'simple' ? 'simple' : 'detail';
    document.body.classList.toggle('mode-detail', state.view === 'detail');
    document.body.classList.toggle('mode-simple', state.view === 'simple');
    $$('#modeSwitch button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.view));

    initTimeline();
    initPills();

    const s = await getJSON('/api/status');
    if (s.building) { waitForBuild(); return; }
    await loadStatus();
    await loadFacets();
    await reload();
    await refreshTrashCount();
  }

  boot();
})();
