const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /                  \{status\}\n                <\/MenuItem>\n              \)\)\}/m,
  `                  {status}
                </MenuItem>
              ))
            })()}`
);

fs.writeFileSync('src/app/studio/content/page.tsx', code);
