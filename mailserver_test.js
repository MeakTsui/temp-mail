const POP3Server = require('lib/pop3/server')
const log = require('npmlog');
const MemoryCacheStore = require('./store/mem_cache_store')
const store = new MemoryCacheStore();

const serverOptions = {
    port: 110,
    host: 'localhost',

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
        callback(null,{})
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
        // only list messages in INBOX
        db.database.collection('mailboxes').findOne(
            {
                user: session.user.id,
                path: 'INBOX'
            },
            (err, mailbox) => {
                if (err) {
                    return callback(err);
                }

                if (!mailbox) {
                    return callback(new Error('Mailbox not found for user'));
                }

                session.user.mailbox = mailbox._id;

                db.redis
                    .multi()
                    // "new" limit store
                    .hget(`pxm:${session.user.id}`, mailbox._id.toString())
                    // fallback store
                    .hget(`pop3uid`, mailbox._id.toString())
                    .exec((err, res) => {
                        let lastIndex = res && ((res[0] && res[0][1]) || (res[1] && res[1][1]));

                        let query = {
                            mailbox: mailbox._id
                        };
                        if (!err && lastIndex && !isNaN(lastIndex)) {
                            query.uid = { $gte: Number(lastIndex) };
                        }

                        userHandler.userCache.get(session.user.id, 'pop3MaxMessages', config.pop3.maxMessages, (err, maxMessages) => {
                            if (err) {
                                return callback(err);
                            }

                            db.database
                                .collection('messages')
                                .find(query)
                                .project({
                                    uid: true,
                                    size: true,
                                    mailbox: true,
                                    // required to decide if we need to update flags after RETR
                                    flags: true,
                                    unseen: true
                                })
                                .sort({ uid: -1 })
                                .limit(maxMessages || MAX_MESSAGES)
                                .toArray((err, messages) => {
                                    if (err) {
                                        return callback(err);
                                    }

                                    let updateUIDIndex = done => {
                                        // first is the newest, last the oldest
                                        let oldestMessageData = messages && messages.length && messages[messages.length - 1];
                                        if (!oldestMessageData || !oldestMessageData.uid) {
                                            return done();
                                        }
                                        // try to update index, ignore result
                                        db.redis
                                            .multi()
                                            // update limit store
                                            .hset(`pxm:${session.user.id}`, mailbox._id.toString(), oldestMessageData.uid)
                                            // delete fallback store as it is no longer needed
                                            .hdel(`pop3uid`, mailbox._id.toString())
                                            .exec(done);
                                    };

                                    updateUIDIndex(() =>
                                        callback(null, {
                                            messages: messages
                                                // show older first
                                                .reverse()
                                                // compose message objects
                                                .map(message => ({
                                                    id: message._id.toString(),
                                                    uid: message.uid,
                                                    mailbox: message.mailbox,
                                                    size: message.size,
                                                    flags: message.flags,
                                                    seen: !message.unseen
                                                })),
                                            count: messages.length,
                                            size: messages.reduce((acc, message) => acc + message.size, 0)
                                        })
                                    );
                                });
                        });
                    });
            }
        );
    },

    onFetchMessage(message, session, callback) {
        userHandler.userCache.get(session.user.id, 'pop3MaxDownload', { setting: 'const:max:pop3:download' }, (err, limit) => {
            if (err) {
                return callback(err);
            }

            messageHandler.counters.ttlcounter('pdw:' + session.user.id, 0, limit, false, (err, res) => {
                if (err) {
                    return callback(err);
                }
                if (!res.success) {
                    let err = new Error('Download was rate limited');
                    err.response = 'NO';
                    err.code = 'DownloadRateLimited';
                    err.ttl = res.ttl;
                    err.responseMessage = `Download was rate limited. Try again in ${tools.roundTime(res.ttl)}.`;
                    return callback(err);
                }

                db.database.collection('messages').findOne(
                    {
                        _id: new ObjectId(message.id),
                        // shard key
                        mailbox: message.mailbox,
                        uid: message.uid
                    },
                    {
                        mimeTree: true,
                        size: true
                    },
                    (err, message) => {
                        if (err) {
                            return callback(err);
                        }
                        if (!message) {
                            return callback(new Error('Message does not exist or is already deleted'));
                        }

                        let response = messageHandler.indexer.rebuild(message.mimeTree);
                        if (!response || response.type !== 'stream' || !response.value) {
                            return callback(new Error('Can not fetch message'));
                        }

                        let limiter = new LimitedFetch({
                            key: 'pdw:' + session.user.id,
                            ttlcounter: messageHandler.counters.ttlcounter,
                            maxBytes: limit
                        });

                        response.value.pipe(limiter);
                        response.value.once('error', err => limiter.emit('error', err));

                        callback(null, limiter);
                    }
                );
            });
        });
    },

    onUpdate(update, session, callback) {
        let handleSeen = next => {
            if (update.seen && update.seen.length) {
                return markAsSeen(session, update.seen, next);
            }
            next(null, 0);
        };

        let handleDeleted = next => {
            if (update.deleted && update.deleted.length) {
                return trashMessages(session, update.deleted, next);
            }
            next(null, 0);
        };

        handleSeen((err, seenCount) => {
            if (err) {
                return log.error('POP3', err);
            }
            handleDeleted((err, deleteCount) => {
                if (err) {
                    return log.error('POP3', err);
                }
                log.info('POP3', '[%s] Deleted %s messages, marked %s messages as seen', session.user.username, deleteCount, seenCount);
            });
        });

        // return callback without waiting for the update result
        setImmediate(callback);
    }
}