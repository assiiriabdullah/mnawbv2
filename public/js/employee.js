// ============================================================
// Employee Page JS
// ============================================================

let currentUser = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.querySelector('div').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function statusBadge(status) {
    const map = {
        pending: { label: 'قيد الانتظار', color: 'bg-yellow-100 text-yellow-700' },
        approved: { label: 'معتمدة', color: 'bg-green-100 text-green-700' },
        rejected: { label: 'مرفوضة', color: 'bg-red-100 text-red-700' },
    };
    const s = map[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return `<span class="px-2 py-0.5 rounded-lg text-xs font-medium ${s.color}">${s.label}</span>`;
}

function roleBadge(role) {
    const labels = { general_manager: 'مدير عام', dept_manager: 'مدير إدارة', supervisor: 'ضابط', operator: 'منفذ' };
    const colors = { general_manager: 'bg-purple-100 text-purple-700', dept_manager: 'bg-indigo-100 text-indigo-700', supervisor: 'bg-blue-100 text-blue-700', operator: 'bg-gray-100 text-gray-700' };
    return `<span class="px-2 py-0.5 rounded-lg text-xs font-medium ${colors[role] || ''}">${labels[role] || role}</span>`;
}

async function apiCall(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
}

// ---- Auth ----
async function checkAuth() {
    try {
        const data = await apiCall('/api/auth/me');
        currentUser = data.user;
        if (currentUser.role === 'general_manager' || currentUser.role === 'dept_manager') {
            window.location.href = '/dashboard.html';
            return;
        }
        document.getElementById('userName').textContent = currentUser.name;
        const roleLabels = { general_manager: 'مدير عام', dept_manager: 'مدير إدارة', supervisor: 'ضابط', operator: 'منفذ' };
        document.getElementById('userRole').textContent = roleLabels[currentUser.role] || currentUser.role;

        // Show shift leaves section only for supervisors
        if (currentUser.role === 'supervisor') {
            document.getElementById('shiftLeavesSection').classList.remove('hidden');
        }

        // Show leave balance
        document.getElementById('leaveBalance').textContent = `${currentUser.annual_leave_balance} يوم`;
    } catch {
        window.location.href = '/';
    }
}

// ---- My Leaves ----
async function loadMyLeaves() {
    try {
        const leaves = await apiCall('/api/leaves');

        // Filter: my own leaves only
        const myLeaves = leaves.filter(l => l.employee_id === currentUser.id ||
            (currentUser.role === 'operator'));

        const tbody = document.getElementById('myLeavesTable');
        const empty = document.getElementById('myLeavesEmpty');

        // For operator: show all (they only get their own from API)
        // For supervisor: filter to their own
        const displayLeaves = currentUser.role === 'supervisor'
            ? leaves.filter(l => l.employee_id === undefined || l.employee_name === currentUser.name)
            : leaves;

        // Actually the API already filters, but let's separate my leaves from shift leaves
        const personalLeaves = leaves.filter(l => {
            // Check if this is my personal leave by checking employee_name match
            return l.employee_name === currentUser.name;
        });

        if (personalLeaves.length === 0) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        tbody.innerHTML = personalLeaves.map(l => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 text-gray-600">${l.start_date}</td>
        <td class="px-4 py-3 text-gray-600">${l.end_date}</td>
        <td class="px-4 py-3">${statusBadge(l.status)}</td>
      </tr>
    `).join('');

        // ---- Shift Leaves for Supervisor ----
        if (currentUser.role === 'supervisor') {
            const shiftLeaves = leaves.filter(l => l.status === 'approved' && l.employee_name !== currentUser.name);
            const shiftTbody = document.getElementById('shiftLeavesTable');
            const shiftEmpty = document.getElementById('shiftLeavesEmpty');

            if (shiftLeaves.length === 0) {
                shiftTbody.innerHTML = '';
                shiftEmpty.classList.remove('hidden');
            } else {
                shiftEmpty.classList.add('hidden');
                shiftTbody.innerHTML = shiftLeaves.map(l => `
          <tr class="hover:bg-gray-50/50 transition">
            <td class="px-4 py-3 font-medium text-gray-800">${l.employee_name}</td>
            <td class="px-4 py-3">${roleBadge(l.employee_role)}</td>
            <td class="px-4 py-3 text-gray-600">${l.start_date}</td>
            <td class="px-4 py-3 text-gray-600">${l.end_date}</td>
          </tr>
        `).join('');
            }
        }
    } catch (err) {
        showToast('خطأ في تحميل الإجازات');
    }
}

// ---- My Courses ----
async function loadMyCourses() {
    try {
        const courses = await apiCall('/api/courses');
        const tbody = document.getElementById('myCoursesTable');
        const empty = document.getElementById('myCoursesEmpty');

        if (courses.length === 0) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        tbody.innerHTML = courses.map(c => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 font-medium text-gray-800">${c.title}</td>
        <td class="px-4 py-3 text-gray-600">${c.location}</td>
        <td class="px-4 py-3 text-gray-600">${c.date}</td>
      </tr>
    `).join('');
    } catch (err) {
        showToast('خطأ في تحميل الدورات');
    }
}

// ---- My Mandates ----
async function loadMyMandates() {
    try {
        const mandates = await apiCall('/api/mandates');
        const tbody = document.getElementById('myMandatesTable');
        const empty = document.getElementById('myMandatesEmpty');

        if (mandates.length === 0) {
            tbody.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        tbody.innerHTML = mandates.map(m => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 font-medium text-gray-800">${m.title}</td>
        <td class="px-4 py-3 text-gray-600">${m.location}</td>
        <td class="px-4 py-3 text-gray-600">${m.date}</td>
      </tr>
    `).join('');
    } catch (err) {
        showToast('خطأ في تحميل الانتدابات');
    }
}

// ---- Leave Request ----
document.getElementById('requestLeaveBtn').addEventListener('click', () => {
    document.getElementById('leaveForm').reset();
    document.getElementById('leaveModal').classList.remove('hidden');
});

document.getElementById('leaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await apiCall('/api/leaves', {
            method: 'POST',
            body: JSON.stringify({
                start_date: document.getElementById('leaveStart').value,
                end_date: document.getElementById('leaveEnd').value,
            }),
        });
        showToast('تم تقديم طلب الإجازة بنجاح');
        document.getElementById('leaveModal').classList.add('hidden');
        await checkAuth(); // Refresh balance
        loadMyLeaves();
    } catch (err) {
        showToast(err.message);
    }
});

// ---- Password Change ----
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;

    try {
        await apiCall('/api/auth/change-password', {
            method: 'PUT',
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
        });
        showToast('تم تغيير كلمة المرور بنجاح');
        document.getElementById('passwordModal').classList.add('hidden');
        document.getElementById('passwordForm').reset();
    } catch (err) {
        showToast(err.message);
    }
});

// ---- Logout ----
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await apiCall('/api/auth/logout', { method: 'POST' });
    } catch (e) { }
    window.location.href = '/';
});

// ---- Initialize ----
(async () => {
    await checkAuth();
    loadMyLeaves();
    loadMyCourses();
    loadMyMandates();
})();
