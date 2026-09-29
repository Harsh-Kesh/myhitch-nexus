const fs = require('fs');
let code = fs.readFileSync('src/app/(public)/plans/plans-client.tsx', 'utf8').replace(/\r\n/g, '\n');

const stateRegex = /const \[pendingChange, setPendingChange\] = React\.useState<\{ plan: PlanId; interval: Interval \} \| null>\(null\);/m;
const stateReplacement = `const [pendingChange, setPendingChange] = React.useState<{ plan: PlanId; interval: Interval } | null>(null);
  const [selectedTrack, setSelectedTrack] = React.useState<"end-user" | "business">("end-user");`;
code = code.replace(stateRegex, stateReplacement);

const trackEffectRegex = /const isEnterprise = Boolean\([\s\S]*?\);\n/m;
const trackEffectReplacement = `const isEnterprise = Boolean(
    currentUser?.roles.includes("enterprise") ||
      currentUser?.roles.includes("producer") ||
      currentUser?.activeRole === "enterprise",
  );

  const defaultTrack = isBusiness || isEnterprise || isCreator ? "business" : "end-user";
  React.useEffect(() => {
    if (currentUser) {
      setSelectedTrack(defaultTrack);
    }
  }, [currentUser, defaultTrack]);

  const filteredPlans = PLANS.filter(p => {
    if (selectedTrack === "end-user") return ["free", "premium", "family"].includes(p.id);
    return ["creator", "business", "enterprise"].includes(p.id);
  });
`;
code = code.replace(trackEffectRegex, trackEffectReplacement);

const mapRegex = /<div className="mx-auto mt-10 grid max-w-7xl gap-8 lg:grid-cols-3">\n\s*\{PLANS\.map\(\(plan\) => \{/m;
const mapReplacement = `<div className="mx-auto mt-10 grid max-w-7xl gap-8 lg:grid-cols-3">
        {filteredPlans.map((plan) => {`;
code = code.replace(mapRegex, mapReplacement);

const intervalToggleRegex = /<div className="mt-6 flex justify-center">\n\s*<div className="inline-flex rounded-full border border-border bg-surface-2 p-1">/m;
const intervalToggleReplacement = `<div className="mt-6 flex flex-col items-center gap-4">
        {!currentUser && (
          <div className="inline-flex rounded-full border border-border bg-surface-2 p-1">
            <button
              type="button"
              onClick={() => setSelectedTrack("end-user")}
              className={\`rounded-full px-4 py-1.5 text-sm font-medium transition-colors \${
                selectedTrack === "end-user" ? "bg-accent text-accent-fg" : "text-fg-muted"
              }\`}
            >
              Personal
            </button>
            <button
              type="button"
              onClick={() => setSelectedTrack("business")}
              className={\`rounded-full px-4 py-1.5 text-sm font-medium transition-colors \${
                selectedTrack === "business" ? "bg-accent text-accent-fg" : "text-fg-muted"
              }\`}
            >
              Business
            </button>
          </div>
        )}
        <div className="inline-flex rounded-full border border-border bg-surface-2 p-1">`;
code = code.replace(intervalToggleRegex, intervalToggleReplacement);

// Also need to rename `creator` to `creator` plan id, which already exists (`id: "creator"` might not exist, let's check).
// Wait, is there a plan with `id: "creator"`?
// The name was "Nexus Creator" so `id` might be "creator"?
// Let's check `PLANS` in the file.
fs.writeFileSync('src/app/(public)/plans/plans-client.tsx', code);
