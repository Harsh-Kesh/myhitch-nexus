const fs = require('fs');
let code = fs.readFileSync('src/lib/server/videoPublishing.ts', 'utf8').replace(/\r\n/g, '\n');

const probeRegex = /const probe = await probeMasterAsset\(input\.masterAssetPath, input\.kind\);\n  if \(!probe\.ok\) \{\n    return \{ outcome: "invalid_file", reason: probe\.reason \};\n  \}/m;

const probeReplacement = `const probe = await probeMasterAsset(input.masterAssetPath, input.kind);
  if (!probe.ok) {
    return { outcome: "invalid_file", reason: probe.reason };
  }

  // Duration validation
  const roleRows = await query<{ role: string }>(\`select role from account_roles where account_id = $1\`, [accountId]);
  const isBusinessTrack = roleRows.some((r) => ["business", "creator", "enterprise"].includes(r.role));
  const maxDuration = isBusinessTrack ? 1800 : 600;

  if (probe.durationSeconds > maxDuration) {
    return { outcome: "invalid", reason: \`Video duration exceeds the maximum allowed limit of \${Math.round(maxDuration / 60)} minutes for your plan.\` };
  }`;

code = code.replace(probeRegex, probeReplacement);

fs.writeFileSync('src/lib/server/videoPublishing.ts', code);
