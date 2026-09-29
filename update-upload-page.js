const fs = require('fs');
let code = fs.readFileSync('src/app/studio/upload/page.tsx', 'utf8').replace(/\r\n/g, '\n');

const isEnterpriseRegex = /const isEnterprise = Boolean\(user\?\.roles\.includes\("producer"\)\);/;
code = code.replace(isEnterpriseRegex, `const isEnterprise = Boolean(user?.roles.includes("producer"));
  const isBusinessTrack = Boolean(user?.roles.some((r) => ["business", "creator", "enterprise"].includes(r)));
  const maxDuration = isBusinessTrack ? 1800 : 600;`);

const fileInputRegex = /onChange=\{\(event\) => \{\n\s*const picked = event\.target\.files\?\.\[0\];\n\s*if \(picked\) startUpload\(\{ name: picked\.name, size: picked\.size, file: picked \}\);\n\s*\}\}/;
const fileInputReplacement = `onChange={(event) => {
                              const picked = event.target.files?.[0];
                              if (!picked) return;
                              
                              const url = URL.createObjectURL(picked);
                              const el = document.createElement(kind === "audio" ? "audio" : "video");
                              el.onloadedmetadata = () => {
                                URL.revokeObjectURL(url);
                                if (el.duration > maxDuration) {
                                  toast({
                                    title: "Video is too long",
                                    description: \`Your plan allows a maximum duration of \${Math.round(maxDuration / 60)} minutes.\`,
                                    tone: "error",
                                  });
                                  event.target.value = "";
                                  return;
                                }
                                startUpload({ name: picked.name, size: picked.size, file: picked });
                              };
                              el.onerror = () => {
                                // Fallback if browser can't parse duration, allow it through for server validation
                                startUpload({ name: picked.name, size: picked.size, file: picked });
                              };
                              el.src = url;
                            }}`;

code = code.replace(fileInputRegex, fileInputReplacement);

fs.writeFileSync('src/app/studio/upload/page.tsx', code);
