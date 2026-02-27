const http = require('http');

function request(method, path, body, cookie) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(cookie ? { Cookie: cookie } : {}),
            },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                const cookies = res.headers['set-cookie'];
                resolve({ status: res.statusCode, body: JSON.parse(data), cookie: cookies ? cookies[0].split(';')[0] : cookie });
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    console.log('=== اختبار API ===\n');

    // 1. Login
    console.log('1. تسجيل الدخول كمدير...');
    const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    console.log(`   النتيجة: ${login.status} - ${login.body.message}`);
    console.log(`   المستخدم: ${login.body.user.name} (${login.body.user.role})`);
    const cookie = login.cookie;

    // 2. Add employee
    console.log('\n2. إضافة موظف مشرف...');
    const emp1 = await request('POST', '/api/employees', {
        name: 'أحمد محمد', username: 'ahmed', password: '123456',
        role: 'supervisor', shift: 'أ', join_date: '2020-01-15'
    }, cookie);
    console.log(`   النتيجة: ${emp1.status} - ${emp1.body.message}`);

    // 3. Add operator
    console.log('\n3. إضافة موظف منفذ...');
    const emp2 = await request('POST', '/api/employees', {
        name: 'خالد عبدالله', username: 'khaled', password: '123456',
        role: 'operator', shift: 'أ', join_date: '2022-06-01'
    }, cookie);
    console.log(`   النتيجة: ${emp2.status} - ${emp2.body.message}`);

    // 4. List employees
    console.log('\n4. قائمة الموظفين...');
    const emps = await request('GET', '/api/employees', null, cookie);
    console.log(`   عدد الموظفين: ${emps.body.length}`);
    emps.body.forEach(e => console.log(`   - ${e.name} (${e.role}) مناوبة ${e.shift || '-'}`));

    // 5. Course nominations
    console.log('\n5. ترشيحات الدورات...');
    const noms = await request('GET', '/api/courses/nominations', null, cookie);
    console.log(`   عدد المرشحين: ${noms.body.length}`);
    noms.body.forEach((n, i) => console.log(`   ${i + 1}. ${n.name} - آخر دورة: ${n.last_course_date || 'لم يخرج أبداً'} - تعيين: ${n.join_date}`));

    // 6. Assign course
    console.log('\n6. إسناد دورة لأحمد...');
    const course = await request('POST', '/api/courses', {
        title: 'دورة السلامة المهنية', location: 'الرياض', date: '2026-03-15',
        employee_id: emp1.body.id
    }, cookie);
    console.log(`   النتيجة: ${course.status} - ${course.body.message}`);

    // 7. Check nominations again
    console.log('\n7. ترشيحات الدورات بعد الإسناد...');
    const noms2 = await request('GET', '/api/courses/nominations', null, cookie);
    noms2.body.forEach((n, i) => console.log(`   ${i + 1}. ${n.name} - آخر دورة: ${n.last_course_date || 'لم يخرج أبداً'}`));

    // 8. Login as employee
    console.log('\n8. تسجيل دخول كموظف (خالد)...');
    const empLogin = await request('POST', '/api/auth/login', { username: 'khaled', password: '123456' });
    const empCookie = empLogin.cookie;

    // 9. Request leave
    console.log('\n9. تقديم طلب إجازة...');
    const leave = await request('POST', '/api/leaves', {
        start_date: '2026-03-01', end_date: '2026-03-10'
    }, empCookie);
    console.log(`   النتيجة: ${leave.status} - ${leave.body.message}`);

    // 10. Manager approves leave
    console.log('\n10. المدير يوافق على الإجازة...');
    const approve = await request('PUT', `/api/leaves/${leave.body.id}/approve`, {}, cookie);
    console.log(`   النتيجة: ${approve.status} - ${approve.body.message}`);

    console.log('\n=== ✅ جميع الاختبارات نجحت! ===');
}

test().catch(console.error);
