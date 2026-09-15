const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwY_lVzzrHYb9VAqbx0me6BjXJfPsg3nHPhyPwKgj_ocryi1w-Vkf8BC02OR_8wvd9rIw/exec";

async function loginUser(username, password) {
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "login",
      username: username,
      password: password
    })
  });

  const result = await response.json();

  if (result.success) {
    // Store user session in localStorage
    localStorage.setItem("bluebook_auth_token", result.token);
    localStorage.setItem("bluebook_user", JSON.stringify(result.user));

    alert(`Welcome, ${result.user.displayName}!`);
    showAppDashboard();
  } else {
    alert(`Login failed: ${result.error}`);
  }
}

// Log out teammate
function logoutUser() {
  localStorage.removeItem("bluebook_auth_token");
  localStorage.removeItem("bluebook_user");
  showLoginScreen();
}
