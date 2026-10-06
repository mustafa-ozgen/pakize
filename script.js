/* ===========================================================
   Pakize 🐾 — uygulama mantığı
   Tüm bilgiler pakize.json dosyasından okunur.
   =========================================================== */
'use strict';

const DATA_URL = 'pakize.json';

/* Kayıt türleri: etiket, ikon ve renk */
const TYPE_META = {
  parazit: { label: 'İç-Dış Parazit', icon: '🛡️', color: '#8b5cf6' },
  asi:     { label: 'Aşı',            icon: '💉', color: '#22a06b' },
  kan:     { label: 'Kan Tahlili',    icon: '🩸', color: '#ef4444' },
  kilo:    { label: 'Kilo Ölçümü',    icon: '⚖️', color: '#f59e0b' },
  ameliyat: { label: 'Ameliyat',      icon: '🔪', color: '#3b82f6' }
};

/* Hatırlatma süreleri (JSON'daki reminderIntervals yoksa yedek olarak kullanılır) */
const REMINDER_INTERVALS = {
  asi: { months: 24, label: 'Karma Aşı Tekrarı', titleMatch: 'karma', icon: '💉' },
  kuduz: { months: 12, label: 'Kuduz Aşısı Tekrarı', titleMatch: 'kuduz', icon: '💉' },
  kan: { months: 12, label: 'Kan Tahlili Tekrarı', icon: '🩸' },
  parazit: { months: 3, label: 'İç/Dış Parazit Tekrarı', icon: '🛡️' },
  ameliyat: { months: 12, label: 'Ameliyat Kontrolü', icon: '🔪' }
};

const MONTHS_LONG = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const MONTHS_SHORT = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

const $ = (id) => document.getElementById(id);

const STATE = {
  data: null,
  events: [],
  weights: [],
  filter: 'all'
};

/* ---------- tarih yardımcıları ---------- */
function parseDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function formatLong(str) {
  const d = parseDate(str);
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
function formatShort(str) {
  const d = parseDate(str);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function formatDot(str) {
  const d = parseDate(str);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function daysBetween(a, b) {
  // Saat dilimini hesaba katmamak için iki tarihi de gece yarısına sabitleriz.
  // Aksi halde öğlen vakti fark 218.5 gün'e çıkıp Math.round ile 219'a yuvarlanır.
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86400000);
}

/* ---------- yaş hesabı ---------- */
function computeAge(birthStr) {
  const b = parseDate(birthStr);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  let days = now.getDate() - b.getDate();

  if (days < 0) {
    months--;
    const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  const totalDays = Math.max(0, daysBetween(b, now));
  return { years, months, days, totalDays };
}
function ageShort(a) {
  if (a.years > 0) return a.months > 0 ? `${a.years} yaş ${a.months} ay` : `${a.years} yaş`;
  if (a.months > 0) return `${a.months} aylık`;
  return `${a.days} günlük`;
}
function formatGram(v) {
  return new Intl.NumberFormat('tr-TR').format(v) + ' gr';
}
function kgText(v) {
  return (v / 1000).toFixed(2).replace('.', ',') + ' kg';
}

/* ---------- ana render ---------- */
function render(data) {
  renderHero(data.cat || {});
  renderStats(data);
  renderWeights();
  renderFilters();
  renderTimeline();
  renderReminders(data);
  document.title = `${(data.cat && data.cat.name) || 'Pakize'} 🐾`;
  $('footerName').textContent = (data.cat && data.cat.name) || 'Pakize';
}

/* ---------- hatırlatmalar ---------- */
function renderReminders(data) {
  const intervals = data.reminderIntervals || REMINDER_INTERVALS;
  const reminders = calculateReminders(data.events || [], intervals);
  const container = $('remindersSection');
  
  if (!container) return;
  
  if (reminders.length === 0) {
    container.innerHTML = '<p>Hatırlatma bulunmamaktadır.</p>';
    return;
  }
  
  container.innerHTML = reminders.map(r => {
    const meta = TYPE_META[r.type] || { label: r.type || '', icon: '📅', color: '#f6a623' };
    const icon = r.icon || (TYPE_META[r.type] && TYPE_META[r.type].icon) || '📅';
    let daysText;
    if (r.daysUntil < 0) {
      daysText = `Gecikti! ${Math.abs(r.daysUntil)} gün önce yapılmış olmalıydı`;
    } else if (r.daysUntil === 0) {
      daysText = 'Bugün!';
    } else if (r.daysUntil === 1) {
      daysText = 'Yarın';
    } else if (r.daysUntil <= 7) {
      daysText = `${r.daysUntil} gün içinde`;
    } else if (r.daysUntil <= 60) {
      daysText = `${Math.ceil(r.daysUntil / 7)} hafta içinde`;
    } else {
      daysText = `${Math.round(r.daysUntil / 30)} ay içinde`;
    }
    
    const overdue = r.daysUntil < 0;
    return `<div class="reminder-item${overdue ? ' overdue' : ''}">
      <div class="reminder-icon" style="background:${meta.color};color:#fff">${icon}</div>
      <div class="reminder-details">
        <h3>${escapeHtml(r.title)}</h3>
        <p class="reminder-date">${formatDot(r.dateISO)}</p>
        <p class="reminder-days">${daysText}</p>
      </div>
    </div>`;
  }).join('');
}

/* ---------- hero ---------- */
function renderHero(cat) {
  if (cat.name) $('catName').textContent = cat.name;
  if (cat.photo) {
    const img = $('profileImg');
    img.src = cat.photo;
    img.alt = (cat.name || 'Kedi') + ' fotoğrafı';
  }
  $('catBio').textContent = cat.bio || '';

  const chips = [];
  if (cat.species) chips.push('🐱 ' + cat.species);
  if (cat.breed) chips.push('🏷️ ' + cat.breed);
  if (cat.gender) chips.push('💗 ' + cat.gender);
  $('catChips').innerHTML = chips.map((c) => `<li>${escapeHtml(c)}</li>`).join('');

  if (cat.birthDate) {
    const age = computeAge(cat.birthDate);
    $('ageValue').textContent = ageShort(age);
    $('daysValue').textContent = new Intl.NumberFormat('tr-TR').format(age.totalDays) + ' gün';
    $('birthValue').textContent = formatShort(cat.birthDate);
  }
}

/* ---------- özet kartları ---------- */
function renderStats(data) {
  const cat = data.cat || {};
  const events = data.events || [];
  const lastW = STATE.weights.length ? STATE.weights[STATE.weights.length - 1] : null;
  const asiCount = events.filter((e) => e.type === 'asi').length;

  const age = cat.birthDate ? computeAge(cat.birthDate) : null;

  const stats = [
    { icon: '🎂', value: age ? ageShort(age) : '—', label: 'Yaş' },
    { icon: '⚖️', value: lastW ? kgText(lastW.value) : '—', label: 'Son Kilo' },
    { icon: '💉', value: asiCount + ' doz', label: 'Aşı' },
    { icon: '📋', value: events.length + ' kayıt', label: 'Toplam' }
  ];

  $('statsGrid').innerHTML = stats
    .map(
      (s, i) => `
      <div class="stat" style="animation-delay:${i * 60}ms">
        <div class="stat-icon">${s.icon}</div>
        <div class="stat-value">${escapeHtml(s.value)}</div>
        <div class="stat-label">${escapeHtml(s.label)}</div>
      </div>`
    )
    .join('');
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ---------- kilo grafiği + listesi ---------- */
function renderWeights() {
  const weights = STATE.weights; // artan sırada { date, value }
  renderChart(weights);
  renderWeightList(weights);

  const badge = $('weightBadge');
  if (weights.length) {
    const first = weights[0].value;
    const last = weights[weights.length - 1].value;
    const diff = last - first;
    badge.textContent = `${formatGram(last)}  (${diff >= 0 ? '+' : ''}${new Intl.NumberFormat('tr-TR').format(diff)} gr)`;
  } else {
    badge.textContent = '—';
  }
}

function renderChart(weights) {
  const svg = $('weightChart');
  if (!weights.length) {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 340 170');
    return;
  }

  const W = Math.max(280, (svg.parentElement && svg.parentElement.clientWidth) - 8 || 320);
  const H = 170;
  const padL = 50, padR = 18, padT = 22, padB = 32;

  const values = weights.map((w) => w.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 150; max += 150; }
  const pad = (max - min) * 0.18;
  const lo = min - pad;
  const hi = max + pad;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;

  const xAt = (i) => padL + (weights.length === 1 ? plotW / 2 : (plotW * i) / (weights.length - 1));
  const yAt = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));

  let out = `<defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f6a623" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#f6a623" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  // yatay ızgara çizgileri
  const steps = 3;
  for (let i = 0; i <= steps; i++) {
    const yy = padT + (plotH * i) / steps;
    const val = hi - (hi - lo) * (i / steps);
    out += `<line class="grid-line" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>`;
    out += `<text class="axis-label" x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${Math.round(val)}</text>`;
  }

  // alan + çizgi
  const pts = weights.map((w, i) => `${xAt(i).toFixed(1)},${yAt(w.value).toFixed(1)}`);
  const areaPath = `M ${xAt(0).toFixed(1)},${baseY.toFixed(1)} L ${pts.join(' L ')} L ${xAt(weights.length - 1).toFixed(1)},${baseY.toFixed(1)} Z`;
  out += `<path class="area" d="${areaPath}"/>`;
  out += `<polyline class="line" points="${pts.join(' ')}"/>`;

  // noktalar + değer + tarih etiketleri
  const showAll = weights.length <= 5;
  weights.forEach((w, i) => {
    const cx = xAt(i), cy = yAt(w.value);
    const last = i === weights.length - 1;
    out += `<circle class="dot${last ? ' last' : ''}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${last ? 6 : 5}"/>`;
    out += `<text class="axis-label" x="${cx.toFixed(1)}" y="${(cy - 12).toFixed(1)}" text-anchor="middle" style="fill:${last ? '#ff7a59' : '#f6a623'}">${w.value}</text>`;
    if (showAll || i === 0 || last) {
      out += `<text class="axis-label" x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${formatDot(w.date).slice(0, 5)}</text>`;
    }
  });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = out;
}

function renderWeightList(weights) {
  const ul = $('weightList');
  if (!weights.length) {
    ul.innerHTML = '';
    return;
  }
  ul.innerHTML = weights
    .map((w, i) => {
      const prev = i > 0 ? weights[i - 1].value : null;
      let diffHtml = '';
      if (prev != null) {
        const d = w.value - prev;
        const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
        const sign = d > 0 ? '+' : '';
        diffHtml = `<span class="w-diff ${cls}">${sign}${new Intl.NumberFormat('tr-TR').format(d)} gr</span>`;
      }
      return `<li>
        <span>${escapeHtml(formatLong(w.date))}</span>
        <span class="w-right">
          ${diffHtml}
          <strong>${escapeHtml(formatGram(w.value))}</strong>
        </span>
      </li>`;
    })
    .join('');
}

/* ---------- filtre çubuğu ---------- */
function renderFilters() {
  const types = ['all', ...Object.keys(TYPE_META)];
  $('filterBar').innerHTML = types
    .map((t) => {
      const meta = t === 'all' ? { label: 'Tümü', icon: '🐾' } : TYPE_META[t];
      const active = STATE.filter === t ? ' active' : '';
      return `<button class="filter-btn${active}" type="button" role="tab" data-filter="${t}">${meta.icon} ${meta.label}</button>`;
    })
    .join('');
}

/* ---------- zaman çizelgesi ---------- */
function renderTimeline() {
  const events = [...STATE.events].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  const list = STATE.filter === 'all' ? events : events.filter((e) => e.type === STATE.filter);

  const empty = $('timelineEmpty');
  const ol = $('timeline');

  if (!list.length) {
    ol.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  ol.innerHTML = list
    .map((e) => {
      const meta = TYPE_META[e.type] || { label: e.type || '', icon: '📌', color: '#f6a623' };
      const valueHtml =
        e.value != null
          ? `<span class="tl-value">${escapeHtml(formatGram(e.value))}</span>`
          : '';
      return `<li class="tl-item">
        <div class="tl-icon" aria-hidden="true">${meta.icon}</div>
        <div class="tl-body">
          <span class="tl-title">${escapeHtml(e.title || meta.label)}</span>
          <span class="tl-date">${escapeHtml(formatLong(e.date))}</span>
          ${valueHtml}
          <span class="tl-tag" style="background:${hexToRgba(meta.color, 0.14)};color:${meta.color}">${escapeHtml(meta.label)}</span>
        </div>
      </li>`;
    })
    .join('');
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------- hatıratma hesaplama ---------- */
function calculateReminders(events, reminderIntervals) {
  const now = new Date();
  const reminders = [];

  // Her hatırlatma tipi için en son yapılan tarihi bul ve hesapla
  Object.entries(reminderIntervals).forEach(([eventType, intervalConfig]) => {
    // titleMatch verilmişse başlığa göre, verilmemişse type'a göre filtrele
    // (ör. "Kuduz Aşısı" type:asi ile kayıtlı olduğu için başlık eşleşmesi gerekir)
    const candidates = events.filter((e) => {
      if (!e.date) return false;
      if (intervalConfig.titleMatch) {
        return String(e.title || '').toLowerCase().includes(intervalConfig.titleMatch.toLowerCase());
      }
      return e.type === eventType;
    });

    const lastEvent = candidates.sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];
    if (!lastEvent) return;

    const lastDate = parseDate(lastEvent.date);
    // Bileşenlerle kuruyoruz; ay sonu taşmaları (ör. 31 Ocak + 1 ay) güvenli şekilde normalize olur.
    const nextDate = new Date(
      lastDate.getFullYear(),
      lastDate.getMonth() + intervalConfig.months,
      lastDate.getDate()
    );
    const daysUntil = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
    const pad = (n) => String(n).padStart(2, '0');

    reminders.push({
      type: eventType,
      title: intervalConfig.label,
      icon: intervalConfig.icon,
      // toISOString yerine yerel bileşenlerden üretiriz; UTC'ye geçişte gün kaymasın diye.
      dateISO: `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}-${pad(nextDate.getDate())}`,
      daysUntil: daysUntil,
      lastDate: lastEvent.date,
      intervalMonths: intervalConfig.months
    });
  });

  // Tarihe göre sırala (yakındakiler önce)
  return reminders.sort((a, b) => parseDate(a.dateISO) - parseDate(b.dateISO));
}

/* ---------- veri yükleme ---------- */
function buildWeights(events) {
  return (events || [])
    .filter((e) => e.type === 'kilo' && e.value != null)
    .map((e) => ({ date: e.date, value: Number(e.value) }))
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

async function loadData() {
  $('loadingOverlay').hidden = false;
  $('errorOverlay').hidden = true;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    STATE.data = data;
    STATE.events = Array.isArray(data.events) ? data.events : [];
    STATE.weights = buildWeights(STATE.events);

    render(data);
    $('loadingOverlay').hidden = true;
  } catch (err) {
    console.error('[Pakize] veri yüklenemedi:', err);
    $('loadingOverlay').hidden = true;
    $('errorOverlay').hidden = false;
    $('errorText').textContent =
      'Bilgiler yüklenemedi. pakize.json dosyasının doğru konumda olduğundan emin ol.';
  }
}

/* ---------- servis çalışanı ---------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // file:// üzerinde SW çalışmaz
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('[Pakize] SW kaydı başarısız:', err);
    });
  });
}

/* ---------- olaylar & başlatma ---------- */
function setupEvents() {
  $('filterBar').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    STATE.filter = btn.dataset.filter || 'all';
    renderFilters();
    renderTimeline();
  });

  $('retryBtn').addEventListener('click', loadData);

  let t = null;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => renderChart(STATE.weights), 150);
  });
}

function init() {
  setupEvents();
  registerServiceWorker();
  loadData();
}

document.addEventListener('DOMContentLoaded', init);
