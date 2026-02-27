import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth, requireManager, isGeneralManager } from '../middleware/auth';

const router = Router();

// GET /api/mandates - Get mandates based on role
router.get('/', requireAuth, (req: Request, res: Response) => {
    const user = req.session.user!;

    if (user.role === 'general_manager') {
        const mandates = db.prepare(`
            SELECT m.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM mandates m
            JOIN employees e ON m.employee_id = e.id
            ORDER BY m.date DESC
        `).all();
        res.json(mandates);
    } else if (user.role === 'dept_manager') {
        const mandates = db.prepare(`
            SELECT m.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM mandates m
            JOIN employees e ON m.employee_id = e.id
            WHERE e.department = ?
            ORDER BY m.date DESC
        `).all(user.department);
        res.json(mandates);
    } else {
        const mandates = db.prepare(`
            SELECT m.*, e.name as employee_name, e.role as employee_role, e.shift as employee_shift, e.department as employee_department
            FROM mandates m
            JOIN employees e ON m.employee_id = e.id
            WHERE m.employee_id = ?
            ORDER BY m.date DESC
        `).all(user.id);
        res.json(mandates);
    }
});

// GET /api/mandates/nominations - Get employees ranked for nomination (manager only)
router.get('/nominations', requireManager, (req: Request, res: Response) => {
    const user = req.session.user!;
    const roleFilter = req.query.role as string;

    let query = `
        SELECT 
            e.id, e.name, e.role, e.shift, e.department, e.join_date,
            (SELECT MAX(m2.date) FROM mandates m2 WHERE m2.employee_id = e.id) as last_mandate_date
        FROM employees e
        WHERE e.role NOT IN ('general_manager')
    `;

    const params: any[] = [];

    if (!isGeneralManager(req)) {
        query += ` AND e.department = ?`;
        params.push(user.department);
    }

    if (roleFilter && ['dept_manager', 'supervisor', 'operator'].includes(roleFilter)) {
        query += ` AND e.role = ?`;
        params.push(roleFilter);
    }

    query += `
        ORDER BY
            CASE WHEN (SELECT MAX(m2.date) FROM mandates m2 WHERE m2.employee_id = e.id) IS NULL THEN 0 ELSE 1 END,
            (SELECT MAX(m2.date) FROM mandates m2 WHERE m2.employee_id = e.id) ASC,
            e.join_date ASC
    `;

    const employees = db.prepare(query).all(...params);
    res.json(employees);
});

// POST /api/mandates - Assign mandate to employee (manager only)
router.post('/', requireManager, (req: Request, res: Response) => {
    const { title, location, date, employee_id } = req.body;

    if (!title || !location || !date || !employee_id) {
        res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        return;
    }

    const employee = db.prepare('SELECT id, name, department FROM employees WHERE id = ?').get(Number(employee_id)) as any;
    if (!employee) {
        res.status(404).json({ error: 'الموظف غير موجود' });
        return;
    }

    // Dept manager can only assign mandates to their department
    const manager = req.session.user!;
    if (!isGeneralManager(req) && employee.department !== manager.department) {
        res.status(403).json({ error: 'لا يمكنك إسناد انتداب لموظف من إدارة أخرى' });
        return;
    }

    try {
        const result = db.prepare(`
            INSERT INTO mandates (title, location, date, employee_id)
            VALUES (?, ?, ?, ?)
        `).run(title, location, date, Number(employee_id));

        logActivity(manager.id, manager.name, 'إسناد انتداب', 'انتداب', employee.name, title);

        res.status(201).json({
            message: 'تم إسناد الانتداب بنجاح',
            id: result.lastInsertRowid,
        });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء إسناد الانتداب' });
    }
});

// PUT /api/mandates/:id - Update mandate (manager only)
router.put('/:id', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const { title, location, date, employee_id } = req.body;

    const mandate = db.prepare('SELECT * FROM mandates WHERE id = ?').get(Number(id)) as any;
    if (!mandate) {
        res.status(404).json({ error: 'الانتداب غير موجود' });
        return;
    }

    db.prepare(`
        UPDATE mandates SET title = ?, location = ?, date = ?, employee_id = ?
        WHERE id = ?
    `).run(title, location, date, Number(employee_id), Number(id));

    res.json({ message: 'تم تعديل الانتداب بنجاح' });
});

// DELETE /api/mandates/:id - Delete mandate (manager only)
router.delete('/:id', requireManager, (req: Request, res: Response) => {
    const { id } = req.params;
    const mandate = db.prepare('SELECT * FROM mandates WHERE id = ?').get(Number(id)) as any;

    if (!mandate) {
        res.status(404).json({ error: 'الانتداب غير موجود' });
        return;
    }

    db.prepare('DELETE FROM mandates WHERE id = ?').run(Number(id));

    const manager = req.session.user!;
    const emp = db.prepare('SELECT name FROM employees WHERE id = ?').get(mandate.employee_id) as any;
    logActivity(manager.id, manager.name, 'حذف انتداب', 'انتداب', emp?.name, mandate.title);

    res.json({ message: 'تم حذف الانتداب بنجاح' });
});

export default router;
