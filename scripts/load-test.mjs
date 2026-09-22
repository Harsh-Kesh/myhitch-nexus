// Load test runner for NFR-3 (Scalability & Performance)
// Usage: node --env-file=.env.local scripts/load-test.mjs [baseUrl] [concurrency] [totalRequests]

const BASE_URL = process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const CONCURRENCY = Number(process.argv[3]) || 15;
const TOTAL_REQUESTS = Number(process.argv[4]) || 150;

const ROUTES = [
  "/",
  "/explore",
  "/films",
  "/music",
  "/podcasts",
  "/plans",
  "/search?q=saltmarsh",
  "/api/videos",
  "/video/vid_saltmarsh",
];

async function runBenchmark() {
  console.log("==================================================");
  console.log(`Starting NFR-3 Load Test on: ${BASE_URL}`);
  console.log(`Concurrency: ${CONCURRENCY}, Total Requests: ${TOTAL_REQUESTS}`);
  console.log("Routes under test:", ROUTES.join(", "));
  console.log("==================================================\n");

  const results = [];
  let completed = 0;
  let inFlight = 0;
  let routeIndex = 0;

  const startTime = performance.now();

  async function worker() {
    while (completed + inFlight < TOTAL_REQUESTS) {
      const currentRoute = ROUTES[routeIndex % ROUTES.length];
      routeIndex++;
      inFlight++;

      const reqStart = performance.now();
      let status = 0;
      let ok = false;

      try {
        const res = await fetch(`${BASE_URL}${currentRoute}`, {
          headers: { "User-Agent": "MYHitch-LoadTester/1.0" },
        });
        status = res.status;
        ok = res.ok;
        await res.text(); // consume body
      } catch (err) {
        status = 500;
        ok = false;
      } finally {
        const reqEnd = performance.now();
        inFlight--;
        completed++;
        results.push({
          route: currentRoute,
          duration: reqEnd - reqStart,
          status,
          ok,
        });

        if (completed % 25 === 0 || completed === TOTAL_REQUESTS) {
          process.stdout.write(`Progress: ${completed}/${TOTAL_REQUESTS} requests completed...\r`);
        }
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = performance.now() - startTime;
  const totalDurationSec = totalDurationMs / 1000;

  console.log("\n\n================ Benchmark Summary ================");
  const successful = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const durations = results.map((r) => r.duration).sort((a, b) => a - b);

  const min = durations[0].toFixed(1);
  const p50 = durations[Math.floor(durations.length * 0.5)].toFixed(1);
  const p90 = durations[Math.floor(durations.length * 0.9)].toFixed(1);
  const p95 = durations[Math.floor(durations.length * 0.95)].toFixed(1);
  const p99 = durations[Math.floor(durations.length * 0.99)].toFixed(1);
  const max = durations[durations.length - 1].toFixed(1);
  const avg = (durations.reduce((sum, d) => sum + d, 0) / durations.length).toFixed(1);
  const rps = (completed / totalDurationSec).toFixed(1);

  console.log(`Total Requests:    ${completed}`);
  console.log(`Successful (2xx):  ${successful} (${((successful / completed) * 100).toFixed(1)}%)`);
  console.log(`Failed (Non-2xx):  ${failed} (${((failed / completed) * 100).toFixed(1)}%)`);
  console.log(`Total Time:        ${totalDurationSec.toFixed(2)}s`);
  console.log(`Throughput:        ${rps} req/sec`);
  console.log("\nLatency Distribution (ms):");
  console.log(`  Min:   ${min} ms`);
  console.log(`  Avg:   ${avg} ms`);
  console.log(`  p50:   ${p50} ms`);
  console.log(`  p90:   ${p90} ms`);
  console.log(`  p95:   ${p95} ms`);
  console.log(`  p99:   ${p99} ms`);
  console.log(`  Max:   ${max} ms`);

  console.log("\nBreakdown by Route:");
  for (const route of ROUTES) {
    const routeResults = results.filter((r) => r.route === route);
    if (routeResults.length === 0) continue;
    const rDurations = routeResults.map((r) => r.duration).sort((a, b) => a - b);
    const rP50 = rDurations[Math.floor(rDurations.length * 0.5)].toFixed(1);
    const rP95 = rDurations[Math.floor(rDurations.length * 0.95)].toFixed(1);
    const rOk = routeResults.filter((r) => r.ok).length;
    console.log(
      `  ${route.padEnd(25)}: ${routeResults.length} reqs | ${rOk}/${routeResults.length} ok | p50: ${rP50}ms | p95: ${rP95}ms`,
    );
  }
  console.log("==================================================\n");

  if (failed > 0) {
    console.error(`Warning: ${failed} requests failed during load test.`);
    process.exit(1);
  } else {
    console.log("NFR-3 Load Test Passed with 100% success rate.");
  }
}

runBenchmark();
