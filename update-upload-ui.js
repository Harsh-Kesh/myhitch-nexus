const fs = require('fs');

let code = fs.readFileSync('src/app/studio/upload/page.tsx', 'utf8').replace(/\r\n/g, '\n');

// Add new imports
if (!code.includes('useSubscriptions')) {
  code = code.replace(
    'import { useUploadContext } from "@/components/upload/upload-provider";',
    'import { useUploadContext } from "@/components/upload/upload-provider";\nimport { useSubscriptions } from "@/lib/mock-api/hooks";'
  );
  code = code.replace(
    'import { IconChevronLeft, IconChevronRight, IconUpload, IconCloudUpload, IconCheck, IconX, IconAlertTriangle, IconPlayerPlay, IconMaximize, IconVolume, IconSettings, IconPhotoPlus, IconPlus, IconTrash } from "@tabler/icons-react";',
    'import { IconChevronLeft, IconChevronRight, IconUpload, IconCloudUpload, IconCheck, IconX, IconAlertTriangle, IconPlayerPlay, IconMaximize, IconVolume, IconSettings, IconPhotoPlus, IconPlus, IconTrash, IconLock } from "@tabler/icons-react";'
  );
}

// 1. Update limits checking logic
const limitRegex = /const { data: user } = useCurrentUser\(\);\n\s*const isEnterprise = Boolean\(user\?\.roles\.includes\("producer"\)\);\n\s*const isBusinessTrack = Boolean\(user\?\.roles\.some\(\(r\) => \["business", "creator", "enterprise"\]\.includes\(r\)\)\);\n\s*const maxDuration = isBusinessTrack \? 1800 : 600;/m;
const limitReplacement = `const { data: user } = useCurrentUser();
  const isEnterprise = Boolean(user?.roles.includes("producer"));
  const isEndUser = Boolean(user?.roles.includes("viewer"));
  const { data: subscriptions = [] } = useSubscriptions();
  const hasPaidBusinessPlan = subscriptions.some(s => s.status === 'active' && (s.plan === 'business' || s.plan === 'enterprise'));
  const maxDuration = isEndUser ? 600 : hasPaidBusinessPlan ? Infinity : 1200;`;
code = code.replace(limitRegex, limitReplacement);

// 2. Add new states
const stateRegex = /const \[scheduledFor, setScheduledFor\] = React\.useState\(""\);\n\s*const \[accessModels, setAccessModels\] = React\.useState<AccessModel\[\]>\(\["ad-supported"\]\);/m;
const stateReplacement = `const [scheduledFor, setScheduledFor] = React.useState("");
  const [isRentBuyActive, setIsRentBuyActive] = React.useState(false);
  const [rentPriceStr, setRentPriceStr] = React.useState("");
  const [buyPriceStr, setBuyPriceStr] = React.useState("");
  const [accessModels, setAccessModels] = React.useState<AccessModel[]>(["ad-supported"]);`;
code = code.replace(stateRegex, stateReplacement);

// 3. Update publishDraft payload
const payloadRegex = /pricing: \{\n\s*accessModels,\n\s*sponsored,/m;
const payloadReplacement = `pricing: {
        accessModels: isRentBuyActive ? ["rent", "buy"] : ["free", "ad-supported", "subscription"],
        rentPrice: isRentBuyActive && rentPriceStr ? { amount: Math.round(parseFloat(rentPriceStr) * 100), currency: "AUD" } : undefined,
        buyPrice: isRentBuyActive && buyPriceStr ? { amount: Math.round(parseFloat(buyPriceStr) * 100), currency: "AUD" } : undefined,
        sponsored,`;
code = code.replace(payloadRegex, payloadReplacement);

// 4. Update the Monetisation UI block
const uiRegex = /<p className="text-sm font-medium text-fg">Monetisation<\/p>[\s\S]+?<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*<div className="border-t border-border pt-5">/m;
const uiReplacement = `<p className="text-sm font-medium text-fg">Monetisation Model</p>
                          <p className="mt-1 text-xs text-fg-muted">
                            Choose how this video is distributed and monetised.
                          </p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {/* Option 1: Standard Distribution */}
                            <label
                                className={cn(
                                  "flex cursor-pointer gap-2.5 rounded border p-3 transition-colors",
                                  !isRentBuyActive
                                    ? "border-accent bg-accent/[0.07]"
                                    : "border-border bg-surface-2 hover:border-border-strong",
                                )}
                              >
                                <input
                                  type="radio"
                                  name="monetisation-model"
                                  checked={!isRentBuyActive}
                                  onChange={() => setIsRentBuyActive(false)}
                                  className="mt-0.5 size-4 shrink-0 border border-border-strong bg-surface accent-[rgb(var(--nx-accent))]"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-fg">
                                    Standard Distribution
                                  </span>
                                  <span className="mt-0.5 block text-xs text-fg-muted">
                                    Free for everyone with Ads, Ad-free for Premium users. You earn revenue from both.
                                  </span>
                                </span>
                            </label>

                            {/* Option 2: Direct Sale (Rent/Buy) */}
                            {!isEndUser ? (
                              <label
                                className={cn(
                                  "flex gap-2.5 rounded border p-3 transition-colors relative",
                                  isRentBuyActive
                                    ? "border-accent bg-accent/[0.07]"
                                    : "border-border bg-surface-2",
                                  !hasPaidBusinessPlan ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-border-strong"
                                )}
                              >
                                <input
                                  type="radio"
                                  name="monetisation-model"
                                  checked={isRentBuyActive}
                                  disabled={!hasPaidBusinessPlan}
                                  onChange={() => {
                                    if (hasPaidBusinessPlan) {
                                      setIsRentBuyActive(true);
                                    }
                                  }}
                                  className="mt-0.5 size-4 shrink-0 border border-border-strong bg-surface accent-[rgb(var(--nx-accent))]"
                                />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-2 text-sm font-medium text-fg">
                                    Direct Sale (Rent / Buy)
                                    {!hasPaidBusinessPlan && <IconLock className="size-4 text-fg-muted" />}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-fg-muted">
                                    Set a one-time price or rental fee for this video.
                                  </span>
                                  {!hasPaidBusinessPlan && (
                                     <Button size="xs" variant="secondary" className="mt-2" onClick={(e) => { e.preventDefault(); router.push('/plans'); }}>Upgrade to Business to sell directly</Button>
                                  )}
                                </span>
                              </label>
                            ) : null}
                          </div>

                          {isRentBuyActive && (
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <Field label="Rent price (AUD)" htmlFor="rentPrice" hint="Price for 48-hour access.">
                                <Input type="number" id="rentPrice" min="0" step="0.01" value={rentPriceStr} onChange={e => setRentPriceStr(e.target.value)} placeholder="4.99" />
                              </Field>
                              <Field label="Buy price (AUD)" htmlFor="buyPrice" hint="Price for lifetime access.">
                                <Input type="number" id="buyPrice" min="0" step="0.01" value={buyPriceStr} onChange={e => setBuyPriceStr(e.target.value)} placeholder="14.99" />
                              </Field>
                            </div>
                          )}
                        </div>
                        
                        <div className="border-t border-border pt-5">`;

code = code.replace(uiRegex, uiReplacement);
fs.writeFileSync('src/app/studio/upload/page.tsx', code);
