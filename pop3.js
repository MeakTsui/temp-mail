const POP3Server = require('./lib/pop3/server')
const log = require('npmlog');
const SQLiteStore = require('./store/sqlite_store')
const store = new SQLiteStore();
const {Readable} = require('stream')
const os = require("os")
const config = require('./config')

// 字符串转换为Stream
function stringToStream(str) {
    return new Readable({
        read() {
            if (str) {
                this.push(str)
            }
            this.push(null); // 表示数据已经读取完毕
        }
    });
}


const serverOptions = {
    secure: false,
    secured: false,

    disableSTARTTLS: true,
    ignoreSTARTTLS: true,

    id: {
        name: 'temp-server',
        version: '1.0.0',
    },

    SNICallback(servername, cb) {
        // certs
        //     .getContextForServername(
        //         servername,
        //         serverOptions,
        //         {
        //             source: 'pop3'
        //         },
        //         {
        //             loggelf: message => loggelf(message)
        //         }
        //     )
        //     .then(context => cb(null, context))
        //     .catch(err => cb(err));
    },

    // log to console
    logger: {
        info(...args) {
            args.shift();
            log.info('POP3', ...args);
        },
        debug(...args) {
            args.shift();
            log.silly('POP3', ...args);
        },
        error(...args) {
            args.shift();
            log.error('POP3', ...args);
        }
    },

    onAuth(auth, session, callback) {
        callback(null, {
            user: {
                id: auth.username,
                username: auth.username
            }
        })
        // userHandler.authenticate(
        //     auth.username,
        //     auth.password,
        //     'pop3',
        //     {
        //         protocol: 'POP3',
        //         sess: session.id,
        //         ip: session.remoteAddress
        //     },
        //     (err, result) => {
        //         if (err) {
        //             return callback(err);
        //         }
        //
        //         if (!result) {
        //             return callback();
        //         }
        //
        //         if (result.scope === 'master' && result.require2fa) {
        //             // master password not allowed if 2fa is enabled!
        //             return callback();
        //         }
        //
        //         callback(null, {
        //             user: {
        //                 id: result.user,
        //                 username: result.username
        //             }
        //         });
        //     }
        // );
    },

    onListMessages(session, callback) {
        store.latest(session.user.id, "INBOX")
            .then(msg => {
                callback(null, {
                    messages: msg == null ? [] : ([msg]
                        .map(message => ({
                            id: message.id.toString(),
                            uid: message.user,
                            mailbox: message.mailbox,
                            size: message['raw_content'].length,
                            flags: [],
                            seen: false
                        }))),
                    count: msg == null ? 0 : 1,
                    size: msg == null ? 0 : msg['raw_content'].length
                })
            }).catch(e => callback(e))
    },

    onFetchMessage(message, session, callback) {
        store.latest(session.user.id, "INBOX").then(msg => {
            const stream = stringToStream(msg['raw_content']);
            callback(null, stream)
        }).catch(err => callback(err))
    },

    onUpdate(update, session, callback) {
        callback(null, false);
    }
}

const server = new POP3Server(serverOptions);

const component = 'temp-server';
const hostname = os.hostname();

const gelf = {
    // placeholder
    emit: (key, message) => log.info('Gelf', JSON.stringify(message))
}

const loggelf = message => {
    if (typeof message === 'string') {
        message = {
            short_message: message
        };
    }
    message = message || {};

    if (!message.short_message || message.short_message.indexOf(component.toUpperCase()) !== 0) {
        message.short_message = component.toUpperCase() + ' ' + (message.short_message || '');
    }

    message.facility = component; // facility is deprecated but set by the driver if not provided
    message.host = hostname;
    message.timestamp = Date.now() / 1000;
    message._component = component;
    Object.keys(message).forEach(key => {
        if (!message[key]) {
            delete message[key];
        }
    });
    gelf.emit('gelf.log', message);
};

server.loggelf = loggelf

server.on('error', err => {
    if (!started) {
        started = true;
        return done(err);
    }
    log.error('POP3', err.message);
});

server.listen(config.pop3Port, '0.0.0.0', () => {
    // if (started) {
    //     return server.close();
    // }
    // started = true;
    // done(null, server);
});