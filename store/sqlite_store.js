const sqlite3 = require('sqlite3').verbose();
const simpleParser = require('mailparser').simpleParser

class SQLiteStore extends require('./store') {
    constructor(dbPath = './emails.db') {
        super();
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(err.message);
            }
            this.initDB();
        });
    }

    initDB() {
        const sqlInit = `
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT NOT NULL,
        mailbox TEXT NOT NULL,
        subject TEXT,
        raw_content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
        this.db.run(sqlInit);
    }


    async list(user, mailbox) {
        if (!user) {
            return reject(new Error('user not found'));
        }
        user = user.toLowerCase()
        let sql = 'SELECT * FROM emails WHERE user = ?';
        let params = [user];
        if (mailbox) {
            sql += ' AND mailbox = ?';
            params.push(mailbox);
        }
        sql += ' ORDER BY timestamp DESC';

        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async latest(user, mailbox) {
        return new Promise((resolve, reject) => {
            if (!user) {
                return reject(new Error('user not found'));
            }
            user = user.toLowerCase();
            let sql = 'SELECT * FROM emails WHERE user = ?';
            let params = [user];
            if (mailbox) {
                sql += ' AND mailbox = ?';
                params.push(mailbox);
            }
            sql += ' ORDER BY timestamp DESC LIMIT 1';
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    async delete(user, mailbox, mailId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM emails WHERE id = ?';
            this.db.run(sql, mailId, function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async save(user, mailbox, content) {
        const email = await simpleParser(content);
        if (!user) {
            return reject(new Error('user not found'));
        }
        user = user.toLowerCase()
        const sqlInsert = 'INSERT INTO emails (user, mailbox, subject, raw_content) VALUES (?, ?, ?, ?)';

        return new Promise((resolve, reject) => {
            this.db.run(sqlInsert, [user, mailbox, email.subject, content], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async cleanOldEmails(days) {
        return new Promise((resolve, reject) => {
            const sql = `DELETE FROM emails WHERE timestamp < datetime('now', '-' || ? || ' days')`;
            this.db.run(sql, [days], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }
}

module.exports = SQLiteStore;