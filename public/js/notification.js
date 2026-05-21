const bell = document.getElementById('notificationBell');
const box = document.getElementById('notificationBox');
const list = document.getElementById('notificationList');
const badge = document.getElementById('notificationBadge');

let shownIds = new Set(
  JSON.parse(localStorage.getItem('shownNotificationIds') || '[]')
);

let readIds = new Set(
  JSON.parse(localStorage.getItem('readNotificationIds') || '[]')
);

if (bell) {
  bell.addEventListener('click', () => {

    box.classList.toggle('d-none');

    document.querySelectorAll('[data-notification-id]').forEach(item => {
      readIds.add(item.dataset.notificationId);
    });

    localStorage.setItem('readNotificationIds', JSON.stringify([...readIds]));
    updateUnreadBadge(currentNotifications);

  });
}

// 點擊其他地方時，自動關閉通知框
document.addEventListener('click', (event) => {

  const isClickInsideBox = box.contains(event.target);
  const isClickBell = bell.contains(event.target);

  if (!isClickInsideBox && !isClickBell) {
    box.classList.add('d-none');
  }

});

let currentNotifications = [];

async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications');
    if (!res.ok) return;

    const data = await res.json();
    currentNotifications = data;

    renderNotifications(data);
    showNewPopup(data);

  } catch (error) {
    console.error('通知載入失敗', error);
  }
}

function renderNotifications(data) {
  if (!data || data.length === 0) {
    list.innerHTML = `<p class="text-muted mb-0">目前沒有通知</p>`;
    badge.classList.add('d-none');
    return;
  }

  list.innerHTML = data.map(item => `
    <div class="border-bottom py-2" data-notification-id="${item.Notification_ID}">
      <div class="fw-bold">${item.Notification_Type}</div>
      <div class="small text-muted">${new Date(item.Notification_Time).toLocaleString('zh-TW')}</div>
    </div>
  `).join('');

  updateUnreadBadge(data);
}

function showNewPopup(data) {
  data.forEach(item => {
    const id = String(item.Notification_ID);

    if (shownIds.has(id)) {
      return;
    }

    shownIds.add(id);
    localStorage.setItem(
      'shownNotificationIds',
      JSON.stringify([...shownIds])
    );

    const modalElement = document.getElementById('notificationModal');
    const modalBody = document.getElementById('notificationModalBody');

    modalBody.innerHTML = item.Notification_Type;

    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  });
}

function updateUnreadBadge(data = []) {
  const unreadCount = data.filter(item =>
    !readIds.has(String(item.Notification_ID))
  ).length;

  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }
}

loadNotifications();
setInterval(loadNotifications, 1000);