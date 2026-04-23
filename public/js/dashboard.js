// ============================================================
// Dashboard JS - Manager Panel (Multi-Department)
// ============================================================

let currentUser = null;

// ---- Utility Functions ----
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.querySelector('div').textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// Make closeModal available globally for onclick handlers
window.closeModal = closeModal;

function roleLabel(role) {
    const labels = { general_manager: 'مدير عام', dept_manager: 'مدير إدارة', supervisor: 'ضابط', operator: 'منفذ' };
    return labels[role] || role;
}

function roleBadge(role) {
    const colors = {
        general_manager: 'bg-purple-100 text-purple-700',
        dept_manager: 'bg-indigo-100 text-indigo-700',
        supervisor: 'bg-blue-100 text-blue-700',
        operator: 'bg-gray-100 text-gray-700',
    };
    return `<span class="px-2 py-0.5 rounded-lg text-xs font-medium ${colors[role] || ''}">${roleLabel(role)}</span>`;
}

function deptLabel(dept) {
    const labels = {
        shifts: 'المناوبات',
        hr: 'الموارد البشرية',
        operations: 'العمليات',
        workforce: 'القوى العاملة',
    };
    return dept ? labels[dept] || dept : 'الإدارة العامة';
}

function deptBadge(dept) {
    const colors = {
        shifts: 'bg-amber-100 text-amber-700',
        hr: 'bg-pink-100 text-pink-700',
        operations: 'bg-cyan-100 text-cyan-700',
        workforce: 'bg-violet-100 text-violet-700',
    };
    return `<span class="px-2 py-0.5 rounded-lg text-xs font-medium ${colors[dept] || 'bg-gray-100 text-gray-500'}">${deptLabel(dept)}</span>`;
}

function shiftLabel(shift) {
    if (!shift) return '—';
    if (shift === 'مساندة_صباحية') return 'مساندة صباحية';
    if (shift === 'مساندة_مسائية') return 'مساندة مسائية';
    return shift;
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
        if (currentUser.role !== 'general_manager' && currentUser.role !== 'dept_manager') {
            window.location.href = '/employee.html';
            return;
        }
        document.getElementById('userName').textContent = currentUser.name;
    } catch {
        window.location.href = '/';
    }
}

// ---- Navigation ----
function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.content-section');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;

            // Update active link
            links.forEach(l => l.classList.remove('bg-emerald-50', 'text-emerald-700'));
            link.classList.add('bg-emerald-50', 'text-emerald-700');

            // Show section
            sections.forEach(s => s.classList.add('hidden'));
            document.getElementById(`section-${section}`).classList.remove('hidden');

            // Load data
            loadSection(section);

            // Close mobile sidebar
            document.getElementById('sidebar').classList.add('translate-x-full');
            document.getElementById('sidebarOverlay').classList.add('hidden');
        });
    });

    // Default to stats section
    links[0].click();

    // Auto update badge every 30 seconds
    setInterval(updateBadge, 30000);
}

// ---- Stats & Activity ----
async function loadStats() {
    try {
        const stats = await apiCall('/api/stats');

        // Update cards
        document.getElementById('statTotalEmployees').textContent = stats.totalEmployees;
        document.getElementById('statPendingLeaves').textContent = stats.pendingLeaves;
        document.getElementById('statTotalCourses').textContent = stats.totalCourses;
        document.getElementById('statTotalMandates').textContent = stats.totalMandates;

        // Shift Stats
        const shiftContainer = document.getElementById('shiftStats');
        if (stats.byShift.length === 0) {
            shiftContainer.innerHTML = '<p class="text-gray-500 text-center py-4">لا يوجد موظفين بمناوبات</p>';
        } else {
            shiftContainer.innerHTML = stats.byShift.map(s => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span class="font-medium text-gray-700">${shiftLabel(s.shift)}</span>
                    <span class="bg-white px-3 py-1 rounded-lg text-sm font-bold shadow-sm text-gray-600">${s.count}</span>
                </div>
            `).join('');
        }

        // Recent Leaves
        const leavesContainer = document.getElementById('recentLeaves');
        if (stats.recentLeaves.length === 0) {
            leavesContainer.innerHTML = '<p class="text-gray-500 text-center py-4">لا توجد طلبات حديثة</p>';
        } else {
            leavesContainer.innerHTML = stats.recentLeaves.map(l => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-xl border-r-4 ${getStatusColor(l.status)}">
                    <div>
                        <p class="font-bold text-gray-800">${l.employee_name}</p>
                        <p class="text-xs text-gray-500">${l.start_date} - ${l.end_date}</p>
                    </div>
                    ${statusBadge(l.status)}
                </div>
            `).join('');
        }

    } catch (err) {
        showToast('فشل تحميل الإحصائيات');
    }
}

// ---- Department Tabs ----
let cachedDepartments = null;

function setupDeptTabs() {
    const tabs = document.querySelectorAll('.dept-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update tab styles
            tabs.forEach(t => {
                t.classList.remove('active-dept-tab', 'bg-emerald-600', 'text-white', 'shadow-md');
                t.classList.add('text-gray-500', 'hover:bg-gray-100');
            });
            tab.classList.add('active-dept-tab', 'bg-emerald-600', 'text-white', 'shadow-md');
            tab.classList.remove('text-gray-500', 'hover:bg-gray-100');

            const deptKey = tab.dataset.deptTab;

            if (deptKey === 'overview') {
                document.getElementById('tabContent-overview').classList.remove('hidden');
                document.getElementById('tabContent-dept').classList.add('hidden');
            } else {
                document.getElementById('tabContent-overview').classList.add('hidden');
                document.getElementById('tabContent-dept').classList.remove('hidden');
                renderDeptDetail(deptKey);
            }
        });
    });

    // Apply initial style to active tab
    const activeTab = document.querySelector('.dept-tab[data-dept-tab="overview"]');
    if (activeTab) {
        activeTab.classList.add('bg-emerald-600', 'text-white', 'shadow-md');
        activeTab.classList.remove('text-gray-500', 'hover:bg-gray-100');
    }
    // Apply inactive style to others
    tabs.forEach(t => {
        if (t.dataset.deptTab !== 'overview') {
            t.classList.add('text-gray-500', 'hover:bg-gray-100');
        }
    });
}

async function renderDeptDetail(deptKey) {
    const container = document.getElementById('tabContent-dept');

    // Show loading
    container.innerHTML = '<div class="text-center py-8 text-gray-400">جاري التحميل...</div>';

    try {
        // Get departments data
        if (!cachedDepartments) {
            cachedDepartments = await apiCall('/api/stats/departments');
        }
        const dept = cachedDepartments.find(d => d.key === deptKey);
        if (!dept) {
            container.innerHTML = '<p class="text-center py-8 text-gray-400">إدارة غير موجودة</p>';
            return;
        }

        // Get employees for this department
        let employees = [];
        try {
            const allEmps = await apiCall('/api/employees');
            employees = allEmps.filter(e => e.department === deptKey);
        } catch (e) { }

        const deptColors = {
            shifts: { gradient: 'from-amber-500 to-orange-600', light: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
            hr: { gradient: 'from-pink-500 to-rose-600', light: 'bg-pink-50 text-pink-700', border: 'border-pink-200' },
            operations: { gradient: 'from-cyan-500 to-blue-600', light: 'bg-cyan-50 text-cyan-700', border: 'border-cyan-200' },
            workforce: { gradient: 'from-violet-500 to-purple-600', light: 'bg-violet-50 text-violet-700', border: 'border-violet-200' },
        };
        const colors = deptColors[deptKey] || deptColors.shifts;

        container.innerHTML = `
            <!-- Department Header -->
            <div class="bg-gradient-to-l ${colors.gradient} rounded-2xl p-6 text-white mb-6 shadow-lg">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-2xl font-bold">${dept.name}</h3>
                        <p class="text-white/80 mt-1">مدير الإدارة: <strong class="text-white">${dept.managerName}</strong></p>
                    </div>
                </div>
            </div>

            <!-- Department Stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div class="bg-white p-4 rounded-2xl shadow-sm border ${colors.border} text-center">
                    <p class="text-3xl font-bold text-gray-800">${dept.totalEmployees}</p>
                    <p class="text-xs text-gray-500 mt-1 font-medium">إجمالي الموظفين</p>
                </div>
                <div class="bg-white p-4 rounded-2xl shadow-sm border ${colors.border} text-center">
                    <p class="text-3xl font-bold text-gray-800">${dept.supervisors}</p>
                    <p class="text-xs text-gray-500 mt-1 font-medium">ضباط</p>
                </div>
                <div class="bg-white p-4 rounded-2xl shadow-sm border ${colors.border} text-center">
                    <p class="text-3xl font-bold text-gray-800">${dept.operators}</p>
                    <p class="text-xs text-gray-500 mt-1 font-medium">منفذين</p>
                </div>
                <div class="bg-white p-4 rounded-2xl shadow-sm border ${colors.border} text-center">
                    <p class="text-3xl font-bold ${dept.pendingLeaves > 0 ? 'text-yellow-600' : 'text-gray-800'}">${dept.pendingLeaves}</p>
                    <p class="text-xs text-gray-500 mt-1 font-medium">إجازات معلقة</p>
                </div>
            </div>

            <!-- Employees Table -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-100">
                    <h4 class="font-bold text-gray-800">موظفو الإدارة</h4>
                </div>
                ${employees.length === 0
                ? '<p class="text-center py-8 text-gray-400">لا يوجد موظفين في هذه الإدارة</p>'
                : `<div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th class="px-4 py-3 text-right font-medium text-gray-500">الاسم</th>
                                    <th class="px-4 py-3 text-right font-medium text-gray-500">الدور</th>
                                    <th class="px-4 py-3 text-right font-medium text-gray-500">المناوبة</th>
                                    <th class="px-4 py-3 text-right font-medium text-gray-500">تاريخ التعيين</th>
                                    <th class="px-4 py-3 text-right font-medium text-gray-500">رصيد الإجازات</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50">
                                ${employees.map(emp => `
                                    <tr class="hover:bg-gray-50/50 transition">
                                        <td class="px-4 py-3 font-medium text-gray-800">${emp.name}</td>
                                        <td class="px-4 py-3">${roleBadge(emp.role)}</td>
                                        <td class="px-4 py-3 text-gray-600">${shiftLabel(emp.shift)}</td>
                                        <td class="px-4 py-3 text-gray-600">${emp.join_date}</td>
                                        <td class="px-4 py-3 text-gray-600">${emp.annual_leave_balance ?? '—'} يوم</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`
            }
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<p class="text-center py-8 text-red-500">فشل تحميل بيانات الإدارة</p>';
    }
}

// ---- Departments ----
async function loadDepartments() {
    try {
        const departments = await apiCall('/api/stats/departments');
        const container = document.getElementById('departmentCards');

        const deptIcons = {
            shifts: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
            hr: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
            operations: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
            workforce: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`,
        };

        const deptColors = {
            shifts: { bg: 'from-amber-500 to-orange-600', icon: 'bg-amber-400/30', border: 'border-amber-200' },
            hr: { bg: 'from-pink-500 to-rose-600', icon: 'bg-pink-400/30', border: 'border-pink-200' },
            operations: { bg: 'from-cyan-500 to-blue-600', icon: 'bg-cyan-400/30', border: 'border-cyan-200' },
            workforce: { bg: 'from-violet-500 to-purple-600', icon: 'bg-violet-400/30', border: 'border-violet-200' },
        };

        container.innerHTML = departments.map(dept => {
            const colors = deptColors[dept.key] || deptColors.shifts;
            const icon = deptIcons[dept.key] || deptIcons.shifts;

            return `
                <div class="bg-white rounded-2xl shadow-sm border ${colors.border} overflow-hidden hover:shadow-md transition-shadow">
                    <div class="bg-gradient-to-l ${colors.bg} p-5 text-white">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="text-lg font-bold">${dept.name}</h3>
                                <p class="text-sm opacity-90 mt-1">مدير: ${dept.managerName}</p>
                            </div>
                            <div class="w-14 h-14 ${colors.icon} rounded-xl flex items-center justify-center">
                                ${icon}
                            </div>
                        </div>
                    </div>
                    <div class="p-5">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold text-gray-800">${dept.totalEmployees}</p>
                                <p class="text-xs text-gray-500 mt-1">إجمالي الموظفين</p>
                            </div>
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold text-gray-800">${dept.supervisors}</p>
                                <p class="text-xs text-gray-500 mt-1">ضباط</p>
                            </div>
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold text-gray-800">${dept.operators}</p>
                                <p class="text-xs text-gray-500 mt-1">منفذين</p>
                            </div>
                            <div class="text-center p-3 bg-gray-50 rounded-xl">
                                <p class="text-2xl font-bold ${dept.pendingLeaves > 0 ? 'text-yellow-600' : 'text-gray-800'}">${dept.pendingLeaves}</p>
                                <p class="text-xs text-gray-500 mt-1">إجازات معلقة</p>
                            </div>
                        </div>
                        <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                            <span class="text-sm text-gray-500">الدورات التدريبية: <strong class="text-gray-700">${dept.totalCourses}</strong></span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        showToast('فشل تحميل إحصائيات الإدارات');
    }
}

async function loadActivity() {
    try {
        const activities = await apiCall('/api/stats/activity');
        const tbody = document.getElementById('activityTable');

        if (activities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">لا يوجد نشاطات مسجلة</td></tr>';
            return;
        }

        tbody.innerHTML = activities.map(a => `
            <tr class="hover:bg-gray-50/50 transition">
                <td class="px-4 py-3 text-right text-gray-600" dir="ltr">${new Date(a.created_at).toLocaleString('ar-EG')}</td>
                <td class="px-4 py-3 text-right font-medium text-gray-800">${a.user_name}</td>
                <td class="px-4 py-3 text-right">
                    <span class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">${a.target_type}</span>
                </td>
                <td class="px-4 py-3 text-right font-medium text-emerald-600">${a.action}</td>
                <td class="px-4 py-3 text-right text-gray-600">${a.target_name || '-'}</td>
                <td class="px-4 py-3 text-right text-gray-500 text-sm truncate max-w-xs" title="${a.details || ''}">${a.details || '-'}</td>
            </tr>
        `).join('');
    } catch (err) {
        showToast('فشل تحميل سجل النشاطات');
    }
}

async function updateBadge() {
    try {
        const stats = await apiCall('/api/stats');
        const badge = document.getElementById('pendingBadge');
        if (stats.pendingLeaves > 0) {
            badge.textContent = stats.pendingLeaves;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (err) {
        console.error('Failed to update badge');
    }
}

function getStatusColor(status) {
    if (status === 'approved') return 'border-emerald-500';
    if (status === 'rejected') return 'border-red-500';
    return 'border-yellow-500';
}

function loadSection(section) {
    // Auto-update badge logic
    updateBadge();

    // Invalidate dept cache on section change
    cachedDepartments = null;

    switch (section) {
        case 'stats': loadStats(); loadDepartments(); break;
        case 'activity': loadActivity(); break;
        case 'employees': loadEmployees(); break;
        case 'leaves': loadLeaves(); break;
        case 'courses': loadCourses(); break;
        case 'mandates': loadMandates(); break;
        case 'attendance': loadApprovedAttendance(); break;
        case 'employee-profile': break; // loaded via viewEmployeeProfile
    }
}

// ---- Mobile Menu ----
function setupMobileMenu() {
    const toggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('translate-x-full');
        overlay.classList.toggle('hidden');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    });
}

// ---- Employees ----
let allEmployees = [];

async function loadEmployees() {
    try {
        const employees = await apiCall('/api/employees');
        allEmployees = employees;
        renderEmployees(allEmployees);
    } catch (err) {
        showToast('خطأ في تحميل الموظفين');
    }
}

function renderEmployees(list) {
    const deptFilter = document.getElementById('employeeDeptFilter').value;
    const searchQuery = document.getElementById('employeeSearchInput').value.toLowerCase();

    let filtered = list;
    if (deptFilter) filtered = filtered.filter(emp => emp.department === deptFilter);
    if (searchQuery) filtered = filtered.filter(emp => emp.name.toLowerCase().includes(searchQuery) || emp.username.toLowerCase().includes(searchQuery));

    const tbody = document.getElementById('employeesTable');
    const empty = document.getElementById('employeesEmpty');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (allEmployees.length === 0) {
            empty.textContent = 'لا يوجد موظفين بعد';
        } else {
            empty.textContent = 'لا يوجد نتائج للبحث';
        }
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    tbody.innerHTML = filtered.map((emp, i) => `
      <tr class="hover:bg-gray-50/50 transition">
        <td class="px-4 py-3 text-gray-500">${i + 1}</td>
        <td class="px-4 py-3 font-medium text-gray-800">${emp.name}</td>
        <td class="px-4 py-3 text-gray-600" dir="ltr">${emp.username}</td>
        <td class="px-4 py-3">${roleBadge(emp.role)}</td>
        <td class="px-4 py-3">${deptBadge(emp.department)}</td>
        <td class="px-4 py-3 text-gray-600">${shiftLabel(emp.shift)}</td>
        <td class="px-4 py-3 text-gray-600">${emp.join_date}</td>
        <td class="px-4 py-3">
          ${emp.role !== 'general_manager' ? `
            <div class="flex gap-1">
              <button onclick="viewEmployeeProfile(${emp.id})" class="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition" title="عرض الملف">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              <button onclick="editEmployee(${emp.id})" class="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition" title="تعديل">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              </button>
              <button onclick="deleteEmployee(${emp.id}, '${emp.name}')" class="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition" title="حذف">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          ` : '<span class="text-gray-300 text-xs">—</span>'}
        </td>
      </tr>
    `).join('');
}

// Filter listeners
document.getElementById('employeeSearchInput').addEventListener('input', () => renderEmployees(allEmployees));
document.getElementById('employeeDeptFilter').addEventListener('change', () => renderEmployees(allEmployees));

// Add Employee
document.getElementById('addEmployeeBtn').addEventListener('click', () => {
    document.getElementById('employeeModalTitle').textContent = 'إضافة موظف جديد';
    document.getElementById('employeeForm').reset();
    document.getElementById('employeeId').value = '';
    document.getElementById('empPassword').required = true;
    document.getElementById('empPasswordHint').classList.add('hidden');
    document.getElementById('employeeModal').classList.remove('hidden');
    updateShiftVisibility();
});

// Edit Employee
window.editEmployee = async function (id) {
    try {
        const employees = await apiCall('/api/employees');
        const emp = employees.find(e => e.id === id);
        if (!emp) return;

        document.getElementById('employeeModalTitle').textContent = 'تعديل بيانات الموظف';
        document.getElementById('employeeId').value = emp.id;
        document.getElementById('empName').value = emp.name;
        document.getElementById('empUsername').value = emp.username;
        document.getElementById('empPassword').value = '';
        document.getElementById('empPassword').required = false;
        document.getElementById('empPasswordHint').classList.remove('hidden');
        document.getElementById('empRole').value = emp.role;
        document.getElementById('empDepartment').value = emp.department || 'shifts';
        document.getElementById('empShift').value = emp.shift || '';
        document.getElementById('empJoinDate').value = emp.join_date;
        document.getElementById('employeeModal').classList.remove('hidden');
        updateShiftVisibility();
    } catch (err) {
        showToast('خطأ في تحميل بيانات الموظف');
    }
};

// Show/hide shift field based on department
function updateShiftVisibility() {
    const dept = document.getElementById('empDepartment').value;
    const shiftContainer = document.getElementById('shiftFieldContainer');
    if (dept === 'shifts') {
        shiftContainer.style.display = 'block';
    } else {
        shiftContainer.style.display = 'none';
        document.getElementById('empShift').value = '';
    }
}

document.getElementById('empDepartment').addEventListener('change', updateShiftVisibility);

// Delete Employee
window.deleteEmployee = async function (id, name) {
    if (!confirm(`هل أنت متأكد من حذف "${name}"؟`)) return;
    try {
        await apiCall(`/api/employees/${id}`, { method: 'DELETE' });
        showToast('تم حذف الموظف بنجاح');
        loadEmployees();
    } catch (err) {
        showToast(err.message);
    }
};

// Employee Form Submit
document.getElementById('employeeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('employeeId').value;
    const payload = {
        name: document.getElementById('empName').value,
        username: document.getElementById('empUsername').value,
        role: document.getElementById('empRole').value,
        department: document.getElementById('empDepartment').value,
        shift: document.getElementById('empShift').value || null,
        join_date: document.getElementById('empJoinDate').value,
    };

    const password = document.getElementById('empPassword').value;
    if (password) payload.password = password;

    try {
        if (id) {
            await apiCall(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            showToast('تم تعديل الموظف بنجاح');
        } else {
            payload.password = password;
            await apiCall('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
            showToast('تم إضافة الموظف بنجاح');
        }
        closeModal('employeeModal');
        loadEmployees();
    } catch (err) {
        showToast(err.message);
    }
});

// ---- Leaves ----
let allLeaves = [];

async function loadLeaves() {
    try {
        allLeaves = await apiCall('/api/leaves');
        renderLeaves();
    } catch (err) {
        showToast('خطأ في تحميل الإجازات');
    }
}

function renderLeaves() {
    const deptFilter = document.getElementById('leavesDeptFilter').value;
    const shiftFilter = document.getElementById('leavesShiftFilter').value;
    const statusFilter = document.getElementById('leavesStatusFilter').value;

    let filtered = allLeaves;
    if (deptFilter) filtered = filtered.filter(l => l.employee_department === deptFilter);
    if (shiftFilter) filtered = filtered.filter(l => l.employee_shift === shiftFilter);
    if (statusFilter) filtered = filtered.filter(l => l.status === statusFilter);

    const tbody = document.getElementById('leavesTable');
    const empty = document.getElementById('leavesEmpty');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    tbody.innerHTML = filtered.map(l => `
    <tr class="hover:bg-gray-50/50 transition">
      <td class="px-4 py-3 font-medium text-gray-800">${l.employee_name}</td>
      <td class="px-4 py-3">${roleBadge(l.employee_role)}</td>
      <td class="px-4 py-3">${deptBadge(l.employee_department)}</td>
      <td class="px-4 py-3 text-gray-600">${shiftLabel(l.employee_shift)}</td>
      <td class="px-4 py-3 text-gray-600">${l.start_date}</td>
      <td class="px-4 py-3 text-gray-600">${l.end_date}</td>
      <td class="px-4 py-3">${statusBadge(l.status)}</td>
      <td class="px-4 py-3">
        <div class="flex gap-1">
          ${l.status === 'pending' ? `
            <button onclick="approveLeave(${l.id})" class="p-1.5 hover:bg-green-50 rounded-lg text-green-600 transition" title="موافقة">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </button>
            <button onclick="rejectLeave(${l.id})" class="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition" title="رفض">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          ` : ''}
          <button onclick="deleteLeave(${l.id})" class="p-1.5 hover:bg-red-50 rounded-lg text-red-400 transition" title="حذف">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('leavesDeptFilter').addEventListener('change', renderLeaves);
document.getElementById('leavesShiftFilter').addEventListener('change', renderLeaves);
document.getElementById('leavesStatusFilter').addEventListener('change', renderLeaves);

window.approveLeave = async function (id) {
    try {
        await apiCall(`/api/leaves/${id}/approve`, { method: 'PUT' });
        showToast('تمت الموافقة على الإجازة');
        loadLeaves();
    } catch (err) { showToast(err.message); }
};

window.rejectLeave = async function (id) {
    try {
        await apiCall(`/api/leaves/${id}/reject`, { method: 'PUT' });
        showToast('تم رفض الإجازة');
        loadLeaves();
    } catch (err) { showToast(err.message); }
};

window.deleteLeave = async function (id) {
    if (!confirm('هل أنت متأكد من حذف هذه الإجازة؟')) return;
    try {
        await apiCall(`/api/leaves/${id}`, { method: 'DELETE' });
        showToast('تم حذف الإجازة');
        loadLeaves();
    } catch (err) { showToast(err.message); }
};

// ---- Courses ----
async function loadCourses() {
    try {
        const courses = await apiCall('/api/courses');
        const tbody = document.getElementById('coursesTable');
        const empty = document.getElementById('coursesEmpty');

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
        <td class="px-4 py-3">${c.employee_name} ${roleBadge(c.employee_role)}</td>
        <td class="px-4 py-3">
          <button onclick="deleteCourse(${c.id})" class="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition" title="حذف">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
    } catch (err) {
        showToast('خطأ في تحميل الدورات');
    }
}

// Course nomination
async function loadCourseNominations(role = '') {
    try {
        const url = role ? `/api/courses/nominations?role=${role}` : '/api/courses/nominations';
        const nominees = await apiCall(url);
        const list = document.getElementById('courseNominationList');

        list.innerHTML = nominees.map((n, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            const lastDate = n.last_course_date || 'لم يخرج أبداً';
            const isSelected = document.getElementById('courseEmployeeId').value == n.id;
            return `
        <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 cursor-pointer border-b border-gray-100 last:border-0 transition ${isSelected ? 'bg-emerald-50 ring-1 ring-emerald-300' : ''}"
             onclick="selectCourseNominee(${n.id}, this)">
          <span class="text-lg w-8 text-center">${medal}</span>
          <div class="flex-1">
            <p class="font-medium text-gray-800 text-sm">${n.name}</p>
            <p class="text-xs text-gray-500">${roleLabel(n.role)} — ${deptLabel(n.department)} ${n.shift ? '— ' + shiftLabel(n.shift) : ''} — تعيين: ${n.join_date}</p>
          </div>
          <span class="text-xs ${n.last_course_date ? 'text-gray-400' : 'text-amber-600 font-medium'}">${lastDate}</span>
        </div>
      `;
        }).join('');
    } catch (err) {
        showToast('خطأ في تحميل قائمة الترشيح');
    }
}

window.selectCourseNominee = function (id, el) {
    document.getElementById('courseEmployeeId').value = id;
    // Highlight selected
    el.parentElement.querySelectorAll('div').forEach(d => {
        d.classList.remove('bg-emerald-50', 'ring-1', 'ring-emerald-300');
    });
    el.classList.add('bg-emerald-50', 'ring-1', 'ring-emerald-300');
};

document.getElementById('addCourseBtn').addEventListener('click', () => {
    document.getElementById('courseForm').reset();
    document.getElementById('courseEmployeeId').value = '';
    document.getElementById('courseModal').classList.remove('hidden');
    loadCourseNominations();
});

document.getElementById('courseRoleFilter').addEventListener('change', (e) => {
    loadCourseNominations(e.target.value);
});

document.getElementById('courseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const employee_id = document.getElementById('courseEmployeeId').value;
    if (!employee_id) { showToast('يرجى اختيار موظف'); return; }

    try {
        await apiCall('/api/courses', {
            method: 'POST',
            body: JSON.stringify({
                title: document.getElementById('courseTitle').value,
                location: document.getElementById('courseLocation').value,
                date: document.getElementById('courseDate').value,
                employee_id,
            }),
        });
        showToast('تم إسناد الدورة بنجاح');
        closeModal('courseModal');
        loadCourses();
    } catch (err) { showToast(err.message); }
});

window.deleteCourse = async function (id) {
    if (!confirm('هل أنت متأكد من حذف هذه الدورة؟')) return;
    try {
        await apiCall(`/api/courses/${id}`, { method: 'DELETE' });
        showToast('تم حذف الدورة');
        loadCourses();
    } catch (err) { showToast(err.message); }
};

// ---- Mandates ----
async function loadMandates() {
    try {
        const mandates = await apiCall('/api/mandates');
        const tbody = document.getElementById('mandatesTable');
        const empty = document.getElementById('mandatesEmpty');

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
        <td class="px-4 py-3">${m.employee_name} ${roleBadge(m.employee_role)}</td>
        <td class="px-4 py-3">
          <button onclick="deleteMandate(${m.id})" class="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition" title="حذف">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
    } catch (err) {
        showToast('خطأ في تحميل الانتدابات');
    }
}

// Mandate nomination
async function loadMandateNominations(role = '') {
    try {
        const url = role ? `/api/mandates/nominations?role=${role}` : '/api/mandates/nominations';
        const nominees = await apiCall(url);
        const list = document.getElementById('mandateNominationList');

        list.innerHTML = nominees.map((n, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            const lastDate = n.last_mandate_date || 'لم يخرج أبداً';
            const isSelected = document.getElementById('mandateEmployeeId').value == n.id;
            return `
        <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 cursor-pointer border-b border-gray-100 last:border-0 transition ${isSelected ? 'bg-emerald-50 ring-1 ring-emerald-300' : ''}"
             onclick="selectMandateNominee(${n.id}, this)">
          <span class="text-lg w-8 text-center">${medal}</span>
          <div class="flex-1">
            <p class="font-medium text-gray-800 text-sm">${n.name}</p>
            <p class="text-xs text-gray-500">${roleLabel(n.role)} — ${deptLabel(n.department)} ${n.shift ? '— ' + shiftLabel(n.shift) : ''} — تعيين: ${n.join_date}</p>
          </div>
          <span class="text-xs ${n.last_mandate_date ? 'text-gray-400' : 'text-amber-600 font-medium'}">${lastDate}</span>
        </div>
      `;
        }).join('');
    } catch (err) {
        showToast('خطأ في تحميل قائمة الترشيح');
    }
}

window.selectMandateNominee = function (id, el) {
    document.getElementById('mandateEmployeeId').value = id;
    el.parentElement.querySelectorAll('div').forEach(d => {
        d.classList.remove('bg-emerald-50', 'ring-1', 'ring-emerald-300');
    });
    el.classList.add('bg-emerald-50', 'ring-1', 'ring-emerald-300');
};

document.getElementById('addMandateBtn').addEventListener('click', () => {
    document.getElementById('mandateForm').reset();
    document.getElementById('mandateEmployeeId').value = '';
    document.getElementById('mandateModal').classList.remove('hidden');
    loadMandateNominations();
});

document.getElementById('mandateRoleFilter').addEventListener('change', (e) => {
    loadMandateNominations(e.target.value);
});

document.getElementById('mandateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const employee_id = document.getElementById('mandateEmployeeId').value;
    if (!employee_id) { showToast('يرجى اختيار موظف'); return; }

    try {
        await apiCall('/api/mandates', {
            method: 'POST',
            body: JSON.stringify({
                title: document.getElementById('mandateTitle').value,
                location: document.getElementById('mandateLocation').value,
                date: document.getElementById('mandateDate').value,
                employee_id,
            }),
        });
        showToast('تم إسناد الانتداب بنجاح');
        closeModal('mandateModal');
        loadMandates();
    } catch (err) { showToast(err.message); }
});

window.deleteMandate = async function (id) {
    if (!confirm('هل أنت متأكد من حذف هذا الانتداب؟')) return;
    try {
        await apiCall(`/api/mandates/${id}`, { method: 'DELETE' });
        showToast('تم حذف الانتداب');
        loadMandates();
    } catch (err) { showToast(err.message); }
};

// ---- Logout ----
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await apiCall('/api/auth/logout', { method: 'POST' });
    } catch (e) { }
    window.location.href = '/';
});

// ---- Attendance Records (Dashboard) ----
async function loadApprovedAttendance() {
    const shift = document.getElementById('attendanceShiftFilter').value;
    const dateFrom = document.getElementById('attendanceDateFrom').value;
    const dateTo = document.getElementById('attendanceDateTo').value;

    let url = '/api/attendance/approved?';
    if (shift) url += `shift=${encodeURIComponent(shift)}&`;
    if (dateFrom) url += `date_from=${dateFrom}&`;
    if (dateTo) url += `date_to=${dateTo}&`;

    try {
        const sessions = await apiCall(url);
        const container = document.getElementById('attendanceSessionsList');
        const empty = document.getElementById('attendanceEmpty');

        if (sessions.length === 0) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        container.innerHTML = sessions.map(s => {
            const shiftColors = {
                'أ': 'from-blue-500 to-blue-600',
                'ب': 'from-emerald-500 to-emerald-600',
                'ج': 'from-amber-500 to-amber-600',
                'د': 'from-purple-500 to-purple-600',
                'مساندة_صباحية': 'from-teal-500 to-teal-600',
                'مساندة_مسائية': 'from-indigo-500 to-indigo-600',
            };
            const gradient = shiftColors[s.shift] || 'from-gray-500 to-gray-600';

            return `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
                <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center text-white font-bold text-lg">
                            ${s.shift}
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800">مناوبة ${s.shift} - ${s.date}</h3>
                            <p class="text-xs text-gray-500">المشرف: ${s.supervisor_name} · اعتمد في: ${s.approved_at ? new Date(s.approved_at).toLocaleString('ar-SA') : '-'}</p>
                            ${s.shift_start_time || s.shift_end_time ? `<p class="text-xs text-indigo-500 mt-0.5">وقت المناوبة: ${s.shift_start_time || '?'} - ${s.shift_end_time || '?'}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="flex gap-2 text-xs">
                            <span class="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold">حاضر ${s.present_count}</span>
                            <span class="px-2 py-1 rounded-lg bg-red-100 text-red-700 font-bold">غائب ${s.absent_count}</span>
                            <span class="px-2 py-1 rounded-lg bg-yellow-100 text-yellow-700 font-bold">متأخر ${s.late_count}</span>
                            <span class="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 font-bold">معذور ${s.excused_count}</span>
                        </div>
                        <button onclick="viewAttendanceDetail(${s.id})"
                            class="text-sm bg-gradient-to-l from-emerald-500 to-teal-600 text-white px-3 py-1.5 rounded-lg hover:from-emerald-600 hover:to-teal-700 transition font-medium">
                            عرض التفاصيل
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        showToast('خطأ في تحميل سجلات الحضور');
    }
}

window.viewAttendanceDetail = async function (sessionId) {
    try {
        const data = await apiCall(`/api/attendance/approved/${sessionId}`);
        const content = document.getElementById('attendanceDetailContent');

        const statusLabels = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'معذور' };
        const statusColors = {
            present: 'bg-emerald-100 text-emerald-700',
            absent: 'bg-red-100 text-red-700',
            late: 'bg-yellow-100 text-yellow-700',
            excused: 'bg-blue-100 text-blue-700',
        };

        const formatTime = (t) => t ? new Date(t + 'Z').toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '-';

        const s = data.session;
        content.innerHTML = `
            <!-- Session Header -->
            <div class="mb-4 p-4 bg-gradient-to-l from-indigo-50 to-purple-50 rounded-xl">
                <div class="flex items-center justify-between mb-2">
                    <div>
                        <span class="font-bold text-gray-800 text-lg">مناوبة ${s.shift}</span>
                        <span class="text-gray-500 text-sm mr-3">${s.date}</span>
                    </div>
                    <span class="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">معتمد</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                        <span class="text-gray-500">المشرف:</span>
                        <span class="font-medium text-gray-800">${s.supervisor_name}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">وقت الاستلام:</span>
                        <span class="font-medium text-gray-800">${s.shift_start_time || '-'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">وقت الانتهاء:</span>
                        <span class="font-medium text-gray-800">${s.shift_end_time || '-'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">تاريخ الاعتماد:</span>
                        <span class="font-medium text-gray-800">${s.approved_at ? new Date(s.approved_at).toLocaleString('ar-SA') : '-'}</span>
                    </div>
                </div>
            </div>
            ${s.notes ? `<div class="mb-4 p-3 bg-yellow-50 rounded-xl text-sm text-yellow-800">ملاحظات: ${s.notes}</div>` : ''}
            
            <!-- Employee Records Table -->
            <div class="overflow-x-auto mb-6">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">#</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">الموظف</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">الدور</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">الحالة</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">الحضور</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">الانصراف</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">توقيع الحضور</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">توقيع الانصراف</th>
                            <th class="px-3 py-2 text-right font-medium text-gray-500">ملاحظة</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-50">
                        ${data.records.map((r, i) => `
                            <tr class="hover:bg-gray-50/50 transition">
                                <td class="px-3 py-2 text-gray-400 text-xs">${i + 1}</td>
                                <td class="px-3 py-2 font-medium text-gray-800">${r.employee_name}</td>
                                <td class="px-3 py-2">${roleBadge(r.employee_role)}</td>
                                <td class="px-3 py-2">
                                    <span class="px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[r.status] || ''}">${statusLabels[r.status] || r.status}</span>
                                </td>
                                <td class="px-3 py-2 text-gray-600 text-xs">${formatTime(r.check_in_time)}</td>
                                <td class="px-3 py-2 text-gray-600 text-xs">${formatTime(r.check_out_time)}</td>
                                <td class="px-3 py-2">${r.check_in_signature ? `<img src="${r.check_in_signature}" class="h-8 rounded border border-gray-200">` : '<span class="text-gray-300 text-xs">-</span>'}</td>
                                <td class="px-3 py-2">${r.check_out_signature ? `<img src="${r.check_out_signature}" class="h-8 rounded border border-gray-200">` : '<span class="text-gray-300 text-xs">-</span>'}</td>
                                <td class="px-3 py-2 text-gray-500 text-xs">${r.note || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Supervisor Signature -->
            <div class="p-4 bg-indigo-50 rounded-xl">
                <h4 class="text-sm font-bold text-indigo-800 mb-2">توقيع المشرف: ${s.supervisor_name}</h4>
                ${s.supervisor_signature 
                    ? `<div class="bg-white rounded-lg p-2 border border-indigo-200 inline-block"><img src="${s.supervisor_signature}" class="h-16" alt="توقيع المشرف"></div>` 
                    : '<span class="text-indigo-400 text-sm">لا يوجد توقيع</span>'}
            </div>`;

        document.getElementById('attendanceDetailModal').classList.remove('hidden');
    } catch (err) {
        showToast('خطأ في تحميل تفاصيل الجلسة');
    }
};

// Attendance filter button
document.getElementById('attendanceFilterBtn').addEventListener('click', loadApprovedAttendance);

// ============================================================
// EMPLOYEE PROFILE VIEWER
// ============================================================

window.viewEmployeeProfile = async function (id) {
    try {
        const data = await apiCall(`/api/employees/${id}`);
        const emp = data.employee;

        // Update breadcrumb and nav
        document.getElementById('empProfileBreadcrumb').textContent = emp.name;
        document.getElementById('empProfileNavLabel').textContent = emp.name;
        document.getElementById('empProfileNavLink').classList.remove('hidden');

        // Update info card
        document.getElementById('empProfileName').textContent = emp.name;
        document.getElementById('empProfileLeaveBalance').textContent = `${emp.annual_leave_balance ?? '-'} يوم`;
        document.getElementById('empProfileJoinDate').textContent = emp.join_date;
        document.getElementById('empProfileBadges').innerHTML = `
            ${roleBadge(emp.role)}
            ${deptBadge(emp.department)}
            ${emp.shift ? `<span class="px-2 py-0.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-700">مناوبة ${shiftLabel(emp.shift)}</span>` : ''}
        `;

        // Populate leaves
        const leavesTable = document.getElementById('empProfileLeavesTable');
        const leavesEmpty = document.getElementById('empProfileLeavesEmpty');
        if (data.leaves.length === 0) {
            leavesTable.innerHTML = '';
            leavesEmpty.classList.remove('hidden');
        } else {
            leavesEmpty.classList.add('hidden');
            leavesTable.innerHTML = data.leaves.map(l => `
                <tr class="hover:bg-gray-50/50 transition">
                    <td class="px-4 py-3 text-gray-600">${l.start_date}</td>
                    <td class="px-4 py-3 text-gray-600">${l.end_date}</td>
                    <td class="px-4 py-3">${statusBadge(l.status)}</td>
                </tr>
            `).join('');
        }

        // Populate mandates
        const mandatesTable = document.getElementById('empProfileMandatesTable');
        const mandatesEmpty = document.getElementById('empProfileMandatesEmpty');
        if (data.mandates.length === 0) {
            mandatesTable.innerHTML = '';
            mandatesEmpty.classList.remove('hidden');
        } else {
            mandatesEmpty.classList.add('hidden');
            mandatesTable.innerHTML = data.mandates.map(m => `
                <tr class="hover:bg-gray-50/50 transition">
                    <td class="px-4 py-3 font-medium text-gray-800">${m.title}</td>
                    <td class="px-4 py-3 text-gray-600">${m.location}</td>
                    <td class="px-4 py-3 text-gray-600">${m.date}</td>
                </tr>
            `).join('');
        }

        // Populate courses
        const coursesTable = document.getElementById('empProfileCoursesTable');
        const coursesEmpty = document.getElementById('empProfileCoursesEmpty');
        if (data.courses.length === 0) {
            coursesTable.innerHTML = '';
            coursesEmpty.classList.remove('hidden');
        } else {
            coursesEmpty.classList.add('hidden');
            coursesTable.innerHTML = data.courses.map(c => `
                <tr class="hover:bg-gray-50/50 transition">
                    <td class="px-4 py-3 font-medium text-gray-800">${c.title}</td>
                    <td class="px-4 py-3 text-gray-600">${c.location}</td>
                    <td class="px-4 py-3 text-gray-600">${c.date}</td>
                </tr>
            `).join('');
        }

        // Reset tabs to leaves
        switchEmpProfileTab('leaves');

        // Navigate to profile section
        const links = document.querySelectorAll('.nav-link');
        const sections = document.querySelectorAll('.content-section');
        links.forEach(l => l.classList.remove('bg-emerald-50', 'text-emerald-700'));
        document.getElementById('empProfileNavLink').classList.add('bg-emerald-50', 'text-emerald-700');
        sections.forEach(s => s.classList.add('hidden'));
        document.getElementById('section-employee-profile').classList.remove('hidden');

        // Close mobile sidebar
        document.getElementById('sidebar').classList.add('translate-x-full');
        document.getElementById('sidebarOverlay').classList.add('hidden');

    } catch (err) {
        showToast('خطأ في تحميل ملف الموظف: ' + err.message);
    }
};

window.backToEmployees = function () {
    document.getElementById('empProfileNavLink').classList.add('hidden');
    // Navigate back to employees section
    const empLink = document.querySelector('.nav-link[data-section="employees"]');
    if (empLink) empLink.click();
};

function setupEmpProfileTabs() {
    const tabs = document.querySelectorAll('.emp-profile-tab');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabKey = tab.dataset.empTab;
            switchEmpProfileTab(tabKey);
        });
    });

    // Apply initial styles
    const activeTab = document.querySelector('.emp-profile-tab[data-emp-tab="leaves"]');
    if (activeTab) {
        activeTab.classList.add('bg-emerald-600', 'text-white', 'shadow-md');
        activeTab.classList.remove('text-gray-500', 'hover:bg-gray-100');
    }
    tabs.forEach(t => {
        if (t.dataset.empTab !== 'leaves') {
            t.classList.add('text-gray-500', 'hover:bg-gray-100');
        }
    });
}

function switchEmpProfileTab(tabKey) {
    const tabs = document.querySelectorAll('.emp-profile-tab');
    const contents = document.querySelectorAll('.emp-profile-tab-content');

    tabs.forEach(t => {
        t.classList.remove('active-emp-tab', 'bg-emerald-600', 'text-white', 'shadow-md');
        t.classList.add('text-gray-500', 'hover:bg-gray-100');
    });
    const activeTab = document.querySelector(`.emp-profile-tab[data-emp-tab="${tabKey}"]`);
    if (activeTab) {
        activeTab.classList.add('active-emp-tab', 'bg-emerald-600', 'text-white', 'shadow-md');
        activeTab.classList.remove('text-gray-500', 'hover:bg-gray-100');
    }

    contents.forEach(c => c.classList.add('hidden'));
    const content = document.getElementById(`empProfileTab-${tabKey}`);
    if (content) content.classList.remove('hidden');
}

// ============================================================
// SUPPORT ATTENDANCE (DASHBOARD)
// ============================================================

async function loadSupportReports() {
    const dateFrom = document.getElementById('supportDateFrom').value;
    const dateTo = document.getElementById('supportDateTo').value;

    let url = '/api/support-attendance/reports/approved?';
    if (dateFrom) url += `date_from=${dateFrom}&`;
    if (dateTo) url += `date_to=${dateTo}&`;

    try {
        const reports = await apiCall(url);
        const container = document.getElementById('supportReportsList');
        const empty = document.getElementById('supportReportsEmpty');

        if (reports.length === 0) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        container.innerHTML = reports.map(r => {
            const statusMap = {
                completed: { label: 'مرفوع', color: 'bg-blue-100 text-blue-700' },
                approved: { label: 'معتمد', color: 'bg-purple-100 text-purple-700' },
            };
            const st = statusMap[r.status] || { label: r.status, color: 'bg-gray-100' };

            return `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition">
                <div class="flex items-center justify-between p-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                            📋
                        </div>
                        <div>
                            <h3 class="font-bold text-gray-800">كشف المساندة - ${r.date}</h3>
                            <p class="text-xs text-gray-500">المرسل: ${r.submitted_by_name || '-'} · رُفع في: ${r.submitted_at ? new Date(r.submitted_at).toLocaleString('ar-SA') : '-'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="flex gap-2 text-xs">
                            <span class="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 font-bold">حاضر ${r.total_present || 0}</span>
                            <span class="px-2 py-1 rounded-lg bg-red-100 text-red-700 font-bold">غائب ${r.total_absent || 0}</span>
                            <span class="px-2 py-1 rounded-lg ${st.color} font-bold">${st.label}</span>
                        </div>
                        <button onclick="viewSupportReportDetail(${r.id})"
                            class="text-sm bg-gradient-to-l from-amber-500 to-orange-600 text-white px-3 py-1.5 rounded-lg hover:from-amber-600 hover:to-orange-700 transition font-medium">
                            عرض التفاصيل
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        showToast('خطأ في تحميل كشوفات المساندة');
    }
}

window.viewSupportReportDetail = async function(reportId) {
    try {
        const data = await apiCall(`/api/support-attendance/reports/${reportId}/full`);
        const content = document.getElementById('supportDetailContent');

        const groupLabels = { morning: 'الصباح 🌅', afternoon: 'العصر 🌇', night: 'الليل 🌙' };
        const statusLabels = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'معذور' };
        const statusColors = { present: 'bg-emerald-100 text-emerald-700', absent: 'bg-red-100 text-red-700', late: 'bg-yellow-100 text-yellow-700', excused: 'bg-blue-100 text-blue-700' };
        const formatTime = (t) => t ? new Date(t + 'Z').toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '-';

        const report = data.report;

        let html = `
            <div class="mb-4 p-4 bg-gradient-to-l from-amber-50 to-orange-50 rounded-xl">
                <div class="flex items-center justify-between mb-2">
                    <span class="font-bold text-gray-800 text-lg">كشف المساندة - ${report.date}</span>
                    <span class="px-3 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-700">${report.status === 'approved' ? 'معتمد' : 'مرفوع'}</span>
                </div>
                <p class="text-sm text-gray-500">المرسل: ${report.submitted_by_name || '-'}</p>
            </div>
        `;

        for (const session of data.sessions) {
            const records = session.records || [];
            html += `
                <div class="mb-6 bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div class="p-3 bg-gradient-to-l from-gray-50 to-gray-100 border-b border-gray-100 flex items-center justify-between">
                        <h4 class="font-bold text-gray-800">مجموعة ${groupLabels[session.group_type] || session.group_type}</h4>
                        <div class="flex gap-2 text-xs">
                            <span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700">حضور: ${session.checkin_supervisor_name || '-'}</span>
                            <span class="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">انصراف: ${session.checkout_supervisor_name || '-'}</span>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">#</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">الموظف</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">الحالة</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">الحضور</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">الانصراف</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">التوقيع</th>
                                    <th class="px-3 py-2 text-right font-medium text-gray-500">ملاحظة</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50">
                                ${records.map((r, i) => `
                                    <tr class="hover:bg-gray-50/50 transition">
                                        <td class="px-3 py-2 text-gray-400 text-xs">${i + 1}</td>
                                        <td class="px-3 py-2 font-medium text-gray-800">${r.employee_name}</td>
                                        <td class="px-3 py-2">
                                            <span class="px-2 py-0.5 rounded-lg text-xs font-bold ${statusColors[r.status] || ''}">${statusLabels[r.status] || r.status}</span>
                                        </td>
                                        <td class="px-3 py-2 text-gray-600 text-xs">${formatTime(r.check_in_time)}</td>
                                        <td class="px-3 py-2 text-gray-600 text-xs">${formatTime(r.check_out_time)}</td>
                                        <td class="px-3 py-2">${r.check_in_signature ? `<img src="${r.check_in_signature}" class="h-8 rounded border border-gray-200">` : '<span class="text-gray-300 text-xs">-</span>'}</td>
                                        <td class="px-3 py-2 text-gray-500 text-xs">${r.note || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        content.innerHTML = html;
        document.getElementById('supportDetailModal').classList.remove('hidden');
    } catch (err) {
        showToast('خطأ في تحميل تفاصيل كشف المساندة');
    }
};

document.getElementById('supportFilterBtn').addEventListener('click', loadSupportReports);

// ---- Initialize ----
(async () => {
    await checkAuth();
    setupNavigation();
    setupMobileMenu();
    setupDeptTabs();
    setupEmpProfileTabs();
    loadSupportReports();
})();

