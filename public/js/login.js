// Login page logic
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorMsg = document.getElementById('errorMsg');
    const loginBtn = document.getElementById('loginBtn');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errorMsg.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'جاري تسجيل الدخول...';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            errorMsg.textContent = data.error;
            errorMsg.classList.remove('hidden');
            return;
        }

        // Redirect based on role
        if (data.user.role === 'manager') {
            window.location.href = '/dashboard.html';
        } else {
            window.location.href = '/employee.html';
        }
    } catch (err) {
        errorMsg.textContent = 'حدث خطأ في الاتصال بالسيرفر';
        errorMsg.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'تسجيل الدخول';
    }
});

// Check if already logged in
(async () => {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            if (data.user.role === 'manager') {
                window.location.href = '/dashboard.html';
            } else {
                window.location.href = '/employee.html';
            }
        }
    } catch (e) { }
})();
