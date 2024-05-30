const fs = require('fs');

class DomainChecker {
  constructor(domainsFilePath) {
    this.domains = [];
    this.loadDomainsFromFile(domainsFilePath);
  }

  loadDomainsFromFile(filePath) {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      this.domains = data.split('\n')
                        .map(domain => domain.trim())
                        .filter(Boolean); // 移除空白行
      console.log('Loaded domains:', this.domains);
    } catch (err) {
      console.error('Error loading domains:', err);
      process.exit(1);
    }
  }

  isDomainInList(domain) {
    return this.domains.includes(domain);
  }
}

module.exports = DomainChecker;