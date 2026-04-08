import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db, { logActivity } from '../database';
import { requireManager, isGeneralManager } from '../middleware/auth';

const router = Router();

// Helper: department label
function deptLabel(dept: string | null): string {
    const labels: Record<string, string> = {
        shifts: 'إدارة المناوبات',
        hr: 'إدارة الموارد البشرية',
        operations: 'إدارة العمليات',
        workforce: 'إدارة القوى العاملة',
    };
    return dept ? labels[dept] || dept : 'الإدارة العامة';
}

// GET /api/employees - List employees based on role
router.get('/', requireManager, (req: Request, res: Response) => {
    const user = req.session.user!;

    let employees;
    if (isGeneralManager(req)) {
        // General manager sees all employees
        employees = db.prepare(`
            SELECT id, name, username, role, department, shift, join_date, annual_leave_balance, created_at 
            FROM employees 
            ORDER BY 
                CASE role WHEN 'general_manager' THEN 0 WHEN 'dept_manager' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END,
                department, shift, name
        `).all();
    } else {
        // Department manager sees only their department employees
        employees = db.prepare(`
            SELECT id, name, username, role, department, shift, join_date, annual_leave_balance, created_at 
            FROM employees 
            WHERE department = ?
            ORDER BY 
                CASE role WHEN 'dept_manager' THEN 0 WHEN 'supervisor' THEN 1 ELSE 2 END,
                shift, name
        `).all(user.department);
    }
    res.json(employees);
});

// GET /api/employees/:id - Get employee profile with leaves, courses, mandates (manager only)
router.get('/:id', requireManager, (req: Request, res: Response) => {
    const user = req.session.user!;
    const { id } = req.params;

    const employee = db.prepare(`
        SELECT id, name, username, role, department, shift, join_date, annual_leave_balance, created_at 
        FROM employees WHERE id = ?
    `).get(Number(id)) as any;

    if (!employee) {
        res.status(404).json({ error: 'الموظف غير موجود' });
        return;
    }

    // Dept manager can only view employees in their department
    if (!isGeneralManager(req) && employee.department !== user.department) {
        res.status(403).json({ error: 'لا يمكنك عرض بيانات موظف من إدارة أخرى' });
        return;
    }

    // Get employee's leaves
    const leaves = db.prepare(`
        SELECT l.*, e.name as employee_name, e.role as employee_role
        FROM leaves l JOIN employees e ON l.employee_id = e.id
        WHERE l.employee_id = ?
        ORDER BY l.created_at DESC
    `).all(Number(id));

    // Get employee's courses
    const courses = db.prepare(`
        SELECT c.*, e.name as employee_name, e.role as employee_role
        FROM courses c JOIN employees e ON c.employee_id = e.id
        WHERE c.employee_id = ?
        ORDER BY c.date DESC
    `).all(Number(id));

    // Get employee's mandates
    const mandates = db.prepare(`
        SELECT m.*, e.name as employee_name, e.role as employee_role
        FROM mandates m JOIN employees e ON m.employee_id = e.id
        WHERE m.employee_id = ?
        ORDER BY m.date DESC
    `).all(Number(id));

    res.json({
        employee,
        leaves,
        courses,
        mandates,
    });
});

// POST /api/employees - Add new employee (manager only)
router.post('/', requireManager, (req: Request, res: Response) => {
    const manager = req.session.user!;
    const { name, username, password, role, department, shift, join_date } = req.body;

    if (!name || !username || !password || !role || !join_date) {
        res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        return;
    }

    // Only general_manager can create dept_manager or general_manager
    if ((role === 'general_manager' || role === 'dept_manager') && !isGeneralManager(req)) {
        res.status(403).json({ error: 'لا يمكنك إضافة مدير - صلاحية المدير العام فقط' });
        return;
    }

    // Department is required for non-general_manager roles
    if (role !== 'general_manager' && !department) {
        res.status(400).json({ error: 'الإدارة مطلوبة' });
        return;
    }

    // Dept manager can only add to their own department
    if (!isGeneralManager(req) && department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك إضافة موظف لإدارة أخرى' });
        return;
    }

    // Shift is required for shifts department employees (supervisor/operator)
    if (department === 'shifts' && role !== 'dept_manager' && !shift) {
        res.status(400).json({ error: 'المناوبة مطلوبة لموظفي إدارة المناوبات' });
        return;
    }

    const existing = db.prepare('SELECT id FROM employees WHERE username = ?').get(username);
    if (existing) {
        res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
        return;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    try {
        const result = db.prepare(`
            INSERT INTO employees (name, username, password, role, department, shift, join_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(name, username, hashedPassword, role, role === 'general_manager' ? null : department, shift || null, join_date);

        const roleLabels: Record<string, string> = { dept_manager: 'مدير إدارة', supervisor: 'ضابط', operator: 'منفذ' };
        logActivity(manager.id, manager.name, 'إضافة موظف', 'موظف', name,
            `${roleLabels[role] || role} - ${deptLabel(department)} ${shift ? '- مناوبة ' + shift : ''}`);

        res.status(201).json({
            message: 'تم إضافة الموظف بنجاح',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء إضافة الموظف' });
    }
});

// PUT /api/employees/:id - Update employee (manager only)
router.put('/:id', requireManager, (req: Request, res: Response) => {
    const manager = req.session.user!;
    const { id } = req.params;
    const { name, username, role, department, shift, join_date, password } = req.body;

    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
    if (!employee) {
        res.status(404).json({ error: 'الموظف غير موجود' });
        return;
    }

    // Dept manager can only edit employees in their department
    if (!isGeneralManager(req) && employee.department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك تعديل موظف من إدارة أخرى' });
        return;
    }

    // Only general_manager can edit general_manager or dept_manager roles
    if ((employee.role === 'general_manager' || role === 'general_manager' || role === 'dept_manager') && !isGeneralManager(req)) {
        res.status(403).json({ error: 'صلاحية المدير العام فقط' });
        return;
    }

    if (username !== employee.username) {
        const existing = db.prepare('SELECT id FROM employees WHERE username = ? AND id != ?').get(username, Number(id));
        if (existing) {
            res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
            return;
        }
    }

    if (password) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.prepare(`
            UPDATE employees SET name = ?, username = ?, password = ?, role = ?, department = ?, shift = ?, join_date = ?
            WHERE id = ?
        `).run(name, username, hashedPassword, role, role === 'general_manager' ? null : (department || null), shift || null, join_date, Number(id));
    } else {
        db.prepare(`
            UPDATE employees SET name = ?, username = ?, role = ?, department = ?, shift = ?, join_date = ?
            WHERE id = ?
        `).run(name, username, role, role === 'general_manager' ? null : (department || null), shift || null, join_date, Number(id));
    }

    logActivity(manager.id, manager.name, 'تعديل بيانات موظف', 'موظف', employee.name);

    res.json({ message: 'تم تعديل بيانات الموظف بنجاح' });
});

// DELETE /api/employees/:id - Delete employee (manager only)
router.delete('/:id', requireManager, (req: Request, res: Response) => {
    const manager = req.session.user!;
    const { id } = req.params;

    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(Number(id)) as any;
    if (!employee) {
        res.status(404).json({ error: 'الموظف غير موجود' });
        return;
    }

    if (employee.role === 'general_manager') {
        res.status(400).json({ error: 'لا يمكن حذف حساب المدير العام' });
        return;
    }

    // Dept manager can only delete employees in their department
    if (!isGeneralManager(req) && employee.department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك حذف موظف من إدارة أخرى' });
        return;
    }

    // Dept manager cannot delete another dept_manager
    if (employee.role === 'dept_manager' && !isGeneralManager(req)) {
        res.status(403).json({ error: 'لا يمكن حذف مدير إدارة - صلاحية المدير العام فقط' });
        return;
    }

    db.prepare('DELETE FROM employees WHERE id = ?').run(Number(id));

    logActivity(manager.id, manager.name, 'حذف موظف', 'موظف', employee.name);

    res.json({ message: 'تم حذف الموظف بنجاح' });
});

export default router;
