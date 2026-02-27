import { Router, Request, Response } from 'express';
import db, { logActivity } from '../database';
import { requireAuth, requireManager, isGeneralManager } from '../middleware/auth';

const router = Router();

// GET /api/stats - Dashboard statistics
router.get('/', requireManager, (req: Request, res: Response) => {
    try {
        const user = req.session.user!;
        const isGM = isGeneralManager(req);

        let totalEmployees, supervisors, operators, deptManagers;

        if (isGM) {
            totalEmployees = (db.prepare('SELECT COUNT(*) as count FROM employees').get() as any).count;
            deptManagers = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE role = 'dept_manager'").get() as any).count;
            supervisors = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE role = 'supervisor'").get() as any).count;
            operators = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE role = 'operator'").get() as any).count;
        } else {
            totalEmployees = (db.prepare('SELECT COUNT(*) as count FROM employees WHERE department = ?').get(user.department) as any).count;
            deptManagers = 0;
            supervisors = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE role = 'supervisor' AND department = ?").get(user.department) as any).count;
            operators = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE role = 'operator' AND department = ?").get(user.department) as any).count;
        }

        const pendingLeavesQuery = isGM
            ? "SELECT COUNT(*) as count FROM leaves WHERE status = 'pending'"
            : "SELECT COUNT(*) as count FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'pending' AND e.department = ?";
        const pendingLeaves = isGM
            ? (db.prepare(pendingLeavesQuery).get() as any).count
            : (db.prepare(pendingLeavesQuery).get(user.department) as any).count;

        const approvedLeavesQuery = isGM
            ? "SELECT COUNT(*) as count FROM leaves WHERE status = 'approved'"
            : "SELECT COUNT(*) as count FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'approved' AND e.department = ?";
        const approvedLeaves = isGM
            ? (db.prepare(approvedLeavesQuery).get() as any).count
            : (db.prepare(approvedLeavesQuery).get(user.department) as any).count;

        const totalCoursesQuery = isGM
            ? 'SELECT COUNT(*) as count FROM courses'
            : 'SELECT COUNT(*) as count FROM courses c JOIN employees e ON c.employee_id = e.id WHERE e.department = ?';
        const totalCourses = isGM
            ? (db.prepare(totalCoursesQuery).get() as any).count
            : (db.prepare(totalCoursesQuery).get(user.department) as any).count;

        const totalMandatesQuery = isGM
            ? 'SELECT COUNT(*) as count FROM mandates'
            : 'SELECT COUNT(*) as count FROM mandates m JOIN employees e ON m.employee_id = e.id WHERE e.department = ?';
        const totalMandates = isGM
            ? (db.prepare(totalMandatesQuery).get() as any).count
            : (db.prepare(totalMandatesQuery).get(user.department) as any).count;

        // Employees by shift
        const byShiftQuery = isGM
            ? `SELECT shift, COUNT(*) as count FROM employees 
               WHERE role NOT IN ('general_manager') AND shift IS NOT NULL 
               GROUP BY shift ORDER BY shift`
            : `SELECT shift, COUNT(*) as count FROM employees 
               WHERE role NOT IN ('general_manager', 'dept_manager') AND shift IS NOT NULL AND department = ?
               GROUP BY shift ORDER BY shift`;
        const byShift = isGM
            ? db.prepare(byShiftQuery).all()
            : db.prepare(byShiftQuery).all(user.department);

        // Recent leaves
        const recentLeavesQuery = isGM
            ? `SELECT l.*, e.name as employee_name, e.shift as employee_shift, e.department as employee_department
               FROM leaves l JOIN employees e ON l.employee_id = e.id
               ORDER BY l.created_at DESC LIMIT 5`
            : `SELECT l.*, e.name as employee_name, e.shift as employee_shift, e.department as employee_department
               FROM leaves l JOIN employees e ON l.employee_id = e.id
               WHERE e.department = ?
               ORDER BY l.created_at DESC LIMIT 5`;
        const recentLeaves = isGM
            ? db.prepare(recentLeavesQuery).all()
            : db.prepare(recentLeavesQuery).all(user.department);

        res.json({
            totalEmployees,
            deptManagers,
            supervisors,
            operators,
            pendingLeaves,
            approvedLeaves,
            totalCourses,
            totalMandates,
            byShift,
            recentLeaves,
        });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحميل الإحصائيات' });
    }
});

// GET /api/stats/departments - Department statistics (general_manager only)
router.get('/departments', requireManager, (req: Request, res: Response) => {
    try {
        const departments = ['shifts', 'hr', 'operations', 'workforce'];
        const deptLabels: Record<string, string> = {
            shifts: 'إدارة المناوبات',
            hr: 'إدارة الموارد البشرية',
            operations: 'إدارة العمليات',
            workforce: 'إدارة القوى العاملة',
        };

        const result = departments.map(dept => {
            const totalEmployees = (db.prepare('SELECT COUNT(*) as count FROM employees WHERE department = ?').get(dept) as any).count;
            const manager = db.prepare("SELECT name FROM employees WHERE department = ? AND role = 'dept_manager' LIMIT 1").get(dept) as any;
            const supervisors = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE department = ? AND role = 'supervisor'").get(dept) as any).count;
            const operators = (db.prepare("SELECT COUNT(*) as count FROM employees WHERE department = ? AND role = 'operator'").get(dept) as any).count;
            const pendingLeaves = (db.prepare("SELECT COUNT(*) as count FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.status = 'pending' AND e.department = ?").get(dept) as any).count;
            const totalCourses = (db.prepare('SELECT COUNT(*) as count FROM courses c JOIN employees e ON c.employee_id = e.id WHERE e.department = ?').get(dept) as any).count;

            return {
                key: dept,
                name: deptLabels[dept],
                totalEmployees,
                managerName: manager?.name || 'لا يوجد مدير',
                supervisors,
                operators,
                pendingLeaves,
                totalCourses,
            };
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحميل إحصائيات الإدارات' });
    }
});

// GET /api/stats/activity - Activity log (manager only)
router.get('/activity', requireManager, (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const activities = db.prepare(`
            SELECT * FROM activity_log 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit);
        res.json(activities);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في تحميل سجل النشاطات' });
    }
});

export default router;
