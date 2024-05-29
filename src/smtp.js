const { SMTPServer } = require('smtp-server')
const simpleParser = require('mailparser').simpleParser

const server = new SMTPServer({
  authOptional: true,
  async onData(stream, session, callback) {
    let parsed = await simpleParser(stream)
    console.log('内容:', parsed)
  }
});

server.listen(25, () => {
  console.log('SMTP Server is ready on port 25');
});