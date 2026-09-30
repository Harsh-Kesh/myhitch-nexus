const fs = require('fs');

let indexTs = fs.readFileSync('src/lib/mock-api/index.ts', 'utf8').replace(/\r\n/g, '\n');

const newCheckoutFn = `
export async function startCheckout(videoId: string, kind: "buy" | "rent" | "ppv"): Promise<void> {
  if (store.loggedIn && looksLikeRealId(store.user.id)) {
    const res = await fetch(\`/api/videos/\${videoId}/checkout\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return new Promise<void>(() => {});
      }
    }
    const err = await res.json().catch(() => ({ error: "Checkout failed" }));
    throw new Error(err.error || "Checkout failed");
  }
  
  // Mock behavior
  await delay(800);
  // Just simulate success by not throwing
  return;
}
`;

indexTs = indexTs.replace(
  /export async function startSubscription/,
  newCheckoutFn + '\nexport async function startSubscription'
);

fs.writeFileSync('src/lib/mock-api/index.ts', indexTs);


let hooksTs = fs.readFileSync('src/lib/mock-api/hooks.ts', 'utf8').replace(/\r\n/g, '\n');
const newCheckoutHook = `
export function useCheckout() {
  return useMutation({
    mutationFn: ({ videoId, kind }: { videoId: string; kind: "buy" | "rent" | "ppv" }) => 
      api.startCheckout(videoId, kind),
  });
}
`;

hooksTs = hooksTs.replace(
  /export function useStartSubscription/,
  newCheckoutHook + '\nexport function useStartSubscription'
);

fs.writeFileSync('src/lib/mock-api/hooks.ts', hooksTs);
