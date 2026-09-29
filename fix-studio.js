const fs = require('fs');
let code = fs.readFileSync('src/app/studio/content/page.tsx', 'utf8');

code = code.replace(
  /\{ value: "pending", label: "Pending review", count: counts\.pending \?\? 0 \},\n\s*\{ value: "draft", label: "Drafts", count: counts\.draft \?\? 0 \},/,
  `{ value: "draft", label: "Drafts", count: counts.draft ?? 0 },
              { value: "private", label: "Private", count: counts.private ?? 0 },
              { value: "unlisted", label: "Unlisted", count: counts.unlisted ?? 0 },`
);

code = code.replace(
  /\{\(\["draft", "private", "unlisted", "published", "archived"\] as ContentStatus\[\]\)\n\s*\.filter\(\(status\) => status !== row\.status\)\n\s*\.map\(\(status\) => \(/m,
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
              return valid.map((status) => (
`
);

// Add direct archive option before delete
code = code.replace(
  /<MenuSeparator \/>\n\s*<MenuItem\n\s*danger\n\s*icon=\{<IconTrash \/>\}/m,
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

// We need IconArchive. Let's see if it is imported.
if (!code.includes("IconArchive")) {
  code = code.replace(
    /IconEdit,\n/,
    `IconEdit,\n  IconArchive,\n`
  );
}

fs.writeFileSync('src/app/studio/content/page.tsx', code);
