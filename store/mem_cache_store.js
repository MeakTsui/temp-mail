const cache = require('memory-cache');

class MemoryCacheStore extends require('./store') {
  constructor() {
    super();
  }


    async save(user, mailbox, email) {
        return cache.put(`${user}_${mailbox}`, email)
    }

    async list(user, mailbox) {
        return cache.get(`${user}_${mailbox}`)
    }

    async latest(user, mailbox) {
        return await Promise.resolve(cache.get(`${user}_${mailbox}`))
    }

    async delete(user, mailbox, mailId) {
        return cache.del(`${user}_${mailbox}`)
    }
}

module.exports = MemoryCacheStore;