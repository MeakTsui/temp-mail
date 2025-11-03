// 导入所需模块
const Koa = require('koa');
const Router = require('koa-router');
const simpleParser = require('mailparser').simpleParser
const SQLiteStore = require('./store/sqlite_store')
const ctx = require("koa/lib/context")
const config = require("./config")

// 初始化Koa应用和路由器
const app = new Koa();
const router = new Router();
const store = new SQLiteStore();

// 设置定时清理任务 - 每天凌晨3点执行
const scheduleCleanup = async () => {
    try {
        const deletedCount = await store.cleanOldEmails(3);
        console.log(`[${new Date().toISOString()}] Cleaned up ${deletedCount} emails older than 3 days`);
    } catch (error) {
        console.error('[Cleanup Error]', error);
    }
};

// 立即执行一次清理
scheduleCleanup();

// 设置定时任务 - 每天凌晨3点执行
const scheduleDailyCleanup = () => {
    const now = new Date();
    const night = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // 明天
        3, // 凌晨3点
        0,
        0
    );
    const timeToNext = night.getTime() - now.getTime();
    
    // 设置第一次执行的定时器
    setTimeout(() => {
        scheduleCleanup();
        // 设置后续每24小时执行一次
        setInterval(scheduleCleanup, 24 * 60 * 60 * 1000);
    }, timeToNext);
};

scheduleDailyCleanup();

// 定义路由，用于获取指定邮箱的邮件
// router.get('/emails/:email/latest', async ctx => {
//     const email = ctx.params.email;
//     try {
//         const result = await store.latest(email, 'INBOX')
//         if (result) {
//             ctx.status = 200
//             ctx.body = result['raw_content']
//         }
//     } catch (error) {
//         ctx.status = 500
//         ctx.body = {error: 'Internal Server Error'}
//     }
// });

router.get('/emails/:email/latest', async ctx => {
    const email = ctx.params.email;
    try {
        const pretty = ctx.query.pretty
        const result = await store.latest(email, 'INBOX')
        if (result) {
            ctx.status = 200;
            if (pretty !== undefined) {
                let mail = await simpleParser(result['raw_content'])
                if (mail.html) {
                    ctx.body = `${mail.html}`
                } else {
                    ctx.body = mail.textAsHtml
                }

            } else {
                ctx.body = result['raw_content'];
            }
        }
    } catch (error) {
        ctx.status = 500
        ctx.body = {error: 'Internal Server Error'}
    }
});

// 应用路由中间件
app.use(router.routes()).use(router.allowedMethods())

// 启动Koa应用
const port = config.httpPort;
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`)
    console.log(`Local access: http://localhost:${port}`)
});