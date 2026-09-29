const fs = require('fs');
let code = fs.readFileSync('src/app/api/studio/uploads/route.ts', 'utf8').replace(/\r\n/g, '\n');

// 1. Add durationSeconds to CreateUploadBody
code = code.replace(
  /interface CreateUploadBody \{\n  channelId\?: string;\n  fileName\?: string;\n  fileSizeBytes\?: number;\n  kind\?: "video" \| "audio";\n\}/,
  `interface CreateUploadBody {
  channelId?: string;
  fileName?: string;
  fileSizeBytes?: number;
  kind?: "video" | "audio";
  durationSeconds?: number;
}`
);

// 2. Validate duration
const validationRegex = /if \(!body\.channelId \|\| !body\.fileName \|\| !body\.fileSizeBytes\) \{\n    return NextResponse\.json\(\{ error: "channelId, fileName and fileSizeBytes are required\." \}, \{ status: 400 \}\);\n  \}/;

const validationReplacement = `if (!body.channelId || !body.fileName || !body.fileSizeBytes) {
    return NextResponse.json({ error: "channelId, fileName and fileSizeBytes are required." }, { status: 400 });
  }

  // Duration validation based on plan/role
  const isBusinessTrack = account.roles.some((r) => ["business", "creator", "enterprise"].includes(r));
  const maxDuration = isBusinessTrack ? 1800 : 600; // 30 mins for Business track, 10 mins for End User track

  if (body.durationSeconds !== undefined && body.durationSeconds > maxDuration) {
    return NextResponse.json(
      { error: \`Video duration exceeds the maximum allowed limit of \${Math.round(maxDuration / 60)} minutes for your plan.\` },
      { status: 400 }
    );
  }`;

code = code.replace(validationRegex, validationReplacement);

fs.writeFileSync('src/app/api/studio/uploads/route.ts', code);
