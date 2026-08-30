// modules/ui-helpers.js — Shared UI utility functions

/**
 * إنشاء skeleton loading cards
 */
export function createSkeletonCards(count = 6) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'item-card skeleton-card';
    card.innerHTML = `
      <div class="skeleton skeleton-poster"></div>
      <div class="skeleton skeleton-text" style="margin:6px;height:12px;"></div>
      <div class="skeleton skeleton-text-sm" style="margin:0 6px 6px;height:10px;width:40%;"></div>
    `;
    fragment.appendChild(card);
  }
  return fragment;
}

/**
 * إنشاء skeleton loading لقائمة Continue
 */
export function createSkeletonList(count = 4) {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'continue-card';
    card.innerHTML = `
      <div class="skeleton" style="width:48px;height:72px;border-radius:4px;flex-shrink:0;"></div>
      <div class="continue-info" style="flex:1;">
        <div class="skeleton" style="height:14px;width:70%;margin-bottom:6px;"></div>
        <div class="skeleton" style="height:10px;width:50%;margin-bottom:6px;"></div>
        <div class="skeleton" style="height:3px;width:100%;"></div>
      </div>
    `;
    fragment.appendChild(card);
  }
  return fragment;
}

/**
 * عرض Toast notification
 */
export function showToast(message, type = 'info', duration = 2500) {
  const existing = document.getElementById('sh-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'sh-toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.getElementById('app').appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * فورمات وقت — تحويل ثواني لنص مقروء
 */
export function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
