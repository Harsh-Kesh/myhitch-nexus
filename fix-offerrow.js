const fs = require('fs');
let code = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8');

code = code.replace(
  /onClick=\{\(\) => onRentOrBuy\("rent"\)\}/g,
  'onSelect={() => onRentOrBuy("rent")}'
);

code = code.replace(
  /onClick=\{\(\) => onRentOrBuy\("buy"\)\}/g,
  'onSelect={() => onRentOrBuy("buy")}'
);

fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', code);
