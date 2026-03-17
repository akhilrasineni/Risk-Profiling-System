const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

function removeConsoles(filePath) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace one-liner arrow functions: .catch(err => console.error(err)) -> .catch(() => {})
  content = content.replace(/\.catch\(\s*([a-zA-Z0-9_]+)\s*=>\s*console\.(error|warn|log|info)\([^)]+\)\s*\)/g, '.catch(() => {})');
  
  // Replace one-liner arrow functions without parens: err => console.error(err) -> () => {}
  content = content.replace(/([a-zA-Z0-9_]+)\s*=>\s*console\.(error|warn|log|info)\([^)]+\)/g, '() => {}');

  // Replace multi-line console statements
  // We match console.(log|error|warn|info)( ... )
  // This regex matches `console.something(` and then everything up to the matching closing parenthesis and semicolon.
  // Since regex can't easily match nested parens, we'll use a simpler approach:
  // Match `console.something(` followed by any characters lazily until `);`
  content = content.replace(/console\.(log|error|warn|info)\([\s\S]*?\);?/g, '');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Processed', filePath);
  }
}

walk('./src', removeConsoles);
removeConsoles('./server.ts');
