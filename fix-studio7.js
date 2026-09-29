const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8');

code = code.replace(
  /                <\/MenuItem>\n              \}\)\(\)\}/m,
  `                </MenuItem>
              ))}
            })()}`
);

fs.writeFileSync('src/app/studio/content/page.tsx', code);
