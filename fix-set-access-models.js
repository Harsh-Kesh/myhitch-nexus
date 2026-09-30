const fs = require('fs');

let code = fs.readFileSync('src/app/studio/upload/page.tsx', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(/if \(d\.accessModel\) setAccessModels\(\[d\.accessModel as AccessModel\]\);/g, 'if (d.accessModel) setIsRentBuyActive(d.accessModel === "rent" || d.accessModel === "buy");');

fs.writeFileSync('src/app/studio/upload/page.tsx', code);
