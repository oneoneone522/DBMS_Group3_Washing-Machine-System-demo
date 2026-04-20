async function checkLogin(onSuccess) {
  const response = await fetch('/api/check-login');
  const data = await response.json();
  if (!data.logged_in) {
    window.location.href = '/login';
  } else {
    if (onSuccess) onSuccess();  // 登入成功後執行各頁面自己的function
  }
}