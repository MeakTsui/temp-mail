class Store {
    async save(user, mailbox, email) {
        throw new Error('函数需要实现')
    }

    async list(user, mailbox) {
        throw new Error('函数需要实现')
    }

    async latest(user, mailbox) {
        throw new Error('函数需要实现')
    }

    async delete(user, mailbox, mailId) {
        throw new Error('函数需要实现')
    }

}

module.exports = Store;