const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8');

// I am just going to delete the `})()}` that are misplaced and properly close the tags.
// Let's just find the exact block and replace it entirely!

const block = `          {(() => {
              let valid: ContentStatus[] = [];
              switch (row.status) {
                case "draft": valid = ["private", "unlisted", "published", "scheduled"]; break;
                case "published": valid = ["private", "unlisted"]; break;
                case "private": valid = ["unlisted", "published", "scheduled", "draft"]; break;
                case "unlisted": valid = ["private", "published", "scheduled", "draft"]; break;
                case "scheduled": valid = ["private", "unlisted", "published", "draft"]; break;
                case "archived": valid = ["private", "unlisted"]; break;
              }
              return valid.map((status) => (
              <MenuItem
                key={status}
                onClick={() => {
                  updateStatus.mutate({ videoId: row.id, status });
                  toast({ title: \`Moved to \${status}\` });
                }}
              >
                {status}
              </MenuItem>
            ))}
          })()}`;

const replacement = `          {(() => {
              let valid: ContentStatus[] = [];
              switch (row.status) {
                case "draft": valid = ["private", "unlisted", "published", "scheduled"]; break;
                case "published": valid = ["private", "unlisted"]; break;
                case "private": valid = ["unlisted", "published", "scheduled", "draft"]; break;
                case "unlisted": valid = ["private", "published", "scheduled", "draft"]; break;
                case "scheduled": valid = ["private", "unlisted", "published", "draft"]; break;
                case "archived": valid = ["private", "unlisted"]; break;
              }
              return valid.map((status) => (
                <MenuItem
                  key={status}
                  onClick={() => {
                    updateStatus.mutate({ videoId: row.id, status });
                    toast({ title: \`Moved to \${status}\` });
                  }}
                >
                  {status}
                </MenuItem>
              ));
          })()}`;

// We will use a regex to replace this entire block to avoid whitespace issues.
const regex = /\{\(\(\) => \{\s*let valid: ContentStatus\[\] = \[\];\s*switch \(row\.status\) \{\s*case "draft": valid = \["private", "unlisted", "published", "scheduled"\]; break;\s*case "published": valid = \["private", "unlisted"\]; break;\s*case "private": valid = \["unlisted", "published", "scheduled", "draft"\]; break;\s*case "unlisted": valid = \["private", "published", "scheduled", "draft"\]; break;\s*case "scheduled": valid = \["private", "unlisted", "published", "draft"\]; break;\s*case "archived": valid = \["private", "unlisted"\]; break;\s*\}\s*return valid\.map\(\(status\) => \(\s*<MenuItem\s*key=\{status\}\s*onClick=\{\(\) => \{\s*updateStatus\.mutate\(\{ videoId: row\.id, status \}\);\s*toast\(\{ title: `Moved to \$\{status\}` \}\);\s*\}\}\s*>\s*\{status\}\s*<\/MenuItem>\s*\)\)?(\})?\s*\}\)\(\)\}/m;

code = code.replace(regex, replacement);

fs.writeFileSync('src/app/studio/content/page.tsx', code);
