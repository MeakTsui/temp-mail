const {SMTPServer} = require('smtp-server')
const simpleParser = require('mailparser').simpleParser
const SQLiteStore = require('./store/sqlite_store')
const DomainChecker = require('./utils/domain_checker');

// 初始化域名检查器
const domainChecker = new DomainChecker('domains.txt');

// 根据需要选择持久化策略
// 选择MemoryCacheStrategy, RedisStrategy, 或 SQLiteStrategy
const store = new SQLiteStore();

const server = new SMTPServer({
    authOptional: true,
    onConnect(session, callback) {
        console.log('connect :',session.remoteAddress)
        callback(null, session);
    },
    onAuth(auth, session, callback) {
        callback(null, {user: auth.username}); // where 123 is the user id or similar property
    },
    async onData(stream, session, callback) {
        // 当有邮件数据传入时触发
        let mailData = '';
        stream.on('data', (data) => {
            mailData += data.toString('utf8');
        });
        stream.on('end', async () => {
            console.log('received email:', mailData)

            let mail = await simpleParser(mailData)
            const fromAddress = mail.from.value[0].address
            const toAddresses = mail.to.value.map(to => {
                return {
                    'address': to.address,
                    'domain': to.address.split('@')[1]
                }
            })

            // 使用DomainChecker检查域名
            const hostedIncoming = toAddresses.filter(address => domainChecker.isDomainInList(address.domain));

            const mailbox = 'INBOX'
            const user = hostedIncoming.length > 0 ? hostedIncoming[0].address : fromAddress
            await store.save(user, mailbox, mailData)

            callback();
        });
    }
});

server.listen(25, () => {
    console.log('SMTP Server is ready on port 25');
});