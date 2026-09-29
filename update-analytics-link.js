const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /<MenuItem href="\/studio\/analytics" icon=\{<IconChartBar \/>\}>/g,
  `<MenuItem href={\`/studio/analytics?videoId=\${row.id}\`} icon={<IconChartBar />}>`
);

fs.writeFileSync('src/app/studio/content/page.tsx', code);
