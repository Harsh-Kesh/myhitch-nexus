const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8');

code = code.replace(
  '                </MenuItem>\r\n              })()}',
  `                </MenuItem>\r\n              ))}\r\n            })()}`
);

code = code.replace(
  '                </MenuItem>\n              })()}',
  `                </MenuItem>\n              ))}\n            })()}`
);

fs.writeFileSync('src/app/studio/content/page.tsx', code);
