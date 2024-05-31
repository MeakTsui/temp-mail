const Pop3Command = require('node-pop3');

async function fetchData() {
    const pop3Command = new Pop3Command({
        user: 'test@sheshopping.life',
        password: 'password',
        host: 'mail.sheshopping.life',
        port: '110'
    });

    let emailsList = await pop3Command.UIDL();  // fetch list of all emails
    console.log(emailsList)
    let msg = await pop3Command.RETR(1);  // fetch the email content
    console.log(msg)
    await pop3Command.QUIT()
}

fetchData(); // 调用这个异步函数