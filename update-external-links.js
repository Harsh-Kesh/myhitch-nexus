const fs = require('fs');

// Sponsorship (Exchange Hub)
let sponsorCode = fs.readFileSync('src/app/studio/sponsorship/page.tsx', 'utf8').replace(/\r\n/g, '\n');
sponsorCode = sponsorCode.replace(
  /<Button variant="primary" onClick=\{.*?setOpen\(true\).*?\}>\n\s*<IconPlus \/>\n\s*New listing\n\s*<\/Button>/,
  '<Button variant="primary" href="https://connect.myhitch.com" target="_blank">\n              <IconPlus />\n              Create on MYHitch Connect\n            </Button>'
);
fs.writeFileSync('src/app/studio/sponsorship/page.tsx', sponsorCode);

// Magazine (MYHitch Lens)
let magCode = fs.readFileSync('src/app/studio/magazine/page.tsx', 'utf8').replace(/\r\n/g, '\n');
magCode = magCode.replace(
  /<Button variant="primary" onClick=\{.*?setOpen\(true\).*?\}>\n\s*<IconPlus \/>\n\s*New analysis\n\s*<\/Button>/,
  '<Button variant="primary" href="https://lens.myhitch.com" target="_blank">\n              <IconPlus />\n              Write on MYHitch Lens\n            </Button>'
);
// Replace Magazine titles
magCode = magCode.replace(/title="Magazine"/g, 'title="MYHitch Lens"');
fs.writeFileSync('src/app/studio/magazine/page.tsx', magCode);
