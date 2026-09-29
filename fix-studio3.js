const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8').replace(/\r\n/g, '\n');

code = code.replace(
  /\{\(\["draft", "private", "unlisted", "published", "archived"\] as ContentStatus\[\]\)\s*\.filter\(\(status\) => status !== row\.status\)\s*\.map\(\(status\) => \(/m,
  `{(() => {
              let valid: ContentStatus[] = [];
              switch (row.status) {
                case "draft": valid = ["private", "unlisted", "published", "scheduled"]; break;
                case "published": valid = ["private", "unlisted"]; break;
                case "private": valid = ["unlisted", "published", "scheduled", "draft"]; break;
                case "unlisted": valid = ["private", "published", "scheduled", "draft"]; break;
                case "scheduled": valid = ["private", "unlisted", "published", "draft"]; break;
                case "archived": valid = ["private", "unlisted"]; break;
              }
              return valid.map((status) => (`
);

code = code.replace(
  /<MenuSeparator \/>\s*<MenuItem\s*danger\s*icon=\{<IconTrash \/>\}/m,
  `{row.status !== "archived" && row.status !== "restricted" && row.status !== "rejected" ? (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<IconArchive />}
                  onClick={() => {
                    updateStatus.mutate({ videoId: row.id, status: "archived" });
                    toast({ title: "Archived" });
                  }}
                >
                  Archive
                </MenuItem>
              </>
            ) : null}
            <MenuSeparator />
            <MenuItem
              danger
              icon={<IconTrash />}`
);

if (!code.includes("IconArchive")) {
  code = code.replace("IconEdit,", "IconEdit,\n  IconArchive,");
}

fs.writeFileSync('src/app/studio/content/page.tsx', code);
