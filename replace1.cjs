const fs = require('fs');
let content = fs.readFileSync('src/services/aiService.ts', 'utf8');

content = content.replace(/const ai = this\.getClient\(\);\s+const result = await this\.executeWithModel\(async \(model\) => \{\s+return ai\.models\.generateContent\(\{\s+model,\s+contents: \[\{ parts: \[\{ text: prompt \}\] \}\],\s+config: \{\s+responseMimeType: "application\/json"\s+\}\s+\}\);\s+\}, modelOverride\);\s+const aiResponse = result\.text \|\| "\{\}";/g, 
`const aiResponse = await this.generateContent(
      prompt,
      { responseMimeType: "application/json" },
      modelOverride
    );`);

fs.writeFileSync('src/services/aiService.ts', content);
