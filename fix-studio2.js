const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8').replace(/\r\n/g, '\n');

const target1 = `            {(["draft", "private", "unlisted", "published", "archived"] as ContentStatus[])
              .filter((status) => status !== row.status)
              .map((status) => (`;

const replace1 = `            {(() => {
              let valid: ContentStatus[] = [];
              switch (row.status) {
                case "draft": valid = ["private", "unlisted", "published", "scheduled"]; break;
                case "published": valid = ["private", "unlisted"]; break;
                case "private": valid = ["unlisted", "published", "scheduled", "draft"]; break;
                case "unlisted": valid = ["private", "published", "scheduled", "draft"]; break;
                case "scheduled": valid = ["private", "unlisted", "published", "draft"]; break;
                case "archived": valid = ["private", "unlisted"]; break;
              }
              return valid.map((status) => (`;

code = code.replace(target1, replace1);

const target2 = `            <MenuSeparator />
            <MenuItem
              danger
              icon={<IconTrash />}`;

const replace2 = `            {row.status !== "archived" && row.status !== "restricted" && row.status !== "rejected" ? (
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
              icon={<IconTrash />}`;

code = code.replace(target2, replace2);

if (!code.includes("IconArchive")) {
  code = code.replace("IconEdit,", "IconEdit,\n  IconArchive,");
}

fs.writeFileSync('src/app/studio/content/page.tsx', code);
