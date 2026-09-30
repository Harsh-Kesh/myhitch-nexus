const fs = require('fs');

// 1. Fix Button target in Sponsorship
let spCode = fs.readFileSync('src/app/studio/sponsorship/page.tsx', 'utf8').replace(/\r\n/g, '\n');
spCode = spCode.replace(
  /<Button variant="primary" href="https:\/\/connect\.myhitch\.com" target="_blank">/,
  '<Button variant="primary" onClick={() => window.open("https://connect.myhitch.com", "_blank")}>'
);
fs.writeFileSync('src/app/studio/sponsorship/page.tsx', spCode);

// 2. Fix Button target in Magazine
let magCode = fs.readFileSync('src/app/studio/magazine/page.tsx', 'utf8').replace(/\r\n/g, '\n');
magCode = magCode.replace(
  /<Button variant="primary" href="https:\/\/lens\.myhitch\.com" target="_blank">/,
  '<Button variant="primary" onClick={() => window.open("https://lens.myhitch.com", "_blank")}>'
);
fs.writeFileSync('src/app/studio/magazine/page.tsx', magCode);

// 3. Fix unused variables in Upload page by replacing the Monetisation UI
let upCode = fs.readFileSync('src/app/studio/upload/page.tsx', 'utf8').replace(/\r\n/g, '\n');
const upRegex = /<p className="text-sm font-medium text-fg">Monetisation<\/p>[\s\S]+?<\/span>\n\s*<\/label>\n\s*\)\)\}\n\s*<\/div>\n\s*<\/div>/m;
const upReplacement = `<p className="text-sm font-medium text-fg">Monetisation Model</p>
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
                                     <Button size="xs" variant="secondary" className="mt-2 block" onClick={(e) => { e.preventDefault(); router.push('/plans'); }}>Upgrade to Business to sell directly</Button>
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
                        </div>`;
upCode = upCode.replace(upRegex, upReplacement);
fs.writeFileSync('src/app/studio/upload/page.tsx', upCode);
