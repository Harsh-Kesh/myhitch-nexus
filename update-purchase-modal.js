const fs = require('fs');

let vc = fs.readFileSync('src/app/(public-video)/video/[id]/video-client.tsx', 'utf8').replace(/\r\n/g, '\n');

// 1. Add useCheckout import
if (!vc.includes('useCheckout')) {
  vc = vc.replace(
    /useStartSubscription,\n/,
    'useStartSubscription,\n  useCheckout,\n'
  );
}

// 2. Add useCheckout hook
vc = vc.replace(
  /const startSubscription = useStartSubscription\(\);\n/,
  'const startSubscription = useStartSubscription();\n  const checkout = useCheckout();\n'
);

// 3. Add handleRentOrBuy method
const handleRentOrBuy = `
  const handleRentOrBuy = async (kind: "rent" | "buy") => {
    if (!requireSignIn(\`Sign in to \${kind} this video.\`)) return;
    try {
      await checkout.mutateAsync({ videoId, kind });
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        tone: "error",
      });
      return;
    }
  };
`;

vc = vc.replace(
  /const requestSubscribe = \(plan: "premium" \| "family"\) => \{/,
  handleRentOrBuy + '\n  const requestSubscribe = (plan: "premium" | "family") => {'
);

// 4. Update PurchaseModal props
vc = vc.replace(
  /loading=\{startSubscription\.isPending\}/g,
  'loading={startSubscription.isPending || checkout.isPending}'
);

vc = vc.replace(
  /onSubscribe=\{requestSubscribe\}/,
  'onSubscribe={requestSubscribe}\n          onRentOrBuy={handleRentOrBuy}'
);

vc = vc.replace(
  /onSubscribe: \(plan: "premium" \| "family"\) => void;\n  \}\) \{/,
  'onSubscribe: (plan: "premium" | "family") => void;\n    onRentOrBuy: (kind: "rent" | "buy") => void;\n  }) {'
);

// 5. Update PurchaseModal UI
const rentBuyUI = `
          {video.pricing?.rentPrice && (
            <OfferRow
              title="Rent Video"
              description={\`48-hour access to \${video.title}\`}
              price={\`$\${(video.pricing.rentPrice.amount / 100).toFixed(2)} \${video.pricing.rentPrice.currency}\`}
              icon={<IconPlay />}
              loading={loading}
              onClick={() => onRentOrBuy("rent")}
            />
          )}
          {video.pricing?.buyPrice && (
            <OfferRow
              title="Buy Video"
              description={\`Lifetime access to \${video.title}\`}
              price={\`$\${(video.pricing.buyPrice.amount / 100).toFixed(2)} \${video.pricing.buyPrice.currency}\`}
              icon={<IconStarFilled />}
              loading={loading}
              onClick={() => onRentOrBuy("buy")}
            />
          )}
`;

vc = vc.replace(
  /<OfferRow\n\s*title="Nexus Premium"/,
  rentBuyUI + '\n          <OfferRow\n            title="Nexus Premium"'
);

fs.writeFileSync('src/app/(public-video)/video/[id]/video-client.tsx', vc);
