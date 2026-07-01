/**
 * 诗意茂名地图 - 主应用逻辑
 * MVP版本：纯前端实现，数据存储于 LocalStorage
 */

// ==================== 全局状态 ====================
let map = null;
let currentFilter = 'all';
let markers = [];
let poems = [];
let currentUser = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  loadPoems();
  loadUser();
  // 地图延迟初始化，等封面关闭后再加载
  setTimeout(() => {
    initMap();
    renderCategories();
    renderLandmarkList();
    renderPoemFilter();
    setupRouting();
    setupModalClose();
    updateNavUser();
  }, 100);
});

// 进入应用（关闭封面）
function enterApp() {
  const overlay = document.getElementById('landingOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
}

// ==================== 用户登录 ====================
function loadUser() {
  try {
    currentUser = JSON.parse(localStorage.getItem('pm_user') || 'null');
  } catch { currentUser = null; }
}

function saveUser(user) {
  currentUser = user;
  localStorage.setItem('pm_user', JSON.stringify(user));
  updateNavUser();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('pm_user');
  updateNavUser();
}

function updateNavUser() {
  const el = document.getElementById('navUser');
  if (!el) return;
  if (currentUser) {
    el.innerHTML = `<span style="color:#fff;font-size:0.85rem;">👤 ${escapeHtml(currentUser.nickname)}</span> <a href="#" onclick="logout();return false;" style="color:rgba(255,255,255,0.6);font-size:0.75rem;margin-left:0.5rem;">退出</a>`;
  } else {
    el.innerHTML = `<button class="btn btn-primary" style="padding:0.35rem 0.8rem;font-size:0.8rem;" onclick="openLoginModal()">🔒 微信登录</button>`;
  }
}

function openLoginModal() {
  document.getElementById('loginModal').classList.add('show');
}

function handleLogin(e) {
  e.preventDefault();
  const nickname = document.getElementById('loginNickname').value.trim();
  if (!nickname) {
    alert('请输入昵称');
    return false;
  }
  saveUser({ nickname, id: 'u_' + Date.now() });
  closeModal('loginModal');
  alert('登录成功！');
  return false;
}

function requireLogin(callback) {
  if (currentUser) {
    callback();
  } else {
    alert('请先登录后再操作');
    openLoginModal();
  }
}

// ==================== 认领系统 ====================
const CLAIM_HOURS = 48;
const MAX_CLAIMS = 3;

function loadClaims() {
  try {
    const raw = localStorage.getItem('pm_claims');
    const claims = raw ? JSON.parse(raw) : [];
    // 自动清理过期认领
    const now = Date.now();
    return claims.filter(c => c.expiresAt > now);
  } catch { return []; }
}

function saveClaims(claims) {
  localStorage.setItem('pm_claims', JSON.stringify(claims));
}

function getUserClaims() {
  if (!currentUser) return [];
  return loadClaims().filter(c => c.userId === currentUser.id);
}

function isLandmarkClaimedByUser(lmId) {
  if (!currentUser) return false;
  return getUserClaims().some(c => c.landmarkId === lmId);
}

function getLandmarkClaimer(lmId) {
  const claims = loadClaims();
  return claims.find(c => c.landmarkId === lmId);
}

function canClaimLandmark() {
  if (!currentUser) return { ok: false, reason: '请先登录' };
  const userClaims = getUserClaims();
  if (userClaims.length >= MAX_CLAIMS) {
    return { ok: false, reason: `每人最多同时认领 ${MAX_CLAIMS} 个地标，请先完成投稿或等待释放` };
  }
  return { ok: true };
}

function claimLandmark(lmId) {
  const check = canClaimLandmark();
  if (!check.ok) {
    alert(check.reason);
    return false;
  }
  const claims = loadClaims();
  const now = Date.now();
  claims.push({
    landmarkId: lmId,
    userId: currentUser.id,
    claimedAt: now,
    expiresAt: now + CLAIM_HOURS * 3600 * 1000
  });
  saveClaims(claims);
  alert('认领成功！请在 48 小时内完成投稿。');
  // 刷新详情弹窗
  const lm = LANDMARKS.find(l => l.id === lmId);
  if (lm) showLandmarkDetail(lm);
  return true;
}

function getClaimCountdown(lmId) {
  const claim = getLandmarkClaimer(lmId);
  if (!claim) return null;
  const remaining = claim.expiresAt - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return `${hours}小时${minutes}分`;
}

function releaseLandmark(lmId) {
  let claims = loadClaims();
  claims = claims.filter(c => c.landmarkId !== lmId);
  saveClaims(claims);
}

// ==================== LocalStorage 数据管理 ====================
function loadPoems() {
  try {
    poems = JSON.parse(localStorage.getItem('pm_poems') || '[]');
  } catch {
    poems = [];
  }
}

function savePoems() {
  localStorage.setItem('pm_poems', JSON.stringify(poems));
}

function getLandmarkPoems(lmId) {
  return poems.filter(p => p.landmarkId === lmId);
}

function getApprovedPoems() {
  return poems.filter(p => p.status === 'approved' || !p.status);
}

// ==================== 地图初始化 ====================
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'amap': {
          type: 'raster',
          tiles: [
            'https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            'https://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            'https://webrd03.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
            'https://webrd04.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
          ],
          tileSize: 256,
          attribution: '© 高德地图'
        }
      },
      layers: [{
        id: 'amap-layer',
        type: 'raster',
        source: 'amap',
        minzoom: 0,
        maxzoom: 18
      }]
    },
    center: [110.925, 21.85],
    zoom: 9.5
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    renderMarkers();
  });

  map.on('error', (e) => {
    console.error('Map error:', e);
  });
}

// ==================== 标记渲染 ====================
function renderMarkers() {
  // 清除旧标记
  markers.forEach(m => m.remove());
  markers = [];

  const filtered = currentFilter === 'all'
    ? LANDMARKS
    : LANDMARKS.filter(lm => lm.category === currentFilter);

  filtered.forEach(lm => {
    if (!lm.lng || !lm.lat) return;

    const el = document.createElement('div');
    el.className = 'map-marker';
    el.innerHTML = `<div class="marker-inner" style="background:${lm.categoryColor}"><span>${lm.categoryIcon}</span></div>`;
    el.addEventListener('click', () => showLandmarkDetail(lm));

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lm.lng, lm.lat])
      .setPopup(
        new maplibregl.Popup({ offset: 25 }).setHTML(
          `<strong>${lm.name}</strong><br><small>${lm.district}</small>`
        )
      )
      .addTo(map);

    markers.push(marker);
  });
}

// ==================== 分类侧边栏 ====================
function renderCategories() {
  const container = document.getElementById('categoryList');
  const cats = Object.entries(LANDMARK_CATEGORIES);

  // "全部"选项
  const allCount = LANDMARKS.length;
  let html = `
    <div class="category-item ${currentFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">
      <span class="cat-icon">🗺️</span>
      <span class="cat-name">全部地标</span>
      <span class="cat-count">${allCount}</span>
    </div>
  `;

  cats.forEach(([key, meta]) => {
    const count = LANDMARKS.filter(lm => lm.category === key).length;
    html += `
      <div class="category-item ${currentFilter === key ? 'active' : ''}" onclick="setFilter('${key}')">
        <span class="cat-icon">${meta.icon}</span>
        <span class="cat-name">${meta.name}</span>
        <span class="cat-count">${count}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setFilter(cat) {
  currentFilter = cat;
  renderCategories();
  renderMarkers();

  // 切换为地标列表视图
  showLandmarkView(cat);

  if (map) {
    const filtered = cat === 'all' ? LANDMARKS : LANDMARKS.filter(lm => lm.category === cat);
    const valid = filtered.filter(lm => lm.lng && lm.lat);
    if (valid.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      valid.forEach(lm => bounds.extend([lm.lng, lm.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
    }
  }
}

// 切换到地标列表视图
function showLandmarkView(cat) {
  const catMeta = LANDMARK_CATEGORIES[cat];
  const title = cat === 'all' ? '全部地标' : (catMeta ? catMeta.name : '地标列表');

  document.getElementById('sidebarTitle').textContent = title;
  document.getElementById('sidebarSubtitle').textContent = cat === 'all' ? '共 ' + LANDMARKS.length + ' 个地标' : '点击地标查看详情';
  document.getElementById('categoryList').style.display = 'none';
  document.getElementById('backToCats').style.display = 'flex';
  document.getElementById('lmSearchBox').style.display = 'block';
  document.getElementById('landmarkList').style.display = 'block';

  renderLandmarkList();
}

// 返回主题列表视图
function showCategoryView() {
  currentFilter = 'all';
  document.getElementById('sidebarTitle').textContent = '🗂️ 十大主题';
  document.getElementById('sidebarSubtitle').textContent = '点击主题，探索茂名';
  document.getElementById('categoryList').style.display = 'block';
  document.getElementById('backToCats').style.display = 'none';
  document.getElementById('lmSearchBox').style.display = 'none';
  document.getElementById('landmarkList').style.display = 'none';
  document.getElementById('landmarkSearch').value = '';

  renderCategories();
  renderMarkers();
}

// ==================== 地标列表 ====================
function renderLandmarkList(keyword = '') {
  const container = document.getElementById('landmarkList');
  if (!container) return;

  let list = currentFilter === 'all'
    ? LANDMARKS
    : LANDMARKS.filter(lm => lm.category === currentFilter);

  if (keyword.trim()) {
    const k = keyword.trim().toLowerCase();
    list = list.filter(lm => lm.name.toLowerCase().includes(k) || lm.district.includes(k));
  }

  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.8rem;padding:1rem;">暂无匹配地标</div>';
    return;
  }

  let html = '';
  list.forEach(lm => {
    const claimedByMe = isLandmarkClaimedByUser(lm.id);
    const claimer = getLandmarkClaimer(lm.id);
    let statusClass = 'free';
    let statusText = '空闲';
    if (claimedByMe) {
      statusClass = 'mine';
      statusText = '已认领';
    } else if (claimer) {
      statusClass = 'claimed';
      statusText = '被认领';
    }

    html += `
      <div class="landmark-list-item" onclick="clickLandmarkListItem(${lm.id})">
        <div class="lm-icon" style="background:${lm.categoryColor}20;color:${lm.categoryColor};">${lm.categoryIcon}</div>
        <div class="lm-info">
          <div class="lm-name">${escapeHtml(lm.name)}</div>
          <div class="lm-district">${lm.district}</div>
        </div>
        <span class="lm-status ${statusClass}">${statusText}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

function filterLandmarkList(keyword) {
  renderLandmarkList(keyword);
}

function clickLandmarkListItem(lmId) {
  const lm = LANDMARKS.find(l => l.id === lmId);
  if (!lm) return;
  // 地图飞到该地标
  if (map && lm.lng && lm.lat) {
    map.flyTo({ center: [lm.lng, lm.lat], zoom: 14, duration: 1000 });
  }
  // 打开详情
  showLandmarkDetail(lm);
}

// ==================== 地标详情弹窗 ====================
function showLandmarkDetail(lm) {
  const modal = document.getElementById('landmarkModal');
  const title = document.getElementById('lmModalTitle');
  const body = document.getElementById('lmModalBody');

  title.textContent = lm.name;

  const lmPoems = getLandmarkPoems(lm.id);
  const hasPoems = lmPoems.length > 0;
  const claimedByMe = isLandmarkClaimedByUser(lm.id);
  const claimer = getLandmarkClaimer(lm.id);
  const isClaimedByOthers = claimer && (!currentUser || claimer.userId !== currentUser.id);

  let poemsHtml = '';
  if (hasPoems) {
    poemsHtml = `<div style="margin:1rem 0;"><h4 style="margin-bottom:0.5rem;">📜 已有诗作 (${lmPoems.length})</h4>`;
    lmPoems.forEach(p => {
      poemsHtml += `
        <div class="poem-card" style="margin-bottom:0.5rem;">
          <div class="poem-title">${escapeHtml(p.title)}</div>
          <div class="poem-content">${escapeHtml(p.content)}</div>
          <div class="poem-meta">
            <span>by ${escapeHtml(p.author)} · ${formatDate(p.date)}</span>
            <span class="poem-votes" onclick="votePoem(${p.id});event.stopPropagation();">❤️ ${p.votes || 0}</span>
          </div>
        </div>
      `;
    });
    poemsHtml += '</div>';
  }

  // 认领状态提示
  let claimStatusHtml = '';
  if (claimedByMe) {
    const countdown = getClaimCountdown(lm.id);
    claimStatusHtml = `<div style="background:#E8F5E9;border:1px solid #2E7D6B;border-radius:8px;padding:0.75rem;margin-bottom:1rem;color:#2E7D6B;font-size:0.85rem;">✅ 您已认领此坐标！剩余时间：<strong>${countdown}</strong> · 请尽快投稿</div>`;
  } else if (isClaimedByOthers) {
    claimStatusHtml = `<div style="background:#FFF3E0;border:1px solid #E65100;border-radius:8px;padding:0.75rem;margin-bottom:1rem;color:#E65100;font-size:0.85rem;">⏳ 此坐标已被认领，正在创作中…</div>`;
  } else {
    claimStatusHtml = `<div style="background:#E3F2FD;border:1px solid #1565C0;border-radius:8px;padding:0.75rem;margin-bottom:1rem;color:#1565C0;font-size:0.85rem;">💡 此坐标空闲中，认领后可投稿（限48小时）</div>`;
  }

  // 按钮区域
  let actionHtml = '';
  if (claimedByMe) {
    actionHtml = `
      <button class="btn btn-primary" onclick="openSubmitForm(${lm.id})">✒️ 投稿写诗</button>
      <button class="btn btn-secondary" onclick="showPoster(${lm.id})">🖼️ 生成海报</button>
    `;
  } else if (isClaimedByOthers) {
    actionHtml = `
      <button class="btn btn-secondary" disabled style="opacity:0.6;">🔒 已被认领</button>
      <button class="btn btn-secondary" onclick="showPoster(${lm.id})">🖼️ 生成海报</button>
    `;
  } else {
    actionHtml = `
      <button class="btn btn-primary" onclick="claimLandmark(${lm.id})">📍 认领此坐标</button>
      <button class="btn btn-secondary" onclick="showPoster(${lm.id})">🖼️ 生成海报</button>
    `;
  }

  body.innerHTML = `
    <div class="landmark-detail">
      <div class="detail-meta">
        <span class="detail-tag" style="background:${lm.categoryColor}20;color:${lm.categoryColor};">${lm.categoryIcon} ${lm.categoryName}</span>
        <span class="detail-tag">${lm.district}</span>
      </div>
      <div class="detail-address">
        📍 ${lm.address}<br>
        <span class="detail-coords">坐标: ${lm.lng}, ${lm.lat}</span>
      </div>
      ${claimStatusHtml}
      ${poemsHtml}
      <div class="detail-actions">
        ${actionHtml}
      </div>
    </div>
  `;

  modal.classList.add('show');
}

// ==================== 投稿表单 ====================
function openSubmitForm(lmId) {
  requireLogin(() => {
    // 检查是否已认领
    if (!isLandmarkClaimedByUser(lmId)) {
      alert('请先认领此坐标，再进行投稿！');
      return;
    }
    closeModal('landmarkModal');
    const lm = LANDMARKS.find(l => l.id === lmId);
    if (!lm) return;

    document.getElementById('poemLandmarkId').value = lmId;
    document.getElementById('poemLandmarkName').value = lm.name;
    document.getElementById('poemAuthor').value = currentUser ? currentUser.nickname : '';
    document.getElementById('poemTitle').value = '';
    document.getElementById('poemContent').value = '';
    document.getElementById('charCount').textContent = '0 / 150';
    document.getElementById('charCount').classList.remove('warning');

    document.getElementById('submitModal').classList.add('show');
  });
}

function updateCharCount(textarea) {
  const count = textarea.value.length;
  const el = document.getElementById('charCount');
  el.textContent = `${count} / 150`;
  el.classList.toggle('warning', count > 140);
}

function handleSubmit(e) {
  e.preventDefault();

  const lmId = parseInt(document.getElementById('poemLandmarkId').value);
  const author = document.getElementById('poemAuthor').value.trim();
  const title = document.getElementById('poemTitle').value.trim();
  const content = document.getElementById('poemContent').value.trim();

  if (!author || !title || !content) {
    alert('请填写完整信息');
    return false;
  }

  if (content.length > 150) {
    alert('诗歌正文不能超过150字');
    return false;
  }

  const poem = {
    id: Date.now(),
    landmarkId: lmId,
    author,
    title,
    content,
    votes: 0,
    date: new Date().toISOString(),
    status: 'pending'
  };

  poems.push(poem);
  savePoems();

  closeModal('submitModal');

  // 询问是否AI润色
  setTimeout(() => {
    if (confirm('投稿成功！是否使用 AI 润色您的诗歌？')) {
      showPolish(poem);
    } else {
      alert('投稿已保存，等待审核！');
    }
  }, 300);

  return false;
}

// ==================== AI 润色（模拟） ====================
let currentPolishPoem = null;

function showPolish(poem) {
  currentPolishPoem = poem;
  document.getElementById('polishOriginal').textContent = poem.content;

  // 模拟AI润色：基于诗歌内容生成润色建议
  const polished = simulatePolish(poem.content);
  document.getElementById('polishResult').textContent = polished;

  document.getElementById('polishModal').classList.add('show');
}

function simulatePolish(original) {
  // MVP中使用简单的润色模板，实际可接入TRAE AI API
  const templates = [
    `【意象优化】在原稿基础上，建议增加更具画面感的意象描写，如将直白的叙述转化为可感的景物，让读者仿佛置身其中。\n\n润色参考：\n${original.substring(0, 50)}...（可进一步丰富感官细节）`,
    `【节奏调整】诗歌的节奏感可以通过句式的长短变化来强化。建议适当调整分行，让诗歌在诵读时更有韵律感。\n\n润色参考：\n${original}`,
    `【用词提升】整体意境优美，建议在某些关键词汇上做更精致的替换，使语言更加凝练，情感表达更加精准。\n\n润色参考：\n${original}`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function usePolishedPoem() {
  closeModal('polishModal');
  alert('已采用润色建议！您的诗歌已更新。');
}

// ==================== 投票 ====================
function votePoem(poemId) {
  const poem = poems.find(p => p.id === poemId);
  if (!poem) return;

  const votedKey = `voted_${poemId}`;
  if (localStorage.getItem(votedKey)) {
    alert('您已经投过票了！');
    return;
  }

  poem.votes = (poem.votes || 0) + 1;
  localStorage.setItem(votedKey, '1');
  savePoems();

  // 刷新当前弹窗
  const lm = LANDMARKS.find(l => l.id === poem.landmarkId);
  if (lm) showLandmarkDetail(lm);
}

// ==================== 海报生成 ====================
let currentPosterData = null;

function drawPoster(lm, poem) {
  const canvas = document.getElementById('posterCanvas');
  const ctx = canvas.getContext('2d');
  const W = 600, H = 800;
  canvas.width = W;
  canvas.height = H;

  // 背景：米白纸张质感
  ctx.fillStyle = '#FAF7F2';
  ctx.fillRect(0, 0, W, H);

  // 顶部装饰线
  ctx.strokeStyle = '#C15A3E';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(60, 60);
  ctx.lineTo(W - 60, 60);
  ctx.stroke();

  // 底部装饰线
  ctx.beginPath();
  ctx.moveTo(60, H - 60);
  ctx.lineTo(W - 60, H - 60);
  ctx.stroke();

  // 左侧竖线
  ctx.strokeStyle = '#D4CFC7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 100);
  ctx.lineTo(80, H - 100);
  ctx.stroke();

  // 地标名称
  ctx.fillStyle = '#2C2C2C';
  ctx.font = 'bold 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`📍 ${lm.name}`, W / 2, 110);

  // 分隔
  ctx.fillStyle = '#C15A3E';
  ctx.font = '16px serif';
  ctx.fillText('◆ ◆ ◆', W / 2, 150);

  // 诗歌正文
  const content = poem ? poem.content : '等待第一首诗……';
  ctx.fillStyle = '#2C2C2C';
  ctx.font = '22px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  const lines = wrapText(ctx, content, W - 160, 28);
  let y = 200;
  lines.forEach(line => {
    ctx.fillText(line, W / 2, y);
    y += 36;
  });

  // 作者
  const author = poem ? `—— ${poem.author}` : '';
  ctx.fillStyle = '#6B6560';
  ctx.font = 'italic 18px serif';
  ctx.textAlign = 'right';
  ctx.fillText(author, W - 80, y + 20);

  // 印章效果（圆形红色印章）
  const sealY = H - 140;
  ctx.beginPath();
  ctx.arc(W - 120, sealY, 32, 0, Math.PI * 2);
  ctx.strokeStyle = '#C15A3E';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#C15A3E';
  ctx.font = 'bold 14px serif';
  ctx.textAlign = 'center';
  ctx.fillText('诗意', W - 120, sealY - 4);
  ctx.fillText('茂名', W - 120, sealY + 14);

  // 底部标识
  ctx.fillStyle = '#6B6560';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('《诗意茂名地图》· 我为茂名写首诗', W / 2, H - 35);

  currentPosterData = { lm, poem };
  return canvas;
}

function wrapText(ctx, text, maxWidth, lineHeight) {
  const words = text.split('');
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line !== '') {
      lines.push(line);
      line = words[i];
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  return lines;
}

function showPoster(lmId) {
  const lm = LANDMARKS.find(l => l.id === lmId);
  if (!lm) return;

  const lmPoems = getLandmarkPoems(lmId);
  const poem = lmPoems[0];

  drawPoster(lm, poem);
  document.getElementById('posterModal').classList.add('show');
}

function downloadPoster() {
  const canvas = document.getElementById('posterCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  const lmName = currentPosterData ? currentPosterData.lm.name : 'poster';
  link.download = `诗意茂名_${lmName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ==================== 诗歌馆页面 ====================
function renderPoemFilter() {
  const container = document.getElementById('poemFilter');
  const cats = Object.entries(LANDMARK_CATEGORIES);

  let html = `<span class="filter-tag active" onclick="filterPoems('all',this)">全部</span>`;
  cats.forEach(([key, meta]) => {
    html += `<span class="filter-tag" onclick="filterPoems('${key}',this)">${meta.name}</span>`;
  });

  container.innerHTML = html;
}

function filterPoems(cat, el) {
  document.querySelectorAll('#poemFilter .filter-tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderPoemsList(cat);
}

function renderPoemsList(catFilter) {
  const container = document.getElementById('poemsList');
  let list = getApprovedPoems();

  if (catFilter && catFilter !== 'all') {
    const lmIds = LANDMARKS.filter(lm => lm.category === catFilter).map(lm => lm.id);
    list = list.filter(p => lmIds.includes(p.landmarkId));
  }

  // 更新统计
  document.getElementById('statPoems').textContent = getApprovedPoems().length;
  document.getElementById('statAuthors').textContent = new Set(getApprovedPoems().map(p => p.author)).size;
  document.getElementById('statVotes').textContent = getApprovedPoems().reduce((s, p) => s + (p.votes || 0), 0);

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted);">暂无诗歌，快来投稿吧！</div>`;
    return;
  }

  // 按投票数排序
  list.sort((a, b) => (b.votes || 0) - (a.votes || 0));

  let html = '';
  list.forEach(p => {
    const lm = LANDMARKS.find(l => l.id === p.landmarkId);
    html += `
      <div class="poem-card fade-in">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
          <span style="font-size:0.75rem;background:${lm ? lm.categoryColor : '#999'}20;color:${lm ? lm.categoryColor : '#999'};padding:0.15rem 0.5rem;border-radius:10px;">
            ${lm ? lm.categoryIcon : '📍'} ${lm ? lm.name : '未知地标'}
          </span>
          <span style="font-size:0.75rem;color:var(--muted);">${lm ? lm.district : ''}</span>
        </div>
        <div class="poem-title">${escapeHtml(p.title)}</div>
        <div class="poem-content">${escapeHtml(p.content)}</div>
        <div class="poem-meta">
          <span>by ${escapeHtml(p.author)} · ${formatDate(p.date)}</span>
          <span class="poem-votes" onclick="votePoem(${p.id})">❤️ ${p.votes || 0}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ==================== 页面路由 ====================
function setupRouting() {
  function showPage(page) {
    document.getElementById('mapPage').classList.toggle('hidden', page !== 'map');
    document.getElementById('poemsPage').classList.toggle('hidden', page !== 'poems');
    document.getElementById('aboutPage').classList.toggle('hidden', page !== 'about');
    document.getElementById('sidebar').classList.toggle('hidden', page !== 'map');

    document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });

    if (page === 'poems') {
      renderPoemsList('all');
    }

    if (page === 'map' && map) {
      setTimeout(() => map.resize(), 100);
    }
  }

  function handleHash() {
    const hash = location.hash.replace('#', '') || 'map';
    showPage(hash);
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();
}

// ==================== 弹窗管理 ====================
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function setupModalClose() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });
}

// ==================== 工具函数 ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
