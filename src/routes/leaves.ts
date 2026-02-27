import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth, requireManager, isGeneralManager } from '../middleware/auth';

const router = Router();

// Helper: calculate number of days between two dates
function calcDays(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    const diff = e.getTime() - s.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
}

// GET /api/leaves - Get leaves based on role
router.get('/', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role === 'general_manager') {
        // General manager sees all leaves
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            ORDER BY l.created_at DESC
        `).all();
        res.json(leaves);
    } else if (user.role === 'dept_manager') {
        // Department manager sees leaves from their department
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE e.department = ? OR l.employee_id = ?
            ORDER BY l.created_at DESC
        `).all(user.department, user.id);
        res.json(leaves);
    } else if (user.role === 'supervisor') {
        // Supervisor sees their shift operators' leaves + own
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE (e.shift = ? AND e.role = 'operator' AND e.department = ?) OR l.employee_id = ?
            ORDER BY l.created_at DESC
        `).all(user.shift, user.department, user.id);
        res.json(leaves);
    } else {
        // Operator sees only their own leaves
        const leaves = db.prepare(`
            SELECT l.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM leaves l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.employee_id = ?
            ORDER BY l.created_at DESC
        `).all(user.id);
        res.json(leaves);
    }
});

// POST /api/leaves - Submit leave request
router.post('/', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role === 'general_manager') {
        res.status(403).json({ error: 'المدير العام لا يقدم طلبات إجازة' });
        return;
    }

    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
        res.status(400).json({ error: 'تاريخ البداية والنهاية مطلوبان' });
        return;
    }

    if (new Date(end_date) < new Date(start_date)) {
        res.status(400).json({ error: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية' });
        return;
    }

    const days = calcDays(start_date, end_date);

    // Check remaining balance
    const emp = db.prepare('SELECT annual_leave_balance FROM employees WHERE id = ?').get(user.id) as any;
    if (emp && emp.annual_leave_balance < days) {
        res.status(400).json({ error: `رصيد الإجازات غير كافي. الرصيد المتبقي: ${emp.annual_leave_balance} يوم، المطلوب: ${days} يوم` });
        return;
    }

    try {
        const result = db.prepare(`
            INSERT INTO leaves (employee_id, start_date, end_date)
            VALUES (?, ?, ?)
        `).run(user.id, start_date, end_date);

        logActivity(user.id, user.name, 'طلب إجازة', 'إجازة', undefined, `من ${start_date} إلى ${end_date} (${days} يوم)`);

        res.status(201).json({
            message: 'تم تقديم طلب الإجازة بنجاح',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء تقديم الطلب' });
    }
});

// PUT /api/leaves/:id/approve - Approve leave (manager only)
router.put('/:id/approve', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const manager = req.session.user!;
    const leave = db.prepare(`
        SELECT l.*, e.name as employee_name, e.department as employee_department 
        FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(Number(id)) as any;

    if (!leave) {
        res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        return;
    }

    // Dept manager can only approve leaves from their department
    if (!isGeneralManager(req) && leave.employee_department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك الموافقة على إجازة موظف من إدارة أخرى' });
        return;
    }

    if (leave.status !== 'pending') {
        res.status(400).json({ error: 'لا يمكن تعديل حالة هذا الطلب' });
        return;
    }

    const days = calcDays(leave.start_date, leave.end_date);

    // Deduct from balance
    db.prepare('UPDATE employees SET annual_leave_balance = annual_leave_balance - ? WHERE id = ?').run(days, leave.employee_id);
    db.prepare("UPDATE leaves SET status = 'approved' WHERE id = ?").run(Number(id));

    logActivity(manager.id, manager.name, 'موافقة على إجازة', 'إجازة', leave.employee_name, `${days} يوم`);

    res.json({ message: 'تمت الموافقة على الإجازة' });
});

// PUT /api/leaves/:id/reject - Reject leave (manager only)
router.put('/:id/reject', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const manager = req.session.user!;
    const leave = db.prepare(`
        SELECT l.*, e.name as employee_name, e.department as employee_department 
        FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(Number(id)) as any;

    if (!leave) {
        res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        return;
    }

    // Dept manager can only reject leaves from their department
    if (!isGeneralManager(req) && leave.employee_department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك رفض إجازة موظف من إدارة أخرى' });
        return;
    }

    // If was approved, refund balance
    if (leave.status === 'approved') {
        const days = calcDays(leave.start_date, leave.end_date);
        db.prepare('UPDATE employees SET annual_leave_balance = annual_leave_balance + ? WHERE id = ?').run(days, leave.employee_id);
    }

    db.prepare("UPDATE leaves SET status = 'rejected' WHERE id = ?").run(Number(id));

    logActivity(manager.id, manager.name, 'رفض إجازة', 'إجازة', leave.employee_name);

    res.json({ message: 'تم رفض الإجازة' });
});

// DELETE /api/leaves/:id - Delete leave (manager only)
router.delete('/:id', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const manager = req.session.user!;
    const leave = db.prepare(`
        SELECT l.*, e.name as employee_name, e.department as employee_department 
        FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.id = ?
    `).get(Number(id)) as any;

    if (!leave) {
        res.status(404).json({ error: 'طلب الإجازة غير موجود' });
        return;
    }

    // Dept manager can only delete leaves from their department
    if (!isGeneralManager(req) && leave.employee_department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك حذف إجازة موظف من إدارة أخرى' });
        return;
    }

    // If was approved, refund balance
    if (leave.status === 'approved') {
        const days = calcDays(leave.start_date, leave.end_date);
        db.prepare('UPDATE employees SET annual_leave_balance = annual_leave_balance + ? WHERE id = ?').run(days, leave.employee_id);
    }

    db.prepare('DELETE FROM leaves WHERE id = ?').run(Number(id));

    logActivity(manager.id, manager.name, 'حذف إجازة', 'إجازة', leave.employee_name);

    res.json({ message: 'تم حذف الإجازة' });
});

export default router;
