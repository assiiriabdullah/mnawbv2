const http = require('http');

const API_BASE = 'http://localhost:3000/api';
let cookie = '';

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_BASE + path);
        const options = {
            method: method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (cookie) {
            options.headers['Cookie'] = cookie;
        }

        const req = http.request(options, (res) => {
            let data = '';

            // Capture cookie
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                // Simple cookie parsing
                cookie = setCookie.map(c => c.split(';')[0]).join('; ');
            }

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: {} });
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('🚀 Starting Verification Tests (Node HTTP)...\n');

    try {
        // 1. Login as Manager
        console.log('1️⃣  Testing Login & Activity Log...');
        let res = await request('POST', '/auth/login', { username: 'admin', password: 'newpassword123' });

        if (res.status === 401) {
            console.log('   Using default password...');
            res = await request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
        }

        if (res.status !== 200) {
            console.error('❌ Login failed:', res.data);
            return;
        }
        console.log('✅ Login successful');

        // 2. Check Stats
        console.log('\n2️⃣  Testing Stats API...');
        res = await request('GET', '/stats');
        if (res.status === 200 && res.data.totalEmployees >= 1) {
            console.log(`✅ Stats fetched: ${res.data.totalEmployees} employees, ${res.data.totalCourses} courses`);
        } else {
            console.error('❌ Stats failed:', res.data);
        }

        res = await request('GET', '/stats/activity');
        if (res.status === 200 && res.data.length > 0) {
            const lastActivity = res.data[0];
            console.log(`✅ Activity log fetched. Last action: ${lastActivity.action} by ${lastActivity.user_name}`);
        } else {
            console.error('❌ Activity log failed:', res.data);
        }

        // 3. Create Test Employee
        console.log('\n3️⃣  Creating Test Employee...');
        const testUser = `testuser_${Date.now()}`;
        res = await request('POST', '/employees', {
            name: 'Test Employee',
            username: testUser,
            password: 'password123',
            role: 'operator',
            shift: 'أ',
            join_date: '2023-01-01'
        });

        if (res.status !== 201) {
            console.error('❌ Create employee failed:', res.data);
            return;
        }
        const empId = res.data.id;
        console.log(`✅ Employee created (ID: ${empId})`);

        // 4. Login Employee
        console.log('\n4️⃣  Testing Employee Balance & Leave Request...');
        await request('POST', '/auth/logout');
        cookie = '';

        res = await request('POST', '/auth/login', { username: testUser, password: 'password123' });
        if (res.status !== 200) {
            console.error('❌ Employee login failed:', res.data);
            return;
        }

        res = await request('GET', '/auth/me');
        const initialBalance = res.data.user.annual_leave_balance;
        console.log(`✅ Initial Balance: ${initialBalance} days`);

        // 5. Submit Leave
        const startDate = new Date().toISOString().split('T')[0];
        const endDate = new Date(Date.now() + 4 * 86400000).toISOString().split('T')[0];

        res = await request('POST', '/leaves', { start_date: startDate, end_date: endDate });
        if (res.status !== 201) {
            console.error('❌ Leave request failed:', res.data);
            return;
        }
        const leaveId = res.data.id;
        console.log(`✅ Leave requested (ID: ${leaveId}) for 5 days`);

        // 6. Approve Leave
        console.log('\n5️⃣  Testing Leave Approval & Balance Deduction...');
        await request('POST', '/auth/logout');
        cookie = '';

        res = await request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
        if (res.status === 401) res = await request('POST', '/auth/login', { username: 'admin', password: 'newpassword123' });

        res = await request('PUT', `/leaves/${leaveId}/approve`);
        if (res.status !== 200) {
            console.error('❌ Leave approval failed:', res.data);
            return;
        }
        console.log('✅ Leave approved');

        res = await request('GET', '/employees');
        const empData = res.data.find(e => e.id === empId);
        console.log(`✅ New Balance for employee: ${empData.annual_leave_balance} days`);

        if (empData.annual_leave_balance === initialBalance - 5) {
            console.log('✅ Balance deducted correctly (-5 days)');
        } else {
            console.error(`❌ Balance incorrect! Expected ${initialBalance - 5}, got ${empData.annual_leave_balance}`);
        }

        // 7. Password Change
        console.log('\n6️⃣  Testing Password Change...');
        await request('POST', '/auth/logout');
        cookie = '';

        res = await request('POST', '/auth/login', { username: testUser, password: 'password123' });

        res = await request('PUT', '/auth/change-password', {
            current_password: 'password123',
            new_password: 'newpassword456'
        });

        if (res.status === 200) {
            console.log('✅ Password changed successfully');
        } else {
            console.error('❌ Password change failed:', res.data);
            return;
        }

        // Verify Login
        await request('POST', '/auth/logout');
        cookie = '';

        res = await request('POST', '/auth/login', { username: testUser, password: 'newpassword456' });
        if (res.status === 200) {
            console.log('✅ Login with new password successful');
        } else {
            console.error('❌ Login with new password failed');
        }

        // Cleanup
        console.log('\n🧹 Cleaning up test data...');
        await request('POST', '/auth/logout');
        cookie = '';
        res = await request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
        if (res.status === 401) res = await request('POST', '/auth/login', { username: 'admin', password: 'newpassword123' });

        await request('DELETE', `/employees/${empId}`);
        console.log('✅ Test employee deleted');

        console.log('\n✨ All Tests Completed!');
    } catch (err) {
        console.error('❌ Unexpected Error:', err);
    }
}

runTests();
