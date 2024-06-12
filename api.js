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


// 定义路由，用于获取指定邮箱的邮件
router.get('/emails/:email/latest', async ctx => {
    const email = ctx.params.email;
    try {
        const result = await store.latest(email, 'INBOX')
        if (result) {
            ctx.status = 200
            ctx.body = result['raw_content']
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
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
});